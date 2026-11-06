using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateTicketRequest(string Title, string? Description, string? Category, string? Priority);
public record TicketStatusRequest(string Status, string? ResolutionNote);

[Route("api/tickets")]
public class TicketsController : ApiControllerBase
{
    public TicketsController(AppDbContext db) : base(db) { }

    private static object ToDto(Ticket t, Dictionary<Guid, string> names) => new
    {
        t.Id, t.Title, t.Description, t.Category, t.Priority, t.Status, t.ResolutionNote, t.CreatedAt,
        t.ReporterId, reporterName = names.GetValueOrDefault(t.ReporterId),
        t.AssigneeId, assigneeName = t.AssigneeId is Guid a ? names.GetValueOrDefault(a) : null,
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
        return Ok(list.Select(t => ToDto(t, names)));
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
        return Ok(list.Select(t => ToDto(t, names)));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var t = await Db.Tickets.FirstOrDefaultAsync(x => x.Id == id);
        if (t is null || !(t.ReporterId == Me || t.AssigneeId == Me || IsManagerOrAdmin)) return NotFound();
        return Ok(ToDto(t, await UserNamesAsync()));
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

        t.Status = req.Status;
        if (req.ResolutionNote is not null) t.ResolutionNote = req.ResolutionNote;
        await Db.SaveChangesAsync();
        return Ok(ToDto(t, await UserNamesAsync()));
    }
}
