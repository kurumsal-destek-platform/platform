using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateTicketRequest(string Title, string? Description, string? Category, string? Priority);
public record TicketStatusRequest(string Status, string? ResolutionNote);
public record ConvertTicketRequest(string ProjectKey, string? Type, Guid? AssigneeId, string? Priority);

[Route("api/tickets")]
public class TicketsController : ApiControllerBase
{
    public TicketsController(AppDbContext db) : base(db) { }

    private static object ToDto(Ticket t, Dictionary<Guid, string> names, Dictionary<Guid, string>? itemKeys = null) => new
    {
        t.Id, t.Title, t.Description, t.Category, t.Priority, t.Status, t.ResolutionNote, t.CreatedAt,
        t.ReporterId, reporterName = names.GetValueOrDefault(t.ReporterId),
        t.AssigneeId, assigneeName = t.AssigneeId is Guid a ? names.GetValueOrDefault(a) : null,
        t.WorkItemId,
        workItemKey = t.WorkItemId is Guid wid && itemKeys is not null ? itemKeys.GetValueOrDefault(wid) : null,
    };

    // Firmadaki her çalışan ticket açabilir.
    [HttpPost]
    public async Task<IActionResult> Create(CreateTicketRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest(new { message = "Başlık gerekli." });
        var t = new Ticket
        {
            Title = req.Title.Trim(), Description = req.Description ?? "",
            Category = req.Category ?? "Diğer", Priority = req.Priority ?? "Medium", ReporterId = Me,
        };
        Db.Tickets.Add(t);
        // Yöneticilere yeni ticket bildirimi
        var managers = await Db.Users.Where(u => u.Role == Roles.Manager || u.Role == Roles.Admin).Select(u => u.Id).ToListAsync();
        foreach (var m in managers)
            Events.Notify(Db, t.TenantId, m, Me, $"Yeni ticket: {t.Category}", t.Title, "/tickets");
        await Db.SaveChangesAsync();
        return Ok(ToDto(t, await UserNamesAsync()));
    }

    // Açtığım veya bana atanan ticketlar
    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        var list = await Db.Tickets.Where(t => t.ReporterId == Me || t.AssigneeId == Me)
            .OrderByDescending(t => t.CreatedAt).ToListAsync();
        var names = await UserNamesAsync();
        var keys = await ItemKeysAsync(list);
        return Ok(list.Select(t => ToDto(t, names, keys)));
    }

    // Tüm ticketlar: yönetici görünümü
    [HttpGet]
    public async Task<IActionResult> All([FromQuery] string? status)
    {
        if (!IsManagerOrAdmin) return Forbidden("Tüm ticketları sadece yöneticiler görebilir.");
        var q = Db.Tickets.AsQueryable();
        if (!string.IsNullOrEmpty(status)) q = q.Where(t => t.Status == status);
        var list = await q.OrderByDescending(t => t.CreatedAt).ToListAsync();
        var names = await UserNamesAsync();
        var keys = await ItemKeysAsync(list);
        return Ok(list.Select(t => ToDto(t, names, keys)));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var t = await Db.Tickets.FirstOrDefaultAsync(x => x.Id == id);
        if (t is null || !(t.ReporterId == Me || t.AssigneeId == Me || IsManagerOrAdmin)) return NotFound();
        return Ok(ToDto(t, await UserNamesAsync(), await ItemKeysAsync(new List<Ticket> { t })));
    }

    // Atama: yönetici
    [HttpPut("{id:guid}/assignee")]
    public async Task<IActionResult> Assign(Guid id, AssignRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Ticket atamak için yönetici olmalısınız.");
        var t = await Db.Tickets.FirstOrDefaultAsync(x => x.Id == id);
        if (t is null) return NotFound();
        if (req.AssigneeId is Guid a && !await Db.Users.AnyAsync(u => u.Id == a))
            return BadRequest(new { message = "Kullanıcı bulunamadı." });

        t.AssigneeId = req.AssigneeId;
        if (t.Status == TicketStatus.Open && req.AssigneeId is not null) t.Status = TicketStatus.Assigned;
        if (req.AssigneeId is Guid to)
            Events.Notify(Db, t.TenantId, to, Me, "Size bir ticket atandı", t.Title, "/tickets");
        await Db.SaveChangesAsync();
        return Ok(ToDto(t, await UserNamesAsync()));
    }

    // Durum: atanan kişi veya yönetici
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> ChangeStatus(Guid id, TicketStatusRequest req)
    {
        var t = await Db.Tickets.FirstOrDefaultAsync(x => x.Id == id);
        if (t is null) return NotFound();
        if (t.AssigneeId != Me && !IsManagerOrAdmin) return Forbidden("Durumu sadece atanan kişi veya yönetici değiştirebilir.");
        if (!TicketStatus.All.Contains(req.Status)) return BadRequest(new { message = "Geçersiz durum." });

        if (t.Status != req.Status)
            Events.Notify(Db, t.TenantId, t.ReporterId, Me, "Ticket durumunuz güncellendi",
                $"{t.Title} → {Events.StatusLabel(req.Status)}", "/tickets");
        t.Status = req.Status;
        if (req.ResolutionNote is not null) t.ResolutionNote = req.ResolutionNote;
        if (req.Status is TicketStatus.Resolved or TicketStatus.Closed) t.ResolvedAt ??= DateTime.UtcNow;
        else t.ResolvedAt = null;
        await Db.SaveChangesAsync();
        return Ok(ToDto(t, await UserNamesAsync()));
    }

    private async Task<Dictionary<Guid, string>> ItemKeysAsync(List<Ticket> list)
    {
        var ids = list.Where(t => t.WorkItemId != null).Select(t => t.WorkItemId!.Value).ToList();
        return ids.Count == 0 ? new() : await Db.WorkItems.Where(w => ids.Contains(w.Id)).ToDictionaryAsync(w => w.Id, w => w.Key);
    }

    // Ticket'ı proje görevine çevir: destek talebi geliştirme işine dönüşür, ikisi birbirine bağlı kalır.
    [HttpPost("{id:guid}/convert")]
    public async Task<IActionResult> Convert(Guid id, ConvertTicketRequest req)
    {
        var t = await Db.Tickets.FirstOrDefaultAsync(x => x.Id == id);
        if (t is null) return NotFound();
        if (t.WorkItemId is not null) return Conflict(new { message = "Bu ticket zaten bir göreve çevrilmiş." });

        var p = await Db.Projects.FirstOrDefaultAsync(x => x.Key == req.ProjectKey.ToUpper());
        if (p is null) return NotFound(new { message = "Proje bulunamadı." });
        var me = await MembershipAsync(p.Id);
        if (me is null || me.Role != ProjectRoles.Manager)
            return Forbidden("Ticket'ı göreve çevirmek için o projenin yöneticisi olmalısınız.");
        var type = req.Type ?? "Task";
        if (!WorkItemTypes.All.Contains(type) || type == "Epic") return BadRequest(new { message = "Geçersiz tür." });
        if (req.AssigneeId is Guid a && !await Db.ProjectMembers.AnyAsync(m => m.ProjectId == p.Id && m.UserId == a))
            return BadRequest(new { message = "Atanan kişi proje üyesi değil." });

        var maxRank = await Db.WorkItems.Where(w => w.ProjectId == p.Id).Select(w => (int?)w.Rank).MaxAsync() ?? 0;
        var item = new WorkItem
        {
            TenantId = p.TenantId, ProjectId = p.Id, Key = $"{p.Key}-{p.NextItemNumber}", Type = type,
            Title = t.Title,
            Description = $"{t.Description}\n\n— Ticket'tan oluşturuldu (kategori: {t.Category})".Trim(),
            Priority = req.Priority ?? t.Priority, AssigneeId = req.AssigneeId, ReporterId = Me,
            Labels = new[] { "ticket" }, Rank = maxRank + 1,
        };
        p.NextItemNumber++;
        Db.WorkItems.Add(item);
        Events.Log(Db, Me, item, "created");

        // Ticket'ın ekleri göreve de görünsün
        var attachments = await Db.Attachments.Where(x => x.TicketId == t.Id).ToListAsync();
        foreach (var at in attachments) at.WorkItemId = item.Id;

        t.WorkItemId = item.Id;
        if (t.Status is TicketStatus.Open or TicketStatus.Assigned) t.Status = TicketStatus.InProgress;

        var link = Events.ItemLink(p.Key, item.Key);
        Events.Notify(Db, t.TenantId, t.ReporterId, Me, "Ticket'ınız geliştirme ekibine aktarıldı",
            $"{t.Title} → {item.Key}", link);
        if (item.AssigneeId is Guid to)
            Events.Notify(Db, t.TenantId, to, Me, $"{item.Key} size atandı", item.Title, link);

        await Db.SaveChangesAsync();
        return Ok(new { workItemKey = item.Key, projectKey = p.Key });
    }

    // Çözülen ticket'tan bilgi bankası makalesi taslağı: aynı sorunu yaşayan bir sonraki kişi
    // ticket açmadan çözüme ulaşır, RAG asistanı da yayınlandıktan sonra bu bilgiyi kullanır.
    [HttpPost("{id:guid}/to-article")]
    public async Task<IActionResult> ToArticle(Guid id)
    {
        if (!IsManagerOrAdmin) return Forbidden("Makale oluşturmak için yönetici olmalısınız.");
        var t = await Db.Tickets.FirstOrDefaultAsync(x => x.Id == id);
        if (t is null) return NotFound();
        if (t.Status is not (TicketStatus.Resolved or TicketStatus.Closed))
            return BadRequest(new { message = "Sadece çözülmüş ticket'lardan makale oluşturulabilir." });
        if (string.IsNullOrWhiteSpace(t.ResolutionNote))
            return BadRequest(new { message = "Önce ticket'a bir çözüm notu yazın." });
        var existing = await Db.Articles.FirstOrDefaultAsync(a => a.SourceTicketId == t.Id);
        if (existing is not null) return Ok(new { existing.Id, existing.Title, existing.Published, alreadyExists = true });

        var a = new Article
        {
            TenantId = t.TenantId, Title = t.Title, Category = t.Category, Published = false, SourceTicketId = t.Id,
            Body = $"Sorun: {t.Description}\n\nÇözüm: {t.ResolutionNote}".Trim(),
        };
        Db.Articles.Add(a);
        await Db.SaveChangesAsync();
        return Ok(new { a.Id, a.Title, a.Published, alreadyExists = false });
    }
}
