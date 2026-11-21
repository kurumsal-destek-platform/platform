using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

// KVKK (6698) md. 11 hakları: veriye erişim (dışa aktarma) ve silme (anonimleştirme).
[Route("api/privacy")]
public class PrivacyController : ApiControllerBase
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public PrivacyController(AppDbContext db) : base(db) { }

    private FileContentResult JsonFile(object data, string name) =>
        File(JsonSerializer.SerializeToUtf8Bytes(data, Json), "application/json", $"{name}-{DateTime.UtcNow:yyyyMMdd}.json");

    // Çalışan: kendisi hakkında tutulan tüm veriler
    [HttpGet("me/export")]
    public async Task<IActionResult> ExportMine()
    {
        var u = await Db.Users.FirstAsync(x => x.Id == Me);
        var tickets = await Db.Tickets.Where(t => t.ReporterId == Me).OrderBy(t => t.CreatedAt).ToListAsync();
        var messages = await Db.TicketMessages.Where(m => m.AuthorId == Me && !m.Internal).OrderBy(m => m.CreatedAt).ToListAsync();
        var questions = await Db.AssistantQueries.Where(q => q.UserId == Me).OrderBy(q => q.CreatedAt).ToListAsync();
        return JsonFile(new
        {
            exportedAt = DateTime.UtcNow,
            profile = new { u.FullName, u.Email, u.Role, u.CreatedAt, u.LastLoginAt },
            tickets = tickets.Select(t => new { t.Title, t.Description, t.Category, t.Priority, t.Status, t.CreatedAt, t.ResolvedAt, t.CsatRating, t.CsatComment }),
            messages = messages.Select(m => new { m.TicketId, m.Body, m.CreatedAt }),
            assistantQuestions = questions.Select(q => new { q.Question, q.CreatedAt }),
        }, "verilerim");
    }

    // Admin: firmanın tüm verisi (taşınabilirlik / sözleşme sonu). Şifre özetleri ve token'lar dahil edilmez.
    [HttpGet("tenant/export")]
    public async Task<IActionResult> ExportTenant()
    {
        if (MyRole != Roles.Admin) return Forbidden("Firma verisini sadece Admin dışa aktarabilir.");
        var tenant = await Db.Tenants.FirstAsync(t => t.Id == Db.CurrentTenantId);
        var users = await Db.Users.ToListAsync();
        return JsonFile(new
        {
            exportedAt = DateTime.UtcNow,
            company = new { tenant.Name },
            users = users.Select(u => new { u.Id, u.FullName, u.Email, u.Role, u.IsActive, u.CreatedAt, u.LastLoginAt }),
            tickets = await Db.Tickets.ToListAsync(),
            ticketMessages = await Db.TicketMessages.ToListAsync(),
            incidents = await Db.Incidents.ToListAsync(),
            articles = await Db.Articles.ToListAsync(),
            projects = await Db.Projects.ToListAsync(),
            sprints = await Db.Sprints.ToListAsync(),
            workItems = await Db.WorkItems.ToListAsync(),
            comments = await Db.Comments.ToListAsync(),
            slaPolicies = await Db.SlaPolicies.ToListAsync(),
            settings = await Db.TenantSettings.ToListAsync(),
            auditLog = await Db.AuditLogs.OrderByDescending(a => a.At).Take(5000).ToListAsync(),
        }, "firma-verisi");
    }

    // Admin: ayrılan çalışanın kişisel verisini anonimleştir. Ticket'lar ve istatistikler korunur, kişi tanınamaz hale gelir.
    [HttpPost("users/{id:guid}/anonymize")]
    public async Task<IActionResult> Anonymize(Guid id)
    {
        if (MyRole != Roles.Admin) return Forbidden("Kişisel veri silme işlemini sadece Admin yapabilir.");
        if (id == Me) return BadRequest(new { message = "Kendi hesabınızı anonimleştiremezsiniz." });
        var u = await Db.Users.FirstOrDefaultAsync(x => x.Id == id);
        if (u is null) return NotFound();

        var label = $"Silinmiş kullanıcı #{id.ToString("N")[..6]}";
        u.FullName = label;
        u.Email = $"silindi-{id:N}@anonim.local";
        u.PasswordHash = "";
        u.IsActive = false;
        u.EmailConfirmed = false;
        u.LastLoginAt = null;
        u.SecurityStamp = Guid.NewGuid().ToString("N");   // açık oturumlar hemen kapanır

        Db.AuthTokens.RemoveRange(await Db.AuthTokens.Where(t => t.UserId == id).ToListAsync());
        Db.Notifications.RemoveRange(await Db.Notifications.Where(n => n.UserId == id).ToListAsync());
        Db.SavedFilters.RemoveRange(await Db.SavedFilters.Where(f => f.OwnerId == id && !f.Shared).ToListAsync());
        foreach (var q in await Db.AssistantQueries.Where(q => q.UserId == id).ToListAsync()) q.UserId = Guid.Empty;
        foreach (var a in await Db.AuditLogs.Where(a => a.UserId == id).ToListAsync()) { a.UserName = label; a.Ip = null; }
        foreach (var t in await Db.Tickets.Where(t => t.ReporterId == id && t.CsatComment != null).ToListAsync()) t.CsatComment = null;

        await Db.SaveChangesAsync();
        return Ok(new { message = $"Kişisel veriler silindi. Kullanıcı artık \"{label}\" olarak görünecek." });
    }
}
