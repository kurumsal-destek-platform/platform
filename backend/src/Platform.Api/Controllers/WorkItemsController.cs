using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateWorkItemRequest(string Title, string? Type, string? Description, string? Priority,
    Guid? AssigneeId, Guid? ParentId, DateTime? DueDate);
public record UpdateWorkItemRequest(string? Title, string? Description, string? Priority, DateTime? DueDate);
public record StatusRequest(string Status);
public record AssignRequest(Guid? AssigneeId);
public record CommentRequest(string Body);

[Route("api")]
public class WorkItemsController : ApiControllerBase
{
    public WorkItemsController(AppDbContext db) : base(db) { }

    private static object ToDto(WorkItem w, Dictionary<Guid, string> names, string? parentKey = null) => new
    {
        w.Id, w.Key, w.Type, w.Title, w.Description, w.Status, w.Priority, w.DueDate, w.CreatedAt, w.UpdatedAt,
        w.ParentId, parentKey,
        w.AssigneeId, assigneeName = w.AssigneeId is Guid a ? names.GetValueOrDefault(a) : null,
        w.ReporterId, reporterName = names.GetValueOrDefault(w.ReporterId),
    };

    // Liste / pano verisi
    [HttpGet("projects/{key}/items")]
    public async Task<IActionResult> List(string key, [FromQuery] Guid? assigneeId, [FromQuery] string? status, [FromQuery] string? type)
    {
        var p = await Db.Projects.FirstOrDefaultAsync(x => x.Key == key.ToUpper());
        if (p is null || await MembershipAsync(p.Id) is null) return NotFound();

        var q = Db.WorkItems.Where(w => w.ProjectId == p.Id);
        if (assigneeId is Guid aid) q = q.Where(w => w.AssigneeId == aid);
        if (!string.IsNullOrEmpty(status)) q = q.Where(w => w.Status == status);
        if (!string.IsNullOrEmpty(type)) q = q.Where(w => w.Type == type);

        var items = await q.OrderBy(w => w.CreatedAt).ToListAsync();
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

        var item = new WorkItem
        {
            ProjectId = p.Id,
            Key = $"{p.Key}-{p.NextItemNumber}",
            Type = type, Title = req.Title, Description = req.Description ?? "",
            Priority = req.Priority ?? "Medium", AssigneeId = req.AssigneeId, ParentId = req.ParentId,
            DueDate = req.DueDate, ReporterId = Me,
        };
        p.NextItemNumber++;
        Db.WorkItems.Add(item);
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
        return Ok(new
        {
            item = ToDto(item, names),
            children = children.Select(c => ToDto(c, names)),
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

        if (req.Title is not null) item.Title = req.Title;
        if (req.Description is not null) item.Description = req.Description;
        if (req.Priority is not null) item.Priority = req.Priority;
        if (req.DueDate is not null) item.DueDate = req.DueDate;
        item.UpdatedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return Ok(ToDto(item, await UserNamesAsync()));
    }

    // Durum değiştirme (panoda sürükle-bırak): SADECE atanan kişi
    [HttpPatch("items/{key}/status")]
    public async Task<IActionResult> ChangeStatus(string key, StatusRequest req)
    {
        var (item, me) = await LoadAsync(key);
        if (item is null || me is null) return NotFound();
        if (item.AssigneeId != Me) return Forbidden("Bu görevin durumunu sadece atanan kişi değiştirebilir.");
        if (!WorkItemStatus.All.Contains(req.Status)) return BadRequest(new { message = "Geçersiz durum." });

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

        item.AssigneeId = req.AssigneeId;
        item.UpdatedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return Ok(ToDto(item, await UserNamesAsync()));
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

    // Yorum: her proje üyesi
    [HttpPost("items/{key}/comments")]
    public async Task<IActionResult> AddComment(string key, CommentRequest req)
    {
        var (item, me) = await LoadAsync(key);
        if (item is null || me is null) return NotFound();
        if (string.IsNullOrWhiteSpace(req.Body)) return BadRequest(new { message = "Yorum boş olamaz." });

        var c = new Comment { WorkItemId = item.Id, AuthorId = Me, Body = req.Body.Trim() };
        Db.Comments.Add(c);
        await Db.SaveChangesAsync();
        return Ok(new { c.Id, c.Body, c.CreatedAt, c.AuthorId });
    }

    // Göreve ve kullanıcının o projedeki üyeliğine birlikte bakar.
    private async Task<(WorkItem? Item, ProjectMember? Me)> LoadAsync(string key)
    {
        var item = await Db.WorkItems.FirstOrDefaultAsync(w => w.Key == key.ToUpper());
        if (item is null) return (null, null);
        return (item, await MembershipAsync(item.ProjectId));
    }
}
