using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record LoginRequest(string Email, string Password);

[Route("api/auth")]
public class AuthController : ApiControllerBase
{
    private readonly JwtSettings _jwt;
    public AuthController(AppDbContext db, JwtSettings jwt) : base(db) { _jwt = jwt; }

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
