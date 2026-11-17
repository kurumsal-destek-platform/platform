using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;

namespace Platform.Api.Controllers;

public record LoginRequest(string Email, string Password);

[Route("api/auth")]
public class AuthController : ApiControllerBase
{
    private readonly JwtSettings _jwt;
    private readonly IEmailSender _email;
    private readonly IConfiguration _config;
    private readonly ITimeLimitedDataProtector _protector;

    public AuthController(AppDbContext db, JwtSettings jwt, IEmailSender email,
        IConfiguration config, IDataProtectionProvider dp) : base(db)
    {
        _jwt = jwt;
        _email = email;
        _config = config;
        _protector = dp.CreateProtector("password-reset").ToTimeLimitedDataProtector();
    }

    public record ForgotRequest(string Email);
    public record ResetRequest(string Token, string NewPassword);

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var user = await Db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email == email && u.IsActive);
        if (user is not null)
        {
            var token = _protector.Protect($"{user.Id}|{user.SecurityStamp}", TimeSpan.FromHours(1));
            var baseUrl = _config["App:FrontendUrl"] ?? "http://localhost:5173";
            var link = $"{baseUrl}/reset-password?token={Uri.EscapeDataString(token)}";
            try
            {
                await _email.SendAsync(user.Email, "Şifre sıfırlama",
                    $"<p>Merhaba {user.FullName},</p><p>Şifrenizi sıfırlamak için <a href=\"{link}\">buraya tıklayın</a>. Bağlantı 1 saat geçerlidir.</p>");
            }
            catch (Exception ex) { Console.WriteLine("E-posta gönderilemedi: " + ex); }
        }
        // Kullanıcı var mı yok mu belli etmemek için hep aynı yanıt.
        return Ok(new { message = "E-posta adresi kayıtlıysa sıfırlama bağlantısı gönderildi." });
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { message = "Şifre en az 8 karakter olmalı." });

        string payload;
        try { payload = _protector.Unprotect(req.Token); }
        catch { return BadRequest(new { message = "Bağlantı geçersiz ya da süresi dolmuş." }); }

        var parts = payload.Split('|');
        if (parts.Length != 2 || !Guid.TryParse(parts[0], out var userId))
            return BadRequest(new { message = "Bağlantı geçersiz." });

        var user = await Db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || !user.IsActive || user.SecurityStamp != parts[1])
            return BadRequest(new { message = "Bağlantı geçersiz ya da daha önce kullanılmış." });

        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, req.NewPassword);
        user.SecurityStamp = Guid.NewGuid().ToString("N"); // eski oturumlar ve bu bağlantı geçersiz olur
        await Db.SaveChangesAsync();
        return Ok(new { message = "Şifre güncellendi." });
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        // Girişte henüz tenant bilinmiyor; bu yüzden filtre sadece burada kapatılır.
        var user = await Db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email == email);
        if (user is null)
            return Unauthorized(new { message = "E-posta veya şifre hatalı." });

        var result = new PasswordHasher<User>().VerifyHashedPassword(user, user.PasswordHash, req.Password);
        if (result == PasswordVerificationResult.Failed)
            return Unauthorized(new { message = "E-posta veya şifre hatalı." });

        var tenant = await Db.Tenants.FindAsync(user.TenantId);
        return Ok(new
        {
            token = TokenService.Create(user, _jwt),
            user = new { user.Id, user.Email, user.FullName, user.Role, user.TenantId, tenantName = tenant?.Name },
        });
    }

    [HttpGet("me")]
    public async Task<IActionResult> MeInfo()
    {
        var user = await Db.Users.FirstOrDefaultAsync(u => u.Id == Me);
        if (user is null) return Unauthorized();
        var tenant = await Db.Tenants.FindAsync(user.TenantId);
        return Ok(new { user.Id, user.Email, user.FullName, user.Role, user.TenantId, tenantName = tenant?.Name });
    }

    // Atama listeleri için firmadaki kullanıcılar.
    [HttpGet("/api/users")]
    public async Task<IActionResult> Users() =>
        Ok(await Db.Users.OrderBy(u => u.FullName)
            .Select(u => new { u.Id, u.FullName, u.Email, u.Role }).ToListAsync());
}
