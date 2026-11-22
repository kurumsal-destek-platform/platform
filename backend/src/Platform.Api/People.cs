using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// Kişi dizini, @anma ve "Kimler ilgilenir?" için ortak kurallar (saf kısımların birim testi var)
public static class People
{
    private static readonly CultureInfo Tr = new("tr-TR");
    public const string Vip = "VIP";

    public static string Fold(string? s) => (s ?? "").Trim().ToLower(Tr);

    // "ay de" → Ayşe Demir; "muh" → Muhasebe departmanı; kelime başlarından eşleşir
    public static bool Matches(string? fullName, string? department, string? email, string query)
    {
        var q = Fold(query);
        if (q.Length == 0) return true;
        var words = Fold(fullName).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var parts = q.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.All(p => words.Any(w => w.StartsWith(p)))) return true;
        if (Fold(department).Split(' ', StringSplitOptions.RemoveEmptyEntries).Any(w => w.StartsWith(q))) return true;
        return Fold(email).StartsWith(q);
    }

    // Metinde "@Ad Soyad" olarak gerçekten geçen kişiler (silinmiş anmalar bildirim göndermesin)
    public static List<Guid> MentionedIn(string text, IEnumerable<(Guid Id, string FullName)> candidates)
    {
        var t = Fold(text);
        return candidates.Where(c => c.FullName.Length > 0 && t.Contains("@" + Fold(c.FullName))).Select(c => c.Id).Distinct().ToList();
    }

    public static string[] NormalizeExpertise(IEnumerable<string>? items) =>
        (items ?? Array.Empty<string>()).Select(x => (x ?? "").Trim()).Where(x => x.Length is > 0 and <= 40)
            .Select(x => x.Equals("vip", StringComparison.OrdinalIgnoreCase) ? Vip : x)
            .Distinct(StringComparer.OrdinalIgnoreCase).Take(15).ToArray();

    // @anılan kişileri takipçi yapar ve bildirim gönderir. İç notta sadece destek ekibi anılabilir (çalışan iç notu göremez).
    public static async Task ApplyMentionsAsync(AppDbContext db, Ticket t, Guid actor, string text, IEnumerable<Guid>? requested, bool internalNote, string actorName)
    {
        var ids = (requested ?? Array.Empty<Guid>()).Distinct().Where(id => id != actor).Take(20).ToList();
        if (ids.Count == 0) return;
        var users = await db.Users.Where(u => ids.Contains(u.Id) && u.IsActive).Select(u => new { u.Id, u.FullName, u.Role }).ToListAsync();
        var valid = MentionedIn(text, users.Select(u => (u.Id, u.FullName)));
        foreach (var u in users.Where(u => valid.Contains(u.Id)))
        {
            var support = u.Role is Roles.Agent or Roles.Manager or Roles.Admin;
            if (internalNote && !support) continue;
            if (!t.Watchers.Contains(u.Id) && u.Id != t.ReporterId && u.Id != t.AssigneeId) t.Watchers = t.Watchers.Append(u.Id).ToArray();
            Events.Notify(db, t.TenantId, u.Id, actor, $"{actorName} sizi bir talepte andı",
                $"\"{t.Title}\": {TextUtil.Snip(text, 120)}", $"/tickets?open={t.Id}");
        }
    }
}
