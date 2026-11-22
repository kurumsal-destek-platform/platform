using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateIncidentRequest(string Title, string? Description, string? Severity, Guid[]? TicketIds, Guid? OwnerId);
public record IncidentTicketsRequest(Guid[] TicketIds);
public record ResolveIncidentRequest(string ResolutionNote);

// Büyük olay yönetimi: aynı sorun için açılmış onlarca ticket'ı tek yerden yönet, tek tıkla hepsini çöz.
[Route("api/incidents")]
public class IncidentsController : ApiControllerBase
{
    public IncidentsController(AppDbContext db) : base(db) { }

    // Benzerlik eşikleri (0-1). Demo verisiyle denenerek seçildi.
    public const double ClusterThreshold = 0.40;
    public const double MatchThreshold = 0.35;

    private static readonly string[] OpenStatuses = { TicketStatus.Open, TicketStatus.Assigned, TicketStatus.InProgress };

    private async Task<object> DtoAsync(Incident i, Dictionary<Guid, string>? names = null)
    {
        names ??= await UserNamesAsync();
        var tickets = await Db.Tickets.Where(t => t.IncidentId == i.Id).OrderBy(t => t.CreatedAt).ToListAsync();
        return new
        {
            i.Id, i.Title, i.Description, i.Severity, i.Status, i.ResolutionNote, i.CreatedAt, i.ResolvedAt,
            i.OwnerId, ownerName = i.OwnerId is Guid o ? names.GetValueOrDefault(o) : null,
            createdByName = names.GetValueOrDefault(i.CreatedById),
            ticketCount = tickets.Count,
            openCount = tickets.Count(t => OpenStatuses.Contains(t.Status)),
            affectedUsers = tickets.Select(t => t.ReporterId).Distinct().Count(),
            tickets = tickets.Select(t => new
            {
                t.Id, t.Title, t.Status, t.CreatedAt, reporterName = names.GetValueOrDefault(t.ReporterId),
            }),
        };
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var list = await Db.Incidents.OrderBy(i => i.Status == IncidentStatus.Active ? 0 : 1)
            .ThenByDescending(i => i.CreatedAt).ToListAsync();
        var names = await UserNamesAsync();
        var result = new List<object>();
        foreach (var i in list) result.Add(await DtoAsync(i, names));
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var i = await Db.Incidents.FirstOrDefaultAsync(x => x.Id == id);
        return i is null ? NotFound() : Ok(await DtoAsync(i));
    }

    // Yöneticiye öneri: son 3 günde açılan, birbirine benzeyen ve henüz olaya bağlanmamış açık ticket grupları
    [HttpGet("suggestions")]
    public async Task<IActionResult> Suggestions()
    {
        if (!IsSupport) return Forbidden("Sadece destek ekibi.");
        var since = DateTime.UtcNow.AddDays(-3);
        var open = await Db.Tickets
            .Where(t => t.IncidentId == null && OpenStatuses.Contains(t.Status) && t.CreatedAt >= since)
            .OrderBy(t => t.CreatedAt).ToListAsync();
        var names = await UserNamesAsync();
        var groups = TextSim.Cluster(open, t => TextSim.Vec(t.Title, t.Description), ClusterThreshold)
            .Where(g => g.Count >= 3)
            .OrderByDescending(g => g.Count)
            .Select(g =>
            {
                var c = TextSim.Central(g, t => TextSim.Vec(t.Title, t.Description));
                var first = g.Min(t => t.CreatedAt);
                var hours = Math.Max(1, (DateTime.UtcNow - first).TotalHours);
                return new
                {
                    title = c.Title,
                    category = g.GroupBy(t => t.Category).OrderByDescending(x => x.Count()).First().Key,
                    count = g.Count,
                    affectedUsers = g.Select(t => t.ReporterId).Distinct().Count(),
                    firstAt = first,
                    perHour = Math.Round(g.Count / hours, 1),
                    ticketIds = g.Select(t => t.Id),
                    tickets = g.Select(t => new { t.Id, t.Title, t.CreatedAt, reporterName = names.GetValueOrDefault(t.ReporterId) }),
                };
            });
        return Ok(groups);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateIncidentRequest req)
    {
        if (!IsSupport) return Forbidden("Büyük olay oluşturmak için destek ekibinde olmalısınız.");
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest(new { message = "Başlık gerekli." });
        var me = await Db.Users.FirstAsync(u => u.Id == Me);
        var inc = new Incident
        {
            TenantId = me.TenantId, Title = req.Title.Trim(), Description = req.Description ?? "",
            Severity = req.Severity ?? "High", CreatedById = Me, OwnerId = req.OwnerId ?? Me,
        };
        Db.Incidents.Add(inc);
        await LinkAsync(inc, req.TicketIds ?? Array.Empty<Guid>());
        await Db.SaveChangesAsync();
        return Ok(await DtoAsync(inc));
    }

    [HttpPost("{id:guid}/tickets")]
    public async Task<IActionResult> AddTickets(Guid id, IncidentTicketsRequest req)
    {
        if (!IsSupport) return Forbidden("Yetkiniz yok.");
        var inc = await Db.Incidents.FirstOrDefaultAsync(x => x.Id == id);
        if (inc is null) return NotFound();
        await LinkAsync(inc, req.TicketIds);
        await Db.SaveChangesAsync();
        return Ok(await DtoAsync(inc));
    }

    [HttpDelete("{id:guid}/tickets/{ticketId:guid}")]
    public async Task<IActionResult> RemoveTicket(Guid id, Guid ticketId)
    {
        if (!IsSupport) return Forbidden("Yetkiniz yok.");
        var t = await Db.Tickets.FirstOrDefaultAsync(x => x.Id == ticketId && x.IncidentId == id);
        if (t is null) return NotFound();
        t.IncidentId = null;
        await Db.SaveChangesAsync();
        return NoContent();
    }

    private async Task LinkAsync(Incident inc, Guid[] ids)
    {
        if (ids.Length == 0) return;
        var tickets = await Db.Tickets.Where(t => ids.Contains(t.Id)).ToListAsync();
        foreach (var t in tickets)
        {
            t.IncidentId = inc.Id;
            if (t.Status == TicketStatus.Open) { t.Status = TicketStatus.InProgress; t.AssigneeId ??= inc.OwnerId; }
            t.FirstResponseAt ??= DateTime.UtcNow;
            Events.Notify(Db, t.TenantId, t.ReporterId, Me, "Sorununuz biliniyor",
                $"\"{t.Title}\" büyük bir olaya bağlandı: {inc.Title}. Ekip üzerinde çalışıyor, çözülünce haber vereceğiz.", "/tickets");
        }
    }

    // Tek tıkla çöz: bağlı tüm açık ticket'lar aynı çözüm notuyla kapanır, herkes bilgilendirilir
    [HttpPost("{id:guid}/resolve")]
    public async Task<IActionResult> Resolve(Guid id, ResolveIncidentRequest req)
    {
        if (!IsSupport) return Forbidden("Yetkiniz yok.");
        if (string.IsNullOrWhiteSpace(req.ResolutionNote)) return BadRequest(new { message = "Çözüm notu gerekli." });
        var inc = await Db.Incidents.FirstOrDefaultAsync(x => x.Id == id);
        if (inc is null) return NotFound();
        inc.Status = IncidentStatus.Resolved;
        inc.ResolutionNote = req.ResolutionNote.Trim();
        inc.ResolvedAt = DateTime.UtcNow;

        var tickets = await Db.Tickets.Where(t => t.IncidentId == id && OpenStatuses.Contains(t.Status)).ToListAsync();
        foreach (var t in tickets)
        {
            t.Status = TicketStatus.Resolved;
            t.ResolutionNote = inc.ResolutionNote;
            t.ResolvedAt = DateTime.UtcNow;
            Events.Notify(Db, t.TenantId, t.ReporterId, Me, "Sorununuz çözüldü ✔", $"{inc.Title}: {inc.ResolutionNote}", $"/tickets?rate={t.Id}");
        }
        await Db.SaveChangesAsync();
        return Ok(new { resolvedTickets = tickets.Count, notifiedUsers = tickets.Select(t => t.ReporterId).Distinct().Count() });
    }

    // Ticket formu için: yazılan metin aktif bir olaya ya da çok sayıda açık ticket'a benziyor mu?
    [HttpGet("match")]
    public async Task<IActionResult> Match([FromQuery] string? title, [FromQuery] string? description)
    {
        var text = $"{title} {description}".Trim();
        if (TextSim.Words(text).Count() < 1) return Ok(new { incident = (object?)null, similarOpen = 0 });
        var v = TextSim.Vec(title ?? "", description);

        var active = await Db.Incidents.Where(i => i.Status == IncidentStatus.Active).ToListAsync();
        object? best = null; double bestScore = 0;
        foreach (var i in active)
        {
            var linked = await Db.Tickets.Where(t => t.IncidentId == i.Id).Select(t => new { t.Title, t.Description }).ToListAsync();
            var score = new[] { TextSim.Cosine(v, TextSim.Vec(i.Title, i.Description)) }
                .Concat(linked.Select(t => TextSim.Cosine(v, TextSim.Vec(t.Title, t.Description)))).Max();
            if (score >= MatchThreshold && score > bestScore)
            {
                bestScore = score;
                best = new { i.Id, i.Title, i.Description, i.CreatedAt, affected = linked.Count, score = Math.Round(score, 2) };
            }
        }

        var since = DateTime.UtcNow.AddHours(-24);
        var recent = await Db.Tickets.Where(t => t.IncidentId == null && OpenStatuses.Contains(t.Status) && t.CreatedAt >= since)
            .Select(t => new { t.Title, t.Description }).ToListAsync();
        var similarOpen = recent.Count(t => TextSim.Cosine(v, TextSim.Vec(t.Title, t.Description)) >= MatchThreshold);
        return Ok(new { incident = best, similarOpen });
    }
}
