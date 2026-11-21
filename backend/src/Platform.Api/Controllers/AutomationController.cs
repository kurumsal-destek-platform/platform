using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record RuleRequest(
    string Name, bool Enabled = true, int SortOrder = 0,
    string? WhenCategory = null, string? WhenPriority = null, string? WhenKeywords = null, string? WhenSenderDomain = null,
    Guid? SetAssigneeId = null, string? SetPriority = null, string? SetCategory = null,
    bool NotifyManagers = false, bool StopProcessing = false);

public record RuleTestRequest(string Title, string? Description, string? Category, string? Priority, string? SenderEmail);

// Otomasyon kuralları: yöneticiler ekler/düzenler; yeni ticket açılınca sırayla çalışır.
[Route("api/automation/rules")]
public class AutomationController : ApiControllerBase
{
    public AutomationController(AppDbContext db) : base(db) { }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private async Task<string?> ValidateAsync(RuleRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return "Kural adı gerekli.";
        if (r.WhenPriority is string wp && !Automation.Priorities.Contains(wp)) return "Geçersiz öncelik koşulu.";
        if (r.SetPriority is string sp && !Automation.Priorities.Contains(sp)) return "Geçersiz öncelik.";
        if (r.SetAssigneeId is null && Clean(r.SetPriority) is null && Clean(r.SetCategory) is null && !r.NotifyManagers)
            return "En az bir eylem seçin: ata, öncelik, kategori veya bildirim.";
        if (r.SetAssigneeId is Guid a &&
            !await Db.Users.AnyAsync(u => u.Id == a && u.IsActive && u.PasswordHash != ""))
            return "Atanacak kişi firmada aktif bir kullanıcı olmalı.";
        return null;
    }

    private static void Map(AutomationRule x, RuleRequest r)
    {
        x.Name = r.Name.Trim(); x.Enabled = r.Enabled; x.SortOrder = r.SortOrder;
        x.WhenCategory = Clean(r.WhenCategory); x.WhenPriority = Clean(r.WhenPriority);
        x.WhenKeywords = Clean(r.WhenKeywords); x.WhenSenderDomain = Clean(r.WhenSenderDomain)?.TrimStart('@');
        x.SetAssigneeId = r.SetAssigneeId; x.SetPriority = Clean(r.SetPriority); x.SetCategory = Clean(r.SetCategory);
        x.NotifyManagers = r.NotifyManagers; x.StopProcessing = r.StopProcessing;
    }

    private static object Dto(AutomationRule r, Dictionary<Guid, string> names) => new
    {
        r.Id, r.Name, r.Enabled, r.SortOrder,
        r.WhenCategory, r.WhenPriority, r.WhenKeywords, r.WhenSenderDomain,
        r.SetAssigneeId, assigneeName = r.SetAssigneeId is Guid a ? names.GetValueOrDefault(a) : null,
        r.SetPriority, r.SetCategory, r.NotifyManagers, r.StopProcessing,
        r.RunCount, r.LastRunAt, r.CreatedAt,
    };

    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (!IsManagerOrAdmin) return Forbidden("Kuralları sadece yöneticiler görebilir.");
        var names = await UserNamesAsync();
        var rules = await Db.AutomationRules.OrderBy(r => r.SortOrder).ThenBy(r => r.CreatedAt).ToListAsync();
        return Ok(rules.Select(r => Dto(r, names)));
    }

    [HttpPost]
    public async Task<IActionResult> Create(RuleRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Kural eklemek için yönetici olmalısınız.");
        if (await ValidateAsync(req) is string err) return BadRequest(new { message = err });
        var r = new AutomationRule();
        Map(r, req);
        Db.AutomationRules.Add(r);
        await Db.SaveChangesAsync();
        return Ok(Dto(r, await UserNamesAsync()));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, RuleRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Kural düzenlemek için yönetici olmalısınız.");
        var r = await Db.AutomationRules.FirstOrDefaultAsync(x => x.Id == id);
        if (r is null) return NotFound();
        if (await ValidateAsync(req) is string err) return BadRequest(new { message = err });
        Map(r, req);
        await Db.SaveChangesAsync();
        return Ok(Dto(r, await UserNamesAsync()));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!IsManagerOrAdmin) return Forbidden("Kural silmek için yönetici olmalısınız.");
        var r = await Db.AutomationRules.FirstOrDefaultAsync(x => x.Id == id);
        if (r is null) return NotFound();
        Db.AutomationRules.Remove(r);
        await Db.SaveChangesAsync();
        return NoContent();
    }

    // Deneme: bu ticket açılsaydı hangi kurallar çalışırdı? Hiçbir şey kaydedilmez.
    [HttpPost("test")]
    public async Task<IActionResult> Test(RuleTestRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Sadece yöneticiler.");
        var rules = await Db.AutomationRules.Where(r => r.Enabled).ToListAsync();
        var support = await Db.Users.Where(u => u.IsActive).ToDictionaryAsync(u => u.Id, u => u.FullName);
        var t = new Ticket
        {
            Title = req.Title ?? "", Description = req.Description ?? "",
            Category = req.Category ?? "Diğer", Priority = req.Priority ?? "Medium",
        };
        var changes = Automation.Apply(rules, t, req.SenderEmail, support);
        return Ok(new
        {
            matched = changes.Select(c => new { ruleId = c.Rule.Id, rule = c.Rule.Name, summary = c.Summary }),
            result = new { t.Category, t.Priority, t.AssigneeId, assigneeName = t.AssigneeId is Guid a ? support.GetValueOrDefault(a) : null },
        });
    }
}
