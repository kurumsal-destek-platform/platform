using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Platform.Api;
using Platform.Application;
using Platform.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Gizli anahtar: geliştirmede varsayılan kullanılabilir; canlı ortamda (Production) mutlaka .env'den gelmeli
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("Jwt:Key tanımlı değil. .env dosyasında JWT_KEY (en az 32 karakter) belirleyin.");
    jwtKey = "gelistirme-icin-en-az-32-karakterlik-gizli-anahtar-123";
}
if (jwtKey.Length < 32) throw new InvalidOperationException("Jwt:Key en az 32 karakter olmalı.");
if (!builder.Environment.IsDevelopment() && jwtKey.StartsWith("gelistirme"))
    throw new InvalidOperationException("Canlı ortamda geliştirme anahtarı kullanılamaz. .env dosyasında JWT_KEY belirleyin.");

// Log: Logging__Json=true ise satır satır JSON (log toplama araçları için), değilse okunabilir metin
if (builder.Configuration.GetValue<bool>("Logging:Json")) { builder.Logging.ClearProviders(); builder.Logging.AddJsonConsole(); }

// Proxy/Docker arkasında gerçek istemci IP'si (hız sınırı ve denetim kaydı için)
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear(); o.KnownProxies.Clear();   // kendi ağımızdaki ters proxy'ye güveniyoruz
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantProvider, HttpTenantProvider>();
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddSingleton(new JwtSettings(jwtKey));
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddHttpClient();
builder.Services.AddScoped<LocalLlm>();
builder.Services.AddScoped<RagClient>();
builder.Services.AddSignalR();
builder.Services.AddHostedService<SlaMonitor>();
builder.Services.AddScoped<MailProcessor>();
builder.Services.AddHostedService<MailpitInbox>();          // Mail:Inbound:MailpitUrl boşsa çalışmaz
builder.Services.AddHostedService<WeeklyDigestService>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false; // claim adları "sub", "tenant_id", "role" olarak kalsın
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            NameClaimType = "sub",
            RoleClaimType = "role",
            ClockSkew = TimeSpan.FromMinutes(1),
        };
        // Şifre değişti, hesap kapatıldı ya da "tüm cihazlardan çıkış" yapıldıysa eski token'ları reddet
        o.Events = new JwtBearerEvents
        {
            // Tarayıcı WebSocket'te başlık gönderemez; canlı bağlantı token'ı adre
            // s satırında getirir
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            },
            OnTokenValidated = async ctx =>
            {
                var sub = ctx.Principal?.FindFirst("sub")?.Value;
                var stamp = ctx.Principal?.FindFirst("stamp")?.Value;
                if (!Guid.TryParse(sub, out var userId)) { ctx.Fail("Geçersiz token"); return; }
                var db = ctx.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var user = await db.Users.IgnoreQueryFilters().AsNoTracking()
                    .Where(u => u.Id == userId).Select(u => new { u.IsActive, u.SecurityStamp }).FirstOrDefaultAsync();
                if (user is null || !user.IsActive || user.SecurityStamp != stamp) ctx.Fail("Oturum geçersiz");
            },
        };
    });
builder.Services.AddAuthorization();

// Giriş, şifre sıfırlama gibi uçlara IP başına dakikada 10 istek (kaba kuvvet denemelerine karşı)
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.OnRejected = async (ctx, ct) =>
        await ctx.HttpContext.Response.WriteAsJsonAsync(new { message = "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin." }, ct);
});

builder.Services.AddCors(o => o.AddPolicy("fe", p => p
    .WithOrigins(new[] { "http://localhost:5173", "http://localhost:3000" }
        .Concat((builder.Configuration["Cors:Origins"] ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        .Distinct().ToArray())
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()
    .WithExposedHeaders("Content-Disposition")));   // indirilen dosyanın adını tarayıcı okuyabilsin (KVKK dışa aktarma)

builder.Services.AddControllers(o => { o.Filters.Add<LiveBroadcastFilter>(); o.Filters.Add<AuditFilter>(); });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Kurumsal Destek Platformu API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Name = "Authorization",
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});
builder.Services.AddHealthChecks();

var app = builder.Build();

// Bekleyen migration'ları uygula, eski kullanıcı kayıtlarını yükselt, boşsa demo verisini yükle
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // Database__AutoMigrate=false ise migration'lar ayrı ve kontrollü bir adımda uygulanır (canlı ortam için önerilir)
    if (app.Configuration.GetValue("Database:AutoMigrate", true)) db.Database.Migrate();
    Seeder.UpgradeLegacyUsers(db);
    // Seed__Demo=false ise demo şirketleri yüklenmez (gerçek kurulum)
    if (app.Configuration.GetValue("Seed:Demo", true)) Seeder.Seed(db);
}

app.UseForwardedHeaders();
app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("fe");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<LiveHub>("/hubs/live");
app.MapHealthChecks("/health");

app.Run();
