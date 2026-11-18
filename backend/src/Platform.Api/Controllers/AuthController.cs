using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record LoginRequest(string Email, string Password, bool RememberMe = false);
public record RegisterRequest(string CompanyName, string FullName, string Email, string Password);
public record EmailRequest(string Email);
public record TokenRequest(string Token);
public record SetPasswordRequest(string Token, string Password);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

[Route("api/auth")]
public class AuthController : ApiControllerBase
{
    private const int MaxFailedAttempts = 5;
    private static readonly TimeSpan LockoutTime = TimeSpan.FromMinutes(15);

    private readonly JwtSettings _jwt;
    private readonly IEmailSender _mail;
    private readonly IConfiguration _cfg;
    private readonly PasswordHasher<User> _hasher = new();

    public AuthController(AppDbContext db, JwtSettings jwt, IEmailSender mail, IConfiguration cfg) : base(db)
    {
        _jwt = jwt; _mail = mail; _cfg = cfg;
    }

    private static string Normalize(string email) => (email ?? "").Trim().ToLowerInvariant();

    // Giriş öncesinde tenant bilinmez; kullanıcı sorguları bu yüzden filtre dışı yapılır.
    private Task<User?> FindByEmail(string email) =>
        Db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email == Normalize(email));

    private async Task<object> SessionAsync(User user, bool remember)
    {
        var tenant = await Db.Tenants.FindAsync(user.TenantId);
        return new
        {
            token = TokenService.Create(user, _jwt, remember),
            user = new { user.Id, user.Email, user.FullName, user.Role, user.TenantId, tenantName = tenant?.Name },
        };
    }

    // ---------------- Giriş ----------------
    [AllowAnonymous, EnableRateLimiting("auth")]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        const string generic = "E-posta veya şifre hatalı.";
        var user = await FindByEmail(req.Email);
        if (user is null || string.IsNullOrEmpty(user.PasswordHash))
            return Unauthorized(new { message = generic });

        if (user.LockoutEnd > DateTime.UtcNow)
        {
            var min = Math.Ceiling((user.LockoutEnd.Value - DateTime.UtcNow).TotalMinutes);
            return Unauthorized(new { message = $"Çok fazla hatalı deneme. {min} dakika sonra tekrar deneyin ya da şifrenizi sıfırlayın.", code = "locked" });
        }

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password ?? "");
        if (result == PasswordVerificationResult.Failed)
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= MaxFailedAttempts)
            {
                user.LockoutEnd = DateTime.UtcNow.Add(LockoutTime);
                user.FailedLoginCount = 0;
            }
            await Db.SaveChangesAsync();
            var left = MaxFailedAttempts - user.FailedLoginCount;
            return Unauthorized(new { message = user.LockoutEnd > DateTime.UtcNow
                ? "Çok fazla hatalı deneme. Hesabınız 15 dakika kilitlendi."
                : left <= 2 ? $"{generic} {left} deneme hakkınız kaldı." : generic });
        }

        if (!user.IsActive) return Unauthorized(new { message = "Hesabınız devre dışı. Yöneticinize başvurun.", code = "inactive" });
        if (!user.EmailConfirmed)
            return Unauthorized(new { message = "E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzu kontrol edin.", code = "unverified" });

        // Eski hash algoritmasıyla kaydedildiyse güncelle
        if (result == PasswordVerificationResult.SuccessRehashNeeded) user.PasswordHash = _hasher.HashPassword(user, req.Password!);
        user.FailedLoginCount = 0;
        user.LockoutEnd = null;
        user.LastLoginAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return Ok(await SessionAsync(user, req.RememberMe));
    }

    // ---------------- Şirket hesabı oluşturma (yeni tenant + ilk yönetici) ----------------
    [AllowAnonymous, EnableRateLimiting("auth")]
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.CompanyName) || string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Şirket adı ve ad soyad gerekli." });
        var email = Normalize(req.Email);
        if (!email.Contains('@') || email.Length > 200) return BadRequest(new { message = "Geçerli bir e-posta girin." });
        if (PasswordPolicy.Validate(req.Password) is string err) return BadRequest(new { message = err });
        if (await FindByEmail(email) is not null) return Conflict(new { message = "Bu e-posta ile kayıtlı bir hesap var. Giriş yapın ya da şifrenizi sıfırlayın." });

        var tenant = new Tenant { Name = req.CompanyName.Trim() };
        var user = new User { TenantId = tenant.Id, Email = email, FullName = req.FullName.Trim(), Role = Roles.Admin };
        user.PasswordHash = _hasher.HashPassword(user, req.Password);
        Db.Tenants.Add(tenant);
        Db.Users.Add(user);
        var token = await AuthTokens.IssueAsync(Db, user.Id, TokenPurposes.VerifyEmail, TimeSpan.FromHours(24));
        await Db.SaveChangesAsync();

        await _mail.SendAsync(email, "E-posta adresinizi doğrulayın",
            EmailTemplates.Verify(user.FullName, AuthTokens.FrontendUrl(_cfg, $"/verify-email?token={token}")));
        return Ok(new { message = "Hesabınız oluşturuldu. Giriş yapmadan önce e-postanıza gelen bağlantıyla adresinizi doğrulayın." });
    }

    [AllowAnonymous, EnableRateLimiting("auth")]
    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail(TokenRequest req)
    {
        var t = await AuthTokens.FindValidAsync(Db, req.Token, TokenPurposes.VerifyEmail);
        if (t is null) return BadRequest(new { message = "Doğrulama bağlantısı geçersiz ya da süresi dolmuş." });
        var user = await Db.Users.IgnoreQueryFilters().FirstAsync(u => u.Id == t.UserId);
        user.EmailConfirmed = true;
        t.UsedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return Ok(await SessionAsync(user, false));
    }

    [AllowAnonymous, EnableRateLimiting("auth")]
    [HttpPost("resend-verification")]
    public async Task<IActionResult> ResendVerification(EmailRequest req)
    {
        var user = await FindByEmail(req.Email);
        if (user is not null && !user.EmailConfirmed && !string.IsNullOrEmpty(user.PasswordHash))
        {
            var token = await AuthTokens.IssueAsync(Db, user.Id, TokenPurposes.VerifyEmail, TimeSpan.FromHours(24));
            await Db.SaveChangesAsync();
            await _mail.SendAsync(user.Email, "E-posta adresinizi doğrulayın",
                EmailTemplates.Verify(user.FullName, AuthTokens.FrontendUrl(_cfg, $"/verify-email?token={token}")));
        }
        return Ok(new { message = "Hesap doğrulanmamışsa yeni bir bağlantı gönderildi." });
    }

    // ---------------- Şifremi unuttum ----------------
    // Hesap var mı yok mu belli etmemek için her zaman aynı cevap döner.
    [AllowAnonymous, EnableRateLimiting("auth")]
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(EmailRequest req)
    {
        var user = await FindByEmail(req.Email);
        if (user is not null && user.IsActive)
        {
            var token = await AuthTokens.IssueAsync(Db, user.Id, TokenPurposes.ResetPassword, TimeSpan.FromMinutes(30));
            await Db.SaveChangesAsync();
            await _mail.SendAsync(user.Email, "Şifre sıfırlama",
                EmailTemplates.Reset(user.FullName, AuthTokens.FrontendUrl(_cfg, $"/reset-password?token={token}")));
        }
        return Ok(new { message = "Bu e-postaya kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi." });
    }

    // Bağlantı sayfası açılınca: token geçerli mi, kime ait?
    [AllowAnonymous, EnableRateLimiting("auth")]
    [HttpPost("check-token")]
    public async Task<IActionResult> CheckToken(TokenRequest req)
    {
        var t = await AuthTokens.FindValidAsync(Db, req.Token, TokenPurposes.ResetPassword, TokenPurposes.Invite);
        if (t is null) return BadRequest(new { message = "Bağlantı geçersiz ya da süresi dolmuş. Yeni bir bağlantı isteyin." });
        var user = await Db.Users.IgnoreQueryFilters().FirstAsync(u => u.Id == t.UserId);
        var tenant = await Db.Tenants.FindAsync(user.TenantId);
        return Ok(new { purpose = t.Purpose, email = user.Email, fullName = user.FullName, tenantName = tenant?.Name });
    }

    // Şifre sıfırlama ve davet kabulü aynı uçla yapılır (ikisi de yeni şifre belirler)
    [AllowAnonymous, EnableRateLimiting("auth")]
    [HttpPost("set-password")]
    public async Task<IActionResult> SetPassword(SetPasswordRequest req)
    {
        var t = await AuthTokens.FindValidAsync(Db, req.Token, TokenPurposes.ResetPassword, TokenPurposes.Invite);
        if (t is null) return BadRequest(new { message = "Bağlantı geçersiz ya da süresi dolmuş. Yeni bir bağlantı isteyin." });
        if (PasswordPolicy.Validate(req.Password) is string err) return BadRequest(new { message = err });

        var user = await Db.Users.IgnoreQueryFilters().FirstAsync(u => u.Id == t.UserId);
        if (!user.IsActive) return BadRequest(new { message = "Hesabınız devre dışı." });

        user.PasswordHash = _hasher.HashPassword(user, req.Password);
        user.EmailConfirmed = true;                       // bağlantıya tıklayabildiği için e-posta onaylı
        user.FailedLoginCount = 0;
        user.LockoutEnd = null;
        user.SecurityStamp = Guid.NewGuid().ToString("N"); // diğer cihazlardaki oturumlar kapanır
        user.LastLoginAt = DateTime.UtcNow;
        t.UsedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return Ok(await SessionAsync(user, false));
    }

    // ---------------- Oturum açıkken ----------------
    [HttpGet("me")]
    public async Task<IActionResult> MeInfo()
    {
        var user = await Db.Users.FirstOrDefaultAsync(u => u.Id == Me);
        if (user is null) return Unauthorized();
        var tenant = await Db.Tenants.FindAsync(user.TenantId);
        return Ok(new { user.Id, user.Email, user.FullName, user.Role, user.TenantId, tenantName = tenant?.Name, user.LastLoginAt });
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        var user = await Db.Users.FirstOrDefaultAsync(u => u.Id == Me);
        if (user is null) return Unauthorized();
        if (_hasher.VerifyHashedPassword(user, user.PasswordHash, req.CurrentPassword ?? "") == PasswordVerificationResult.Failed)
            return BadRequest(new { message = "Mevcut şifre hatalı." });
        if (PasswordPolicy.Validate(req.NewPassword) is string err) return BadRequest(new { message = err });
        if (req.NewPassword == req.CurrentPassword) return BadRequest(new { message = "Yeni şifre eskisiyle aynı olamaz." });

        user.PasswordHash = _hasher.HashPassword(user, req.NewPassword);
        user.SecurityStamp = Guid.NewGuid().ToString("N");
        await Db.SaveChangesAsync();
        // Bu cihazda oturum devam etsin diye yeni token
        return Ok(await SessionAsync(user, false));
    }

    // Tüm cihazlardan çıkış
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutAll()
    {
        var user = await Db.Users.FirstOrDefaultAsync(u => u.Id == Me);
        if (user is null) return Unauthorized();
        user.SecurityStamp = Guid.NewGuid().ToString("N");
        await Db.SaveChangesAsync();
        return NoContent();
    }
}
