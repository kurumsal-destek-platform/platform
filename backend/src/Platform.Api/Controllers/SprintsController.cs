using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateSprintRequest(string? Name, string? Goal);
public record StartSprintRequest(int? DurationDays, string? Goal);
public record CompleteSprintRequest(Guid? MoveToSprintId);   // null = bitmeyenler backlog'a
public record MoveToSprintRequest(Guid? SprintId);           // null = backlog'a
public record RankRequest(List<string> Keys);                // backlog sırası (anahtar listesi)

// Backlog ve sprintler (Jira'daki Backlog sayfası)
[Route("api")]
public class SprintsController : ApiControllerBase
{
    public SprintsController(AppDbContext db) : base(db) { }

    private async Task<(Project? P, ProjectMember? Me)> ProjectAsync(string key)
    {
        var p = await Db.Projects.FirstOrDefaultAsync(x => x.Key == key.ToUpper());
        if (p is null) return (null, null);
        return (p, await MembershipAsync(p.Id));
    }

    [HttpGet("projects/{key}/sprints")]
    public async Task<IActionResult> List(string key)
    {
        var (p, me) = await ProjectAsync(key);
        if (p is null || me is null) return NotFound();

        var sprints = await Db.Sprints.Where(s => s.ProjectId == p.Id && s.Status != SprintStatus.Closed)
            .OrderBy(s => s.CreatedAt).ToListAsync();
        var items = await Db.WorkItems.Where(w => w.ProjectId == p.Id && w.SprintId != null).ToListAsync();
        return Ok(sprints.Select(s =>
        {
            var mine = items.Where(i => i.SprintId == s.Id).ToList();
            return new
            {
                s.Id, s.Name, s.Goal, s.Status, s.StartDate, s.EndDate,
                itemCount = mine.Count,
                points = mine.Sum(i => i.StoryPoints ?? 0),
                donePoints = mine.Where(i => i.Status == WorkItemStatus.Done).Sum(i => i.StoryPoints ?? 0),
            };
        }));
    }

    [HttpGet("projects/{key}/sprints/active")]
    public async Task<IActionResult> Active(string key)
    {
        var (p, me) = await ProjectAsync(key);
        if (p is null || me is null) return NotFound();
        var s = await Db.Sprints.FirstOrDefaultAsync(x => x.ProjectId == p.Id && x.Status == SprintStatus.Active);
        return Ok(s is null ? null : new { s.Id, s.Name, s.Goal, s.Status, s.StartDate, s.EndDate });
    }

    [HttpPost("projects/{key}/sprints")]
    public async Task<IActionResult> Create(string key, CreateSprintRequest req)
    {
        var (p, me) = await ProjectAsync(key);
        if (p is null || me is null) return NotFound();
        if (me.Role != ProjectRoles.Manager) return Forbidden("Sprint oluşturmak için proje yöneticisi olmalısınız.");

        var count = await Db.Sprints.CountAsync(s => s.ProjectId == p.Id);
        var s = new Sprint
        {
            TenantId = p.TenantId, ProjectId = p.Id,
            Name = string.IsNullOrWhiteSpace(req.Name) ? $"{p.Key} Sprint {count + 1}" : req.Name.Trim(),
            Goal = req.Goal ?? "",
        };
        Db.Sprints.Add(s);
        await Db.SaveChangesAsync();
        return Ok(new { s.Id, s.Name, s.Goal, s.Status });
    }

    [HttpPost("sprints/{id:guid}/start")]
    public async Task<IActionResult> Start(Guid id, StartSprintRequest req)
    {
        var s = await Db.Sprints.FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return NotFound();
        var me = await MembershipAsync(s.ProjectId);
        if (me is null) return NotFound();
        if (me.Role != ProjectRoles.Manager) return Forbidden("Sprint başlatmak için proje yöneticisi olmalısınız.");
        if (s.Status != SprintStatus.Planned) return BadRequest(new { message = "Sadece planlanan sprint başlatılabilir." });
        if (await Db.Sprints.AnyAsync(x => x.ProjectId == s.ProjectId && x.Status == SprintStatus.Active))
            return BadRequest(new { message = "Bu projede zaten aktif bir sprint var. Önce onu tamamlayın." });
        if (!await Db.WorkItems.AnyAsync(w => w.SprintId == s.Id))
            return BadRequest(new { message = "Boş sprint başlatılamaz. Önce backlog'dan iş ekleyin." });

        s.Status = SprintStatus.Active;
        s.StartDate = DateTime.UtcNow;
        s.EndDate = DateTime.UtcNow.AddDays(req.DurationDays ?? 14);
        if (!string.IsNullOrWhiteSpace(req.Goal)) s.Goal = req.Goal;

        // Sprintteki işlerin atananlarına bildirim
        var assignees = await Db.WorkItems.Where(w => w.SprintId == s.Id && w.AssigneeId != null)
            .Select(w => w.AssigneeId!.Value).Distinct().ToListAsync();
        var projectKey = await Db.Projects.Where(p => p.Id == s.ProjectId).Select(p => p.Key).FirstAsync();
        foreach (var a in assignees)
            Events.Notify(Db, s.TenantId, a, Me, $"{s.Name} başladı", s.Goal, $"/projects/{projectKey}?tab=board");

        await Db.SaveChangesAsync();
        return Ok(new { s.Id, s.Name, s.Status, s.StartDate, s.EndDate });
    }

    [HttpPost("sprints/{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id, CompleteSprintRequest req)
    {
        var s = await Db.Sprints.FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return NotFound();
        var me = await MembershipAsync(s.ProjectId);
        if (me is null) return NotFound();
        if (me.Role != ProjectRoles.Manager) return Forbidden("Sprint tamamlamak için proje yöneticisi olmalısınız.");
        if (s.Status != SprintStatus.Active) return BadRequest(new { message = "Sadece aktif sprint tamamlanabilir." });
        if (req.MoveToSprintId is Guid target &&
            !await Db.Sprints.AnyAsync(x => x.Id == target && x.ProjectId == s.ProjectId && x.Status == SprintStatus.Planned))
            return BadRequest(new { message = "Hedef sprint bulunamadı." });

        var items = await Db.WorkItems.Where(w => w.SprintId == s.Id).ToListAsync();
        var unfinished = items.Where(w => w.Status != WorkItemStatus.Done).ToList();
        foreach (var w in unfinished)
        {
            w.SprintId = req.MoveToSprintId;
            Events.Log(Db, Me, w, "sprint", "Sprint", s.Name, req.MoveToSprintId is null ? "Backlog" : "Sonraki sprint");
        }
        s.Status = SprintStatus.Closed;
        s.EndDate = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return Ok(new { completed = items.Count - unfinished.Count, moved = unfinished.Count });
    }

    // Backlog ↔ sprint arası taşıma: proje yöneticisi
    [HttpPut("items/{key}/sprint")]
    public async Task<IActionResult> Move(string key, MoveToSprintRequest req)
    {
        var item = await Db.WorkItems.FirstOrDefaultAsync(w => w.Key == key.ToUpper());
        if (item is null) return NotFound();
        var me = await MembershipAsync(item.ProjectId);
        if (me is null) return NotFound();
        if (me.Role != ProjectRoles.Manager) return Forbidden("Sprint planlamak için proje yöneticisi olmalısınız.");

        Sprint? target = null;
        if (req.SprintId is Guid sid)
        {
            target = await Db.Sprints.FirstOrDefaultAsync(x => x.Id == sid && x.ProjectId == item.ProjectId);
            if (target is null || target.Status == SprintStatus.Closed) return BadRequest(new { message = "Sprint bulunamadı." });
        }
        var oldName = item.SprintId is Guid old ? await Db.Sprints.Where(x => x.Id == old).Select(x => x.Name).FirstOrDefaultAsync() : "Backlog";
        Events.Log(Db, Me, item, "sprint", "Sprint", oldName, target?.Name ?? "Backlog");
        item.SprintId = req.SprintId;
        item.UpdatedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return NoContent();
    }

    // Backlog sıralaması: gönderilen anahtar sırasına göre Rank verilir
    [HttpPut("projects/{key}/rank")]
    public async Task<IActionResult> Rank(string key, RankRequest req)
    {
        var (p, me) = await ProjectAsync(key);
        if (p is null || me is null) return NotFound();
        if (me.Role != ProjectRoles.Manager) return Forbidden("Sıralama için proje yöneticisi olmalısınız.");
        var items = await Db.WorkItems.Where(w => w.ProjectId == p.Id).ToListAsync();
        for (var i = 0; i < req.Keys.Count; i++)
        {
            var w = items.FirstOrDefault(x => x.Key == req.Keys[i]);
            if (w is not null) w.Rank = i + 1;
        }
        await Db.SaveChangesAsync();
        return NoContent();
    }
}
