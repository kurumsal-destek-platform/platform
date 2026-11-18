using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record InviteRequest(string Email, string FullName, string? Role);
public record RoleRequest(string Role);
public record ActiveRequest(bool IsActive);

// Firma kullanıcıları: listeleme, davet, rol ve durum yönetimi (Jira'daki "Kullanıcı yönetimi")
[Route("api/users")]
public class UsersController : ApiControllerBase
{
    private readonly IEmailSender _mail;
    private readonly IConfiguration _cfg;

    public UsersController(AppDbContext db, IEmailSender mail, IConfiguration cfg) : base(db) { _mail = mail; _cfg = cfg; }

    // Atama listeleri bu ucu kullanır; tüm üyeler görebilir
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool all = false)
    {
        var q = Db.Users.AsQueryable();
        if (!all || !IsManagerOrAdmin) q = q.Where(u => u.IsActive && u.PasswordHash != "");
        var list = await q.OrderBy(u => u.FullName).ToListAsync();
        return Ok(list.Select(u => new
        {
            u.Id, u.FullName, u.Email, u.Role, u.IsActive, u.LastLoginAt, u.CreatedAt,
            invited = u.PasswordHash == "",
            locked = u.LockoutEnd > DateTime.UtcNow,
        }));
    }

    [HttpPost("invite")]
    public async Task<IActionResult> Invite(InviteRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Kullanıcı davet etmek için yönetici olmalısınız.");
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        if (!email.Contains('@')) return BadRequest(new { message = "Geçerli bir e-posta girin." });
        if (string.IsNullOrWhiteSpace(req.FullName)) return BadRequest(new { message = "Ad soyad gerekli." });
        var role = req.Role ?? Roles.Employee;
        if (role is not (Roles.Employee or Roles.Manager or Roles.Admin)) return BadRequest(new { message = "Geçersiz rol." });
        if (role == Roles.Admin && MyRole != Roles.Admin) return Forbidden("Admin rolünü sadece Admin verebilir.");
        if (await Db.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == email))
            return Conflict(new { message = "Bu e-posta ile kayıtlı bir kullanıcı var." });

        var me = await Db.Users.FirstAsync(u => u.Id == Me);
        var user = new User { TenantId = me.TenantId, Email = email, FullName = req.FullName.Trim(), Role = role };
        Db.Users.Add(user);
        await SendInviteAsync(user, me.FullName);
        return Ok(new { user.Id, user.Email, user.FullName, user.Role, invited = true });
    }

    [HttpPost("{id:guid}/resend-invite")]
    public async Task<IActionResult> ResendInvite(Guid id)
    {
        if (!IsManagerOrAdmin) return Forbidden("Yetkiniz yok.");
        var user = await Db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return NotFound();
        if (user.PasswordHash != "") return BadRequest(new { message = "Kullanıcı daveti zaten kabul etmiş." });
        var me = await Db.Users.FirstAsync(u => u.Id == Me);
        await SendInviteAsync(user, me.FullName);
        return NoContent();
    }

    private async Task SendInviteAsync(User user, string inviter)
    {
        var token = await AuthTokens.IssueAsync(Db, user.Id, TokenPurposes.Invite, TimeSpan.FromDays(7));
        await Db.SaveChangesAsync();
        var tenant = await Db.Tenants.FindAsync(user.TenantId);
        await _mail.SendAsync(user.Email, $"{tenant?.Name} sizi Destek Platformu'na davet etti",
            EmailTemplates.Invite(user.FullName, tenant?.Name ?? "", inviter,
                AuthTokens.FrontendUrl(_cfg, $"/accept-invite?token={token}")));
    }

    [HttpPut("{id:guid}/role")]
    public async Task<IActionResult> SetRole(Guid id, RoleRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Yetkiniz yok.");
        if (id == Me) return BadRequest(new { message = "Kendi rolünüzü değiştiremezsiniz." });
        if (req.Role is not (Roles.Employee or Roles.Manager or Roles.Admin)) return BadRequest(new { message = "Geçersiz rol." });
        var user = await Db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return NotFound();
        if ((req.Role == Roles.Admin || user.Role == Roles.Admin) && MyRole != Roles.Admin)
            return Forbidden("Admin rolünü sadece Admin değiştirebilir.");
        user.Role = req.Role;
        user.SecurityStamp = Guid.NewGuid().ToString("N"); // yeni rol, yeniden girişte token'a yansısın
        Events.Notify(Db, user.TenantId, user.Id, Me, "Rolünüz değişti", $"Yeni rolünüz: {req.Role}. Lütfen yeniden giriş yapın.", null);
        await Db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, ActiveRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Yetkiniz yok.");
        if (id == Me) return BadRequest(new { message = "Kendi hesabınızı devre dışı bırakamazsınız." });
        var user = await Db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return NotFound();
        if (user.Role == Roles.Admin && MyRole != Roles.Admin) return Forbidden("Admin hesabını sadece Admin değiştirebilir.");
        user.IsActive = req.IsActive;
        if (!req.IsActive) user.SecurityStamp = Guid.NewGuid().ToString("N"); // açık oturumları hemen kapat
        await Db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/unlock")]
    public async Task<IActionResult> Unlock(Guid id)
    {
        if (!IsManagerOrAdmin) return Forbidden("Yetkiniz yok.");
        var user = await Db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return NotFound();
        user.LockoutEnd = null;
        user.FailedLoginCount = 0;
        await Db.SaveChangesAsync();
        return NoContent();
    }
}
