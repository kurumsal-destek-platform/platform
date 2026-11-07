using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

// Üst bardaki global arama: görevler, ticketlar, makaleler. Firma filtresi otomatik.
[Route("api/search")]
public class SearchController : ApiControllerBase
{
    public SearchController(AppDbContext db) : base(db) { }

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        q = (q ?? "").Trim();
        if (q.Length < 2) return Ok(new { items = Array.Empty<object>(), tickets = Array.Empty<object>(), articles = Array.Empty<object>() });
        var like = $"%{q}%";

        var myProjects = await Db.ProjectMembers.Where(m => m.UserId == Me).Select(m => m.ProjectId).ToListAsync();
        var projectKeys = await Db.Projects.Where(p => myProjects.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Key);

        var items = await Db.WorkItems
            .Where(w => myProjects.Contains(w.ProjectId) &&
                        (EF.Functions.ILike(w.Key, like) || EF.Functions.ILike(w.Title, like)))
            .OrderByDescending(w => w.UpdatedAt).Take(8).ToListAsync();

        var ticketQuery = Db.Tickets.Where(t => EF.Functions.ILike(t.Title, like));
        if (!IsManagerOrAdmin) ticketQuery = ticketQuery.Where(t => t.ReporterId == Me || t.AssigneeId == Me);
        var tickets = await ticketQuery.OrderByDescending(t => t.CreatedAt).Take(5).ToListAsync();

        var articles = await Db.Articles
            .Where(a => a.Published && (EF.Functions.ILike(a.Title, like) || EF.Functions.ILike(a.Body, like)))
            .Take(5).ToListAsync();

        return Ok(new
        {
            items = items.Select(w => new { w.Key, w.Title, w.Type, w.Status, projectKey = projectKeys.GetValueOrDefault(w.ProjectId) }),
            tickets = tickets.Select(t => new { t.Id, t.Title, t.Status }),
            articles = articles.Select(a => new { a.Id, a.Title, a.Category }),
        });
    }
}
