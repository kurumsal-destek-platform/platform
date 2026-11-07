using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateWorkItemRequest(string Title, string? Type, string? Description, string? Priority,
    Guid? AssigneeId, Guid? ParentId, DateTime? DueDate, int? StoryPoints, Guid? SprintId, string[]? Labels, DateTime? StartDate = null);
public record UpdateWorkItemRequest(string? Title, string? Description, string? Priority, DateTime? DueDate, int? StoryPoints, string[]? Labels, DateTime? StartDate = null);
public record SubtaskRequest(string Title, Guid? AssigneeId);
public record StatusRequest(string Status);
public record AssignRequest(Guid? AssigneeId);
public record CommentRequest(string Body);

[Route("api")]
public class WorkItemsController : ApiControllerBase
{
    public WorkItemsController(AppDbContext db) : base(db) { }

    private static string ProjectKeyOf(WorkItem w) => w.Key.Split('-')[0];

    public static object ToDto(WorkItem w, Dictionary<Guid, string> names, string? parentKey = null) => new
    {
        w.Id, w.Key, w.Type, w.Title, w.Description, w.Status, w.Priority, w.StartDate, w.DueDate, w.CreatedAt, w.UpdatedAt,
        w.ParentId, parentKey, w.StoryPoints, w.SprintId, w.Rank, w.Labels,
        w.AssigneeId, assigneeName = w.AssigneeId is Guid a ? names.GetValueOrDefault(a) : null,
        w.ReporterId, reporterName = names.GetValueOrDefault(w.ReporterId),
    };

    // Liste / pano / backlog verisi
    [HttpGet("projects/{key}/items")]
    public async Task<IActionResult> List(string key, [FromQuery] Guid? assigneeId, [FromQuery] string? status,
        [FromQuery] string? type, [FromQuery] Guid? sprintId, [FromQuery] bool? backlog,
        [FromQuery] string? label, [FromQuery] string? q)
    {
        var p = await Db.Projects.FirstOrDefaultAsync(x => x.Key == key.ToUpper());
        if (p is null || await MembershipAsync(p.Id) is null) return NotFound();

        var query = Db.WorkItems.Where(w => w.ProjectId == p.Id);
        if (assigneeId is Guid aid) query = query.Where(w => w.AssigneeId == aid);
        if (!string.IsNullOrEmpty(status)) query = query.Where(w => w.Status == status);
        if (!string.IsNullOrEmpty(type)) query = query.Where(w => w.Type == type);
        if (sprintId is Guid sid) query = query.Where(w => w.SprintId == sid);
        if (backlog == true) query = query.Where(w => w.SprintId == null);
        if (!string.IsNullOrWhiteSpace(label)) query = query.Where(w => w.Labels.Contains(label));
        if (!string.IsNullOrWhiteSpace(q)) query = query.Where(w => EF.Functions.ILike(w.Title, $"%{q}%") || EF.Functions.ILike(w.Key, $"%{q}%"));

        var items = await query.OrderBy(w => w.Rank).ThenBy(w => w.CreatedAt).ToListAsync();
        var names = await UserNamesAsync();
        var keys = items.ToDictionary(i => i.Id, i => i.Key);
        return Ok(items.Select(w => ToDto(w, names, w.ParentId is Guid pid ? keys.GetValueOrDefault(pid) : null)));
    }

    // Görev oluşturma: sadece proje yöneticisi
    [HttpPost("projects/{key}/items")]
    public async Task<IActionResult> Create(string key, CreateWorkItemRequest req)
    {
        var p = await Db.Projects.FirstOrDefaultAsync(x => x.Key == key.ToUpper());
        if (p is null) return NotFound();
        var me = await MembershipAsync(p.Id);
        if (me is null) return NotFound();
        if (me.Role != ProjectRoles.Manager) return Forbidden("Görev oluşturmak için proje yöneticisi olmalısınız.");

        var type = req.Type ?? "Task";
        if (!WorkItemTypes.All.Contains(type)) return BadRequest(new { message = "Geçersiz tür." });
        if (req.AssigneeId is Guid a && !await Db.ProjectMembers.AnyAsync(m => m.ProjectId == p.Id && m.UserId == a))
            return BadRequest(new { message = "Atanan kişi proje üyesi değil." });

        var maxRank = await Db.WorkItems.Where(w => w.ProjectId == p.Id).Select(w => (int?)w.Rank).MaxAsync() ?? 0;
        var item = new WorkItem
        {
            TenantId = p.TenantId,
            ProjectId = p.Id,
            Key = $"{p.Key}-{p.NextItemNumber}",
            Type = type, Title = req.Title, Description = req.Description ?? "",
            Priority = req.Priority ?? "Medium", AssigneeId = req.AssigneeId, ParentId = req.ParentId,
            DueDate = req.DueDate, ReporterId = Me, StoryPoints = req.StoryPoints, SprintId = req.SprintId,
            Labels = CleanLabels(req.Labels), StartDate = req.StartDate,
            Rank = maxRank + 1,
        };
        p.NextItemNumber++;
        Db.WorkItems.Add(item);
        Events.Log(Db, Me, item, "created");
        if (item.AssigneeId is Guid assignee)
            Events.Notify(Db, p.TenantId, assignee, Me, $"{item.Key} size atandı", item.Title, Events.ItemLink(p.Key, item.Key));
        await Db.SaveChangesAsync();
        return Ok(ToDto(item, await UserNamesAsync()));
    }

    [HttpGet("items/{key}")]
    public async Task<IActionResult> Get(string key)
    {
        var (item, me) = await LoadAsync(key);
        if (item is null || me is null) return NotFound();
        var names = await UserNamesAsync();
        var children = await Db.WorkItems.Where(w => w.ParentId == item.Id).ToListAsync();
        var sprint = item.SprintId is Guid sid ? await Db.Sprints.FirstOrDefaultAsync(s => s.Id == sid) : null;
        return Ok(new
        {
            item = ToDto(item, names),
            children = children.Select(c => ToDto(c, names)),
            sprint = sprint is null ? null : new { sprint.Id, sprint.Name, sprint.Status },
            permissions = new
            {
                canEdit = item.AssigneeId == Me,
                canAssign = me.Role == ProjectRoles.Manager,
                canComment = true,
            },
        });
    }

    // Alan değiştirme: SADECE atanan kişi
    [HttpPatch("items/{key}")]
    public async Task<IActionResult> Update(string key, UpdateWorkItemRequest req)
    {
        var (item, me) = await LoadAsync(key);
        if (item is null || me is null) return NotFound();
        if (item.AssigneeId != Me) return Forbidden("Bu görevi sadece atanan kişi değiştirebilir.");

        if (req.Title is not null && req.Title != item.Title)
        { Events.Log(Db, Me, item, "updated", "Başlık", item.Title, req.Title); item.Title = req.Title; }
        if (req.Description is not null && req.Description != item.Description)
        { Events.Log(Db, Me, item, "updated", "Açıklama"); item.Description = req.Description; }
        if (req.Priority is not null && req.Priority != item.Priority)
        { Events.Log(Db, Me, item, "updated", "Öncelik", item.Priority, req.Priority); item.Priority = req.Priority; }
        if (req.DueDate is not null && req.DueDate != item.DueDate)
        { Events.Log(Db, Me, item, "updated", "Bitiş tarihi", item.DueDate?.ToString("yyyy-MM-dd"), req.DueDate?.ToString("yyyy-MM-dd")); item.DueDate = req.DueDate; }
        if (req.StartDate is not null && req.StartDate != item.StartDate)
        { Events.Log(Db, Me, item, "updated", "Başlangıç tarihi", item.StartDate?.ToString("yyyy-MM-dd"), req.StartDate?.ToString("yyyy-MM-dd")); item.StartDate = req.StartDate; }
        if (req.StoryPoints is not null && req.StoryPoints != item.StoryPoints)
        { Events.Log(Db, Me, item, "updated", "Story point", item.StoryPoints?.ToString(), req.StoryPoints.ToString()); item.StoryPoints = req.StoryPoints; }

        if (req.Labels is not null)
        {
            var labels = CleanLabels(req.Labels);
            if (!labels.SequenceEqual(item.Labels))
            {
                Events.Log(Db, Me, item, "updated", "Etiketler", string.Join(", ", item.Labels), string.Join(", ", labels));
                item.Labels = labels;
            }
        }

        item.UpdatedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return Ok(ToDto(item, await UserNamesAsync()));
    }

    private static string[] CleanLabels(string[]? labels) =>
        (labels ?? Array.Empty<string>()).Select(l => l.Trim().ToLowerInvariant().Replace(' ', '-'))
            .Where(l => l.Length is > 0 and <= 30).Distinct().Take(10).ToArray();

    // Projede kullanılan etiketler (otomatik tamamlama için)
    [HttpGet("projects/{key}/labels")]
    public async Task<IActionResult> Labels(string key)
    {
        var p = await Db.Projects.FirstOrDefaultAsync(x => x.Key == key.ToUpper());
        if (p is null || await MembershipAsync(p.Id) is null) return NotFound();
        var all = await Db.WorkItems.Where(w => w.ProjectId == p.Id).Select(w => w.Labels).ToListAsync();
        return Ok(all.SelectMany(l => l).Distinct().OrderBy(l => l));
    }

    // Alt görev: proje yöneticisi ya da üst görevin atananı ekleyebilir
    [HttpPost("items/{key}/subtasks")]
    public async Task<IActionResult> AddSubtask(string key, SubtaskRequest req)
    {
        var (parent, me) = await LoadAsync(key);
        if (parent is null || me is null) return NotFound();
        if (me.Role != ProjectRoles.Manager && parent.AssigneeId != Me)
            return Forbidden("Alt görevi proje yöneticisi ya da görevin atananı ekleyebilir.");
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest(new { message = "Başlık gerekli." });
        if (req.AssigneeId is Guid a && !await Db.ProjectMembers.AnyAsync(m => m.ProjectId == parent.ProjectId && m.UserId == a))
            return BadRequest(new { message = "Atanan kişi proje üyesi değil." });

        var p = await Db.Projects.FirstAsync(x => x.Id == parent.ProjectId);
        var sub = new WorkItem
        {
            TenantId = p.TenantId, ProjectId = p.Id, Key = $"{p.Key}-{p.NextItemNumber}",
            Type = "Subtask", ParentId = parent.Id, Title = req.Title.Trim(), ReporterId = Me,
            AssigneeId = req.AssigneeId ?? Me, SprintId = parent.SprintId, Rank = parent.Rank,
        };
        p.NextItemNumber++;
        Db.WorkItems.Add(sub);
        Events.Log(Db, Me, sub, "created");
        Events.Log(Db, Me, parent, "updated", "Alt görev", null, sub.Key);
        if (sub.AssigneeId is Guid to)
            Events.Notify(Db, p.TenantId, to, Me, $"{sub.Key} size atandı", sub.Title, Events.ItemLink(p.Key, sub.Key));
        await Db.SaveChangesAsync();
        return Ok(ToDto(sub, await UserNamesAsync()));
    }

    // Durum değiştirme (panoda sürükle-bırak): SADECE atanan kişi
    [HttpPatch("items/{key}/status")]
    public async Task<IActionResult> ChangeStatus(string key, StatusRequest req)
    {
        var (item, me) = await LoadAsync(key);
        if (item is null || me is null) return NotFound();
        if (item.AssigneeId != Me) return Forbidden("Bu görevin durumunu sadece atanan kişi değiştirebilir.");
        if (!WorkItemStatus.All.Contains(req.Status)) return BadRequest(new { message = "Geçersiz durum." });
        if (req.Status == item.Status) return Ok(ToDto(item, await UserNamesAsync()));

        Events.Log(Db, Me, item, "status", "Durum", item.Status, req.Status);
        if (item.ReporterId != Me)
            Events.Notify(Db, item.TenantId, item.ReporterId, Me, $"{item.Key} durumu değişti",
                $"{item.Title} → {Events.StatusLabel(req.Status)}", Events.ItemLink(ProjectKeyOf(item), item.Key));
        item.Status = req.Status;
        item.UpdatedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return Ok(ToDto(item, await UserNamesAsync()));
    }

    // Atama: SADECE proje yöneticisi
    [HttpPut("items/{key}/assignee")]
    public async Task<IActionResult> Assign(string key, AssignRequest req)
    {
        var (item, me) = await LoadAsync(key);
        if (item is null || me is null) return NotFound();
        if (me.Role != ProjectRoles.Manager) return Forbidden("Atama yapmak için proje yöneticisi olmalısınız.");
        if (req.AssigneeId is Guid a && !await Db.ProjectMembers.AnyAsync(m => m.ProjectId == item.ProjectId && m.UserId == a))
            return BadRequest(new { message = "Atanan kişi proje üyesi değil." });

        var names = await UserNamesAsync();
        Events.Log(Db, Me, item, "assignee", "Atanan",
            item.AssigneeId is Guid o ? names.GetValueOrDefault(o) : null,
            req.AssigneeId is Guid n ? names.GetValueOrDefault(n) : null);
        if (req.AssigneeId is Guid newAssignee)
            Events.Notify(Db, item.TenantId, newAssignee, Me, $"{item.Key} size atandı", item.Title,
                Events.ItemLink(ProjectKeyOf(item), item.Key));

        item.AssigneeId = req.AssigneeId;
        item.UpdatedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return Ok(ToDto(item, names));
    }

    [HttpGet("items/{key}/comments")]
    public async Task<IActionResult> Comments(string key)
    {
        var (item, me) = await LoadAsync(key);
        if (item is null || me is null) return NotFound();
        var names = await UserNamesAsync();
        var list = await Db.Comments.Where(c => c.WorkItemId == item.Id).OrderBy(c => c.CreatedAt).ToListAsync();
        return Ok(list.Select(c => new { c.Id, c.Body, c.CreatedAt, c.AuthorId, authorName = names.GetValueOrDefault(c.AuthorId) }));
    }

    // Yorum: her proje üyesi. Atanan, raporlayan ve @bahsedilenlere bildirim gider.
    [HttpPost("items/{key}/comments")]
    public async Task<IActionResult> AddComment(string key, CommentRequest req)
    {
        var (item, me) = await LoadAsync(key);
        if (item is null || me is null) return NotFound();
        if (string.IsNullOrWhiteSpace(req.Body)) return BadRequest(new { message = "Yorum boş olamaz." });

        var body = req.Body.Trim();
        var c = new Comment { TenantId = item.TenantId, WorkItemId = item.Id, AuthorId = Me, Body = body };
        Db.Comments.Add(c);
        Events.Log(Db, Me, item, "comment");

        var link = Events.ItemLink(ProjectKeyOf(item), item.Key);
        var myName = (await Db.Users.Where(u => u.Id == Me).Select(u => u.FullName).FirstOrDefaultAsync()) ?? "Biri";
        var targets = new HashSet<Guid>();
        if (item.AssigneeId is Guid a) targets.Add(a);
        targets.Add(item.ReporterId);

        // @Ayşe gibi bahsetmeler: proje üyelerinin adının ilk kelimesiyle eşleşir
        var memberIds = await Db.ProjectMembers.Where(m => m.ProjectId == item.ProjectId).Select(m => m.UserId).ToListAsync();
        var members = await Db.Users.Where(u => memberIds.Contains(u.Id)).ToListAsync();
        foreach (var u in members)
        {
            var first = u.FullName.Split(' ')[0];
            if (body.Contains("@" + first, StringComparison.CurrentCultureIgnoreCase))
            {
                Events.Notify(Db, item.TenantId, u.Id, Me, $"{myName} sizden bahsetti ({item.Key})", body, link);
                targets.Remove(u.Id);
            }
        }
        foreach (var t in targets)
            Events.Notify(Db, item.TenantId, t, Me, $"{item.Key} için yeni yorum", $"{myName}: {body}", link);

        await Db.SaveChangesAsync();
        return Ok(new { c.Id, c.Body, c.CreatedAt, c.AuthorId, authorName = myName });
    }

    // Geçmiş sekmesi
    [HttpGet("items/{key}/activity")]
    public async Task<IActionResult> Activity(string key)
    {
        var (item, me) = await LoadAsync(key);
        if (item is null || me is null) return NotFound();
        var names = await UserNamesAsync();
        var list = await Db.ActivityLogs.Where(l => l.WorkItemId == item.Id).OrderByDescending(l => l.At).ToListAsync();
        return Ok(list.Select(l => new
        {
            l.Id, l.Action, l.Field, l.OldValue, l.NewValue, l.At, l.UserId, userName = names.GetValueOrDefault(l.UserId),
        }));
    }

    // Projenin son aktiviteleri (özet sayfası)
    [HttpGet("projects/{key}/activity")]
    public async Task<IActionResult> ProjectActivity(string key)
    {
        var p = await Db.Projects.FirstOrDefaultAsync(x => x.Key == key.ToUpper());
        if (p is null || await MembershipAsync(p.Id) is null) return NotFound();
        var names = await UserNamesAsync();
        var keys = await Db.WorkItems.Where(w => w.ProjectId == p.Id).ToDictionaryAsync(w => w.Id, w => w.Key);
        var list = await Db.ActivityLogs.Where(l => l.ProjectId == p.Id).OrderByDescending(l => l.At).Take(30).ToListAsync();
        return Ok(list.Select(l => new
        {
            l.Id, l.Action, l.Field, l.OldValue, l.NewValue, l.At, userName = names.GetValueOrDefault(l.UserId),
            itemKey = l.WorkItemId is Guid wid ? keys.GetValueOrDefault(wid) : null,
        }));
    }

    // Göreve ve kullanıcının o projedeki üyeliğine birlikte bakar.
    private async Task<(WorkItem? Item, ProjectMember? Me)> LoadAsync(string key)
    {
        var item = await Db.WorkItems.FirstOrDefaultAsync(w => w.Key == key.ToUpper());
        if (item is null) return (null, null);
        return (item, await MembershipAsync(item.ProjectId));
    }
}
