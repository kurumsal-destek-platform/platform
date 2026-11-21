using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// Veri değiştiren her isteği (POST/PUT/PATCH/DELETE) ve giriş denemelerini denetim kaydına yazar.
// İstek GÖVDESİ kaydedilmez (şifre, kişisel veri sızmasın); sadece kim, ne işlem, hangi kayıt, sonuç.
public class AuditFilter : IAsyncActionFilter
{
    private readonly AppDbContext _db;
    private readonly ILogger<AuditFilter> _log;
    public AuditFilter(AppDbContext db, ILogger<AuditFilter> log) { _db = db; _log = log; }

    private static readonly (Regex Re, string Text)[] Names =
    {
        (new(@"^POST /api/auth/login$"), "Giriş"),
        (new(@"^POST /api/auth/register$"), "Şirket hesabı oluşturdu"),
        (new(@"^POST /api/auth/(set-password|change-password)$"), "Şifre belirledi/değiştirdi"),
        (new(@"^POST /api/auth/logout-all$"), "Tüm cihazlardan çıkış yaptı"),
        (new(@"^POST /api/users/invite$"), "Kullanıcı davet etti"),
        (new(@"^PUT /api/users/[^/]+/role$"), "Kullanıcı rolünü değiştirdi"),
        (new(@"^PUT /api/users/[^/]+/active$"), "Kullanıcıyı etkinleştirdi/devre dışı bıraktı"),
        (new(@"^POST /api/users/[^/]+/unlock$"), "Hesap kilidini kaldırdı"),
        (new(@"^GET /api/privacy/tenant/export$"), "KVKK: Firma verisini dışa aktardı"),
        (new(@"^POST /api/automation/rules/test$"), "Otomasyon kuralını denedi"),
        (new(@"^POST /api/automation/rules$"), "Otomasyon kuralı ekledi"),
        (new(@"^PUT /api/automation/rules/[^/]+$"), "Otomasyon kuralını düzenledi"),
        (new(@"^DELETE /api/automation/rules/[^/]+$"), "Otomasyon kuralını sildi"),
        (new(@"^PUT /api/digest/settings$"), "Haftalık özet ayarını değiştirdi"),
        (new(@"^GET /api/privacy/me/export$"), "KVKK: Kendi verisini indirdi"),
        (new(@"^POST /api/privacy/users/[^/]+/anonymize$"), "KVKK: Kullanıcının kişisel verisini sildi"),
        (new(@"^POST /api/tickets$"), "Ticket oluşturdu"),
        (new(@"^PUT /api/tickets/[^/]+/assignee$"), "Ticket atadı"),
        (new(@"^PATCH /api/tickets/[^/]+/status$"), "Ticket durumunu değiştirdi"),
        (new(@"^POST /api/tickets/[^/]+/messages$"), "Ticket'a mesaj yazdı"),
        (new(@"^POST /api/tickets/[^/]+/csat$"), "Memnuniyet puanı verdi"),
        (new(@"^POST /api/tickets/[^/]+/to-article$"), "Ticket'ı makaleye dönüştürdü"),
        (new(@"^POST /api/tickets/[^/]+/convert$"), "Ticket'ı göreve çevirdi"),
        (new(@"^POST /api/incidents$"), "Büyük olay oluşturdu"),
        (new(@"^POST /api/incidents/[^/]+/resolve$"), "Büyük olayı çözdü"),
        (new(@"^PUT /api/settings$"), "SLA ve firma ayarlarını değiştirdi"),
        (new(@"^POST /api/kb/import$"), "Doküman içe aktardı"),
        (new(@"^(POST|PUT) /api/kb/articles"), "Bilgi bankası makalesini değiştirdi"),
        (new(@"^POST /api/kb/articles/[^/]+/publish"), "Makale yayın durumunu değiştirdi"),
        (new(@"^DELETE /api/attachments/"), "Ek sildi"),
        (new(@"^POST /api/(items|projects)"), "İş öğesi/proje oluşturdu"),
        (new(@"^(PUT|PATCH) /api/items/"), "İş öğesini güncelledi"),
        (new(@"^DELETE /api/"), "Kayıt sildi"),
    };

    // Çok sık ve düşük değerli işlemler: kayıt şişmesin
    private static readonly Regex Skip = new(@"^/api/(notifications|kb/feedback|ocr|kb/import/preview|tickets/[^/]+/reply-draft|insights/knowledge-gaps/draft|auth/(check-token|forgot-password|resend-verification))");

    public static string Describe(string method, string path)
    {
        var key = $"{method} {path}";
        foreach (var (re, text) in Names) if (re.IsMatch(key)) return text;
        return key;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var done = await next();
        var http = ctx.HttpContext;
        var method = http.Request.Method;
        var path = http.Request.Path.Value ?? "";
        if ((HttpMethods.IsGet(method) && !path.StartsWith("/api/privacy/")) || Skip.IsMatch(path)) return;   // veri dışa aktarma (GET) da kayda girer
        try
        {
            var code = done.Exception is not null ? 500 : done.Result is IStatusCodeActionResult { StatusCode: int c } ? c : 200;
            Guid? userId = Guid.TryParse(http.User.FindFirst("sub")?.Value, out var u) ? u : null;
            Guid tenantId = Guid.TryParse(http.User.FindFirst("tenant_id")?.Value, out var t) ? t : Guid.Empty;
            var name = http.User.FindFirst("name")?.Value ?? "";
            var action = Describe(method, path);

            // Giriş denemesi: kullanıcı henüz oturum açmamış; e-postadan bul
            if (path == "/api/auth/login" && ctx.ActionArguments.Values.FirstOrDefault() is { } arg)
            {
                var email = arg.GetType().GetProperty("Email")?.GetValue(arg) as string;
                var user = string.IsNullOrWhiteSpace(email) ? null : await _db.Users.IgnoreQueryFilters().AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Email == email.Trim().ToLower());
                if (user is null) return;   // olmayan hesap: hangi firmaya yazacağımızı bilemeyiz
                userId = user.Id; tenantId = user.TenantId; name = user.FullName;
                action = code < 400 ? "Giriş yaptı" : code == 429 ? "Çok fazla giriş denemesi" : "Giriş başarısız";
            }
            else if (code >= 400 && code != 403) return;   // başarısız normal işlemler gürültü; yetkisiz deneme (403) kayda değer
            if (tenantId == Guid.Empty) return;
            if (code == 403) action = $"YETKİSİZ DENEME: {action}";

            _db.ChangeTracker.Clear();   // isteğin kendi değişiklikleriyle karışmasın
            _db.AuditLogs.Add(new AuditLog
            {
                TenantId = tenantId, UserId = userId, UserName = name, Action = action, Method = method,
                Path = path.Length > 300 ? path[..300] : path, StatusCode = code,
                Ip = http.Connection.RemoteIpAddress?.ToString(),
            });
            await _db.SaveChangesAsync();
        }
        catch (Exception ex) { _log.LogWarning(ex, "Denetim kaydı yazılamadı"); }   // kayıt hatası isteği bozmasın
    }
}
