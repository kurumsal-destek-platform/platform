using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

// Kişi dizini (@anma için) ve "Kimler ilgilenir?" (konuya göre destek ekibi)
[Route("api/people")]
public class PeopleController : ApiControllerBase
{
    private static readonly string[] Open = { TicketStatus.Open, TicketStatus.Assigned, TicketStatus.InProgress, TicketStatus.Waiting };
    private static readonly string[] Done = { TicketStatus.Resolved, TicketStatus.Closed };

    public PeopleController(AppDbContext db) : base(db) { }

    // @ yazınca açılan liste: ad, soyad, departman veya e-posta başından arar. Sadece aynı firmadaki aktif kişiler.
    [HttpGet("directory")]
    public async Task<IActionResult> Directory([FromQuery] string? q, [FromQuery] int limit = 8)
    {
        limit = Math.Clamp(limit, 1, 30);
        var users = await Db.Users.Where(u => u.IsActive && u.PasswordHash != "")
            .Select(u => new { u.Id, u.FullName, u.Department, u.Role, u.Email }).ToListAsync();
        var hits = users.Where(u => People.Matches(u.FullName, u.Department, u.Email, q ?? ""))
            .OrderBy(u => u.Id == Me ? 1 : 0)                                           // kendisi en sonda
            .ThenBy(u => People.Fold(u.FullName).StartsWith(People.Fold(q)) ? 0 : 1)     // ad başı eşleşmesi önce
            .ThenBy(u => u.FullName).Take(limit);
        return Ok(hits.Select(u => new { u.Id, u.FullName, u.Department, u.Role }));
    }

    // Uzmanlık alanı seçenekleri: kategoriler + VIP + kullanılanlar
    [HttpGet("expertise-areas")]
    public async Task<IActionResult> Areas()
    {
        var used = (await Db.Users.Select(u => u.Expertise).ToListAsync()).SelectMany(x => x);
        var defaults = new[] { "Donanım", "Yazılım/Lisans", "Ağ/VPN", "Erişim/Hesap", "E-posta", People.Vip };
        return Ok(defaults.Concat(used).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x == People.Vip ? 0 : 1).ThenBy(x => x));
    }

    // "Kimler ilgilenir?": konuya (kategori / VIP / serbest alan) ve isteğe bağlı başlık-açıklamaya göre destek ekibi.
    // Sıralama: tanımlı uzmanlık + bu konuda çözdüğü ticket + benzer sorun deneyimi − şu anki iş yükü.
    // Çalışanlar da görür (kime yazacağını bilsin); iş yükü detayı sadece destek ekibine gösterilir.
    [HttpGet("experts")]
    public async Task<IActionResult> Experts([FromQuery] string? area, [FromQuery] string? title, [FromQuery] string? description)
    {
        var team = await Db.Users.Where(u => u.IsActive && u.PasswordHash != "" && u.Role != Roles.Employee).ToListAsync();
        var since = DateTime.UtcNow.AddDays(-180);
        var resolved = await Db.Tickets.Where(t => t.AssigneeId != null && Done.Contains(t.Status) && t.CreatedAt >= since)
            .Select(t => new { t.AssigneeId, t.Category, t.Priority, t.Title, t.Description, t.CreatedAt, t.ResolvedAt }).ToListAsync();
        var load = await Db.Tickets.Where(t => t.AssigneeId != null && Open.Contains(t.Status))
            .GroupBy(t => t.AssigneeId).Select(g => new { g.Key, n = g.Count() }).ToDictionaryAsync(x => x.Key!.Value, x => x.n);
        var csat = await Db.Tickets.Where(t => t.AssigneeId != null && t.CsatRating != null && t.CreatedAt >= since)
            .GroupBy(t => t.AssigneeId).Select(g => new { g.Key, avg = g.Average(t => (double)t.CsatRating!) }).ToDictionaryAsync(x => x.Key!.Value, x => x.avg);

        var a = (area ?? "").Trim();
        var isVip = a.Equals(People.Vip, StringComparison.OrdinalIgnoreCase);
        var text = $"{title} {description}".Trim();
        var v = text.Length > 0 ? TextSim.Vec(title ?? "", description ?? "") : null;

        var rows = team.Select(u =>
        {
            var mine = resolved.Where(t => t.AssigneeId == u.Id).ToList();
            var inArea = a.Length == 0 ? mine.Count
                : isVip ? mine.Count(t => t.Priority == "Critical")
                : mine.Count(t => string.Equals(t.Category, a, StringComparison.OrdinalIgnoreCase));
            var similar = v is null ? 0 : mine.Count(t => TextSim.Cosine(v, TextSim.Vec(t.Title, t.Description)) >= 0.25);
            var hours = mine.Where(t => t.ResolvedAt != null && (a.Length == 0 || t.Category == a))
                .Select(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours).DefaultIfEmpty(-1).Average();
            var declared = a.Length > 0 && u.Expertise.Any(x => x.Equals(a, StringComparison.OrdinalIgnoreCase));
            var busy = load.GetValueOrDefault(u.Id);
            var score = (declared ? 6 : 0) + Math.Min(inArea, 20) * 0.5 + similar * 1.5 - busy * 0.4;
            return new { u, declared, inArea, similar, hours, busy, score };
        })
        .Where(r => a.Length == 0 || r.declared || r.inArea > 0 || r.similar > 0)
        .OrderByDescending(r => r.score).ThenBy(r => r.u.FullName).ToList();

        return Ok(rows.Select(r => new
        {
            id = r.u.Id, fullName = r.u.FullName, department = r.u.Department, role = r.u.Role, expertise = r.u.Expertise,
            declared = r.declared, solvedInArea = r.inArea, similarSolved = r.similar,
            avgHours = r.hours > 0 ? Math.Round(r.hours, 1) : (double?)null,
            csat = csat.TryGetValue(r.u.Id, out var c) ? Math.Round(c, 1) : (double?)null,
            openLoad = IsSupport ? r.busy : (int?)null,
            availability = r.busy <= 2 ? "available" : r.busy <= 5 ? "busy" : "overloaded",
            isMe = r.u.Id == Me,
        }));
    }
}
