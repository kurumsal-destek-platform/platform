using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CannedRequest(string Title, string Body, string? Category, bool Shared = true);
public record RenderRequest(Guid? TicketId);

// Hazır yanıtlar: destek ekibinin sık yazdığı cevaplar, ticket yazışmasına tek tıkla eklenir.
[Route("api/canned-responses")]
public class CannedResponsesController : ApiControllerBase
{
    public CannedResponsesController(AppDbContext db) : base(db) { }

    // Yer tutucular: {ad} çalışanın adı, {tam_ad} tam adı, {ticket} başlık, {benim_adim} yazan destek uzmanı
    public static string Render(string body, string? reporterName, string? ticketTitle, string? myName)
    {
        var first = (reporterName ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
        return body
            .Replace("{ad}", first)
            .Replace("{tam_ad}", reporterName ?? "")
            .Replace("{ticket}", ticketTitle ?? "")
            .Replace("{benim_adim}", myName ?? "");
    }

    private object Dto(CannedResponse c, Dictionary<Guid, string> names) => new
    {
        c.Id, c.Title, c.Body, c.Category, c.Shared, c.UsageCount, c.CreatedAt,
        createdBy = names.GetValueOrDefault(c.CreatedBy), mine = c.CreatedBy == Me,
        canEdit = c.CreatedBy == Me || IsManagerOrAdmin,
    };

    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (!IsSupport) return Forbidden("Hazır yanıtlar destek ekibi içindir.");
        var list = await Db.CannedResponses.Where(c => c.Shared || c.CreatedBy == Me)
            .OrderByDescending(c => c.UsageCount).ThenBy(c => c.Title).ToListAsync();
        var names = await UserNamesAsync();
        return Ok(list.Select(c => Dto(c, names)));
    }

    private static string? Validate(CannedRequest r) =>
        string.IsNullOrWhiteSpace(r.Title) ? "Başlık gerekli." :
        string.IsNullOrWhiteSpace(r.Body) ? "Metin gerekli." :
        r.Body.Length > 4000 ? "Metin en fazla 4000 karakter olabilir." : null;

    [HttpPost]
    public async Task<IActionResult> Create(CannedRequest req)
    {
        if (!IsSupport) return Forbidden("Hazır yanıtlar destek ekibi içindir.");
        if (Validate(req) is string err) return BadRequest(new { message = err });
        var c = new CannedResponse
        {
            Title = req.Title.Trim(), Body = req.Body.Trim(), Category = string.IsNullOrWhiteSpace(req.Category) ? null : req.Category,
            CreatedBy = Me, Shared = req.Shared,
        };
        Db.CannedResponses.Add(c);
        await Db.SaveChangesAsync();
        return Ok(Dto(c, await UserNamesAsync()));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, CannedRequest req)
    {
        var c = await Db.CannedResponses.FirstOrDefaultAsync(x => x.Id == id);
        if (c is null) return NotFound();
        if (c.CreatedBy != Me && !IsManagerOrAdmin) return Forbidden("Sadece oluşturan kişi veya yönetici düzenleyebilir.");
        if (Validate(req) is string err) return BadRequest(new { message = err });
        c.Title = req.Title.Trim(); c.Body = req.Body.Trim();
        c.Category = string.IsNullOrWhiteSpace(req.Category) ? null : req.Category; c.Shared = req.Shared;
        await Db.SaveChangesAsync();
        return Ok(Dto(c, await UserNamesAsync()));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var c = await Db.CannedResponses.FirstOrDefaultAsync(x => x.Id == id);
        if (c is null) return NotFound();
        if (c.CreatedBy != Me && !IsManagerOrAdmin) return Forbidden("Sadece oluşturan kişi veya yönetici silebilir.");
        Db.CannedResponses.Remove(c);
        await Db.SaveChangesAsync();
        return NoContent();
    }

    // Ticket'a göre doldurulmuş metni döner ve kullanım sayısını artırır (en çok kullanılanlar üstte çıkar)
    [HttpPost("{id:guid}/render")]
    public async Task<IActionResult> RenderFor(Guid id, RenderRequest req)
    {
        if (!IsSupport) return Forbidden("Hazır yanıtlar destek ekibi içindir.");
        var c = await Db.CannedResponses.FirstOrDefaultAsync(x => x.Id == id && (x.Shared || x.CreatedBy == Me));
        if (c is null) return NotFound();
        var names = await UserNamesAsync();
        var t = req.TicketId is Guid tid ? await Db.Tickets.FirstOrDefaultAsync(x => x.Id == tid) : null;
        c.UsageCount++;
        await Db.SaveChangesAsync();
        return Ok(new { body = Render(c.Body, t is null ? null : names.GetValueOrDefault(t.ReporterId), t?.Title, names.GetValueOrDefault(Me)) });
    }
}
