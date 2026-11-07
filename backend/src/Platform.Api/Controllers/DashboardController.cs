using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

// Yönetici gösterge paneli: görev ve ticket özetleri, AI'nın engellediği ticket oranı
[Route("api/dashboard")]
public class DashboardController : ApiControllerBase
{
    public DashboardController(AppDbContext db) : base(db) { }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        if (!IsManagerOrAdmin) return Forbidden("Gösterge panelini sadece yöneticiler görebilir.");

        var names = await UserNamesAsync();
        var now = DateTime.UtcNow;
        var items = await Db.WorkItems.Where(w => w.Type != "Epic").ToListAsync();
        var tickets = await Db.Tickets.ToListAsync();
        var feedback = await Db.KbFeedbacks.CountAsync(f => f.Solved);

        var resolved = tickets.Where(t => t.ResolvedAt != null).ToList();
        double? avgHours = resolved.Count == 0 ? null
            : Math.Round(resolved.Average(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours), 1);

        var projects = await Db.Projects.ToListAsync();
        var activeSprints = await Db.Sprints.Where(s => s.Status == SprintStatus.Active).ToListAsync();

        return Ok(new
        {
            workItems = new
            {
                total = items.Count,
                byStatus = WorkItemStatus.All.Select(s => new { status = s, count = items.Count(i => i.Status == s) }),
                overdue = items.Count(i => i.DueDate < now && i.Status != WorkItemStatus.Done),
                unassigned = items.Count(i => i.AssigneeId == null && i.Status != WorkItemStatus.Done),
                byAssignee = items.Where(i => i.AssigneeId != null && i.Status != WorkItemStatus.Done)
                    .GroupBy(i => i.AssigneeId!.Value)
                    .Select(g => new { name = names.GetValueOrDefault(g.Key, "?"), open = g.Count(), points = g.Sum(i => i.StoryPoints ?? 0) })
                    .OrderByDescending(x => x.open),
            },
            tickets = new
            {
                total = tickets.Count,
                open = tickets.Count(t => t.Status != TicketStatus.Resolved && t.Status != TicketStatus.Closed),
                byStatus = TicketStatus.All.Select(s => new { status = s, count = tickets.Count(t => t.Status == s) }),
                byCategory = tickets.GroupBy(t => t.Category).Select(g => new { category = g.Key, count = g.Count() })
                    .OrderByDescending(x => x.count),
                avgResolutionHours = avgHours,
            },
            selfService = new
            {
                solvedWithoutTicket = feedback,
                ticketsCreated = tickets.Count,
                // Kullanıcıların ne kadarı ticket açmadan sorununu çözdü
                deflectionRate = feedback + tickets.Count == 0 ? 0 : Math.Round(100.0 * feedback / (feedback + tickets.Count), 1),
            },
            projects = projects.Select(p =>
            {
                var pi = items.Where(i => i.ProjectId == p.Id).ToList();
                var sprint = activeSprints.FirstOrDefault(s => s.ProjectId == p.Id);
                var si = sprint is null ? new List<WorkItem>() : pi.Where(i => i.SprintId == sprint.Id).ToList();
                return new
                {
                    p.Key, p.Name,
                    total = pi.Count,
                    done = pi.Count(i => i.Status == WorkItemStatus.Done),
                    activeSprint = sprint is null ? null : new
                    {
                        sprint.Name, sprint.EndDate,
                        points = si.Sum(i => i.StoryPoints ?? 0),
                        donePoints = si.Where(i => i.Status == WorkItemStatus.Done).Sum(i => i.StoryPoints ?? 0),
                    },
                };
            }),
        });
    }
}
