using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// Otomasyon motoru: saf fonksiyonlar (birim testi var), veritabanına dokunmaz.
public static class Automation
{
    public static readonly string[] Priorities = { "Low", "Medium", "High", "Critical" };

    public static string PriorityLabel(string p) => p switch
    {
        "Low" => "Düşük", "Medium" => "Orta", "High" => "Yüksek", "Critical" => "Kritik", _ => p,
    };

    // Türkçe büyük/küçük harf: "İ"→"i", "I"→"ı" (ToLowerInvariant "VPN İzni"ni bozar)
    public static string Lower(string? s) => (s ?? "").Replace('İ', 'i').Replace('I', 'ı').ToLowerInvariant();

    public static List<string> Keywords(string? csv) =>
        (csv ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(Lower).Where(k => k.Length > 0).Distinct().ToList();

    public static bool Matches(AutomationRule r, string title, string description, string category, string priority, string? senderEmail)
    {
        if (!r.Enabled) return false;
        if (!string.IsNullOrWhiteSpace(r.WhenCategory) && Lower(r.WhenCategory) != Lower(category)) return false;
        if (!string.IsNullOrWhiteSpace(r.WhenPriority) && r.WhenPriority != priority) return false;
        var kws = Keywords(r.WhenKeywords);
        if (kws.Count > 0)
        {
            var text = Lower(title + " " + description);
            if (!kws.Any(text.Contains)) return false;
        }
        if (!string.IsNullOrWhiteSpace(r.WhenSenderDomain))
        {
            var domain = Lower(r.WhenSenderDomain).TrimStart('@');
            if (!Lower(senderEmail).EndsWith("@" + domain)) return false;
        }
        return true;
    }

    public record Change(AutomationRule Rule, string Summary);

    // Kuralları sırayla uygular; koşullar ticket'ın İLK haline bakar (bir kuralın değişikliği diğerini tetiklemez).
    // Atanacak kullanıcının geçerliliği çağıran tarafından kontrol edilir (validAssignees).
    public static List<Change> Apply(IEnumerable<AutomationRule> rules, Ticket t, string? senderEmail,
        IReadOnlyDictionary<Guid, string> validAssignees)
    {
        var (title, desc, cat, pri) = (t.Title, t.Description, t.Category, t.Priority);
        var changes = new List<Change>();
        foreach (var r in rules.OrderBy(r => r.SortOrder).ThenBy(r => r.CreatedAt))
        {
            if (!Matches(r, title, desc, cat, pri, senderEmail)) continue;
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(r.SetCategory) && r.SetCategory != t.Category)
            { t.Category = r.SetCategory; parts.Add($"kategori → {r.SetCategory}"); }
            if (r.SetPriority is string p && Priorities.Contains(p) && p != t.Priority)
            { t.Priority = p; parts.Add($"öncelik → {PriorityLabel(p)}"); }
            if (r.SetAssigneeId is Guid a && validAssignees.TryGetValue(a, out var name) && t.AssigneeId != a)
            {
                t.AssigneeId = a;
                if (t.Status == TicketStatus.Open) t.Status = TicketStatus.Assigned;
                parts.Add($"{name} kişisine atandı");
            }
            if (r.NotifyManagers) parts.Add("yöneticilere bildirildi");
            changes.Add(new Change(r, parts.Count > 0 ? string.Join(", ", parts) : "eşleşti"));
            if (r.StopProcessing) break;
        }
        return changes;
    }
}

// Yeni ticket'ın ortak yolu: portal, e-posta ve ileride başka kanallar aynı kuralları kullanır.
// Arka plan servislerinden de çağrıldığı için sorgular kiracı (tenant) filtresine güvenmez, açıkça filtreler.
public static class TicketIntake
{
    public static readonly Guid System = Guid.Empty;   // sistem notlarının yazarı (frontend "Sistem" gösterir)

    public static async Task<List<Automation.Change>> CreateAsync(AppDbContext db, Ticket t, Guid actorId, string? senderEmail, CancellationToken ct = default)
    {
        var tid = t.TenantId;
        var users = await db.Users.IgnoreQueryFilters().Where(u => u.TenantId == tid && u.IsActive)
            .Select(u => new { u.Id, u.FullName, u.Role }).ToListAsync(ct);
        var managers = users.Where(u => u.Role == Roles.Manager || u.Role == Roles.Admin).Select(u => u.Id).ToList();
        var assignable = users.ToDictionary(u => u.Id, u => u.FullName);   // IT çalışanları "Employee" rolünde olabilir

        // 1) Otomasyon kuralları (SLA hedefinden önce: öncelik değişirse süre de ona göre hesaplanır)
        var rules = await db.AutomationRules.IgnoreQueryFilters().Where(r => r.TenantId == tid && r.Enabled).ToListAsync(ct);
        // Bilinen bir olaya bağlanan ticket'a kural uygulanmaz (olay sahibi zaten ilgileniyor)
        var changes = t.IncidentId is null ? Automation.Apply(rules, t, senderEmail, assignable) : new List<Automation.Change>();

        // 2) SLA hedefleri
        var (policies, settings) = await Sla.LoadAsync(db, tid, ignoreFilters: true);
        Sla.ApplyTargets(t, policies, settings);
        db.Tickets.Add(t);

        // 3) Kural kayıtları: ticket geçmişinde (iç not) ve kural istatistiğinde görünür
        foreach (var c in changes)
        {
            c.Rule.RunCount++;
            c.Rule.LastRunAt = DateTime.UtcNow;
            db.TicketMessages.Add(new TicketMessage
            {
                TenantId = tid, TicketId = t.Id, AuthorId = TicketIntake.System, Internal = true,
                Body = $"⚙ Otomasyon: \"{c.Rule.Name}\" kuralı çalıştı ({c.Summary}).",
            });
            if (c.Rule.NotifyManagers)
                foreach (var m in managers)
                    Events.Notify(db, tid, m, actorId, $"⚙ Kural: {c.Rule.Name}", t.Title, $"/tickets?open={t.Id}");
        }
        if (t.AssigneeId is Guid a && changes.Count > 0)
            Events.Notify(db, tid, a, actorId, "Size yeni ticket atandı", t.Title, $"/tickets?open={t.Id}");

        // 4) Yöneticilere bildirim + olası büyük olay uyarısı (bilinen bir olaya bağlı değilse)
        if (t.IncidentId is null)
        {
            foreach (var m in managers)
                Events.Notify(db, tid, m, actorId, $"Yeni ticket: {t.Category}", t.Title, "/tickets");

            var since = DateTime.UtcNow.AddHours(-2);
            var recent = await db.Tickets.IgnoreQueryFilters().Where(x => x.TenantId == tid && x.IncidentId == null && x.CreatedAt >= since &&
                    (x.Status == TicketStatus.Open || x.Status == TicketStatus.Assigned || x.Status == TicketStatus.InProgress))
                .Select(x => new { x.Title, x.Description }).ToListAsync(ct);
            var v = TextSim.Vec(t.Title, t.Description);
            var similar = recent.Count(x => TextSim.Cosine(v, TextSim.Vec(x.Title, x.Description)) >= Controllers.IncidentsController.ClusterThreshold);
            if (similar >= 2)
                foreach (var m in managers)
                    Events.Notify(db, tid, m, Guid.Empty, "⚠ Olası büyük olay",
                        $"Son 2 saatte \"{t.Title}\" benzeri {similar + 1} ticket açıldı. Tek olayda birleştirmek ister misiniz?", "/incidents");
        }
        return changes;
    }
}
