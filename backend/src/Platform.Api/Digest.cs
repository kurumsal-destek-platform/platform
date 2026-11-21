using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// ================= Haftalık yönetici özeti =================
public record DigestData(
    string Company, DateTime From, DateTime To,
    int Opened, int Resolved, int OpenNow, int BreachedOpen,
    int? SlaPercent, double? Csat, int CsatCount,
    int Deflected, double MoneySaved,
    List<(string Question, int Count)> TopUnanswered);

public static class Digest
{
    public static async Task<DigestData> BuildAsync(AppDbContext db, Guid tid, DateTime now, CancellationToken ct = default)
    {
        var from = now.AddDays(-7);
        var company = await db.Tenants.Where(t => t.Id == tid).Select(t => t.Name).FirstOrDefaultAsync(ct) ?? "";
        var tickets = db.Tickets.IgnoreQueryFilters().Where(t => t.TenantId == tid);
        var opened = await tickets.CountAsync(t => t.CreatedAt >= from, ct);
        var resolvedList = await tickets.Where(t => t.ResolvedAt >= from).ToListAsync(ct);
        var openNow = await tickets.CountAsync(t => Sla.OpenStatuses.Contains(t.Status), ct);
        var breachedOpen = await tickets.CountAsync(t => Sla.OpenStatuses.Contains(t.Status) && t.ResolutionDueAt < now, ct);

        var withTarget = resolvedList.Where(t => t.ResolutionDueAt != null).ToList();
        int? sla = withTarget.Count == 0 ? null : (int)Math.Round(100.0 * withTarget.Count(t => t.ResolvedAt <= t.ResolutionDueAt) / withTarget.Count);
        var rated = await tickets.Where(t => t.CsatAt >= from && t.CsatRating != null).Select(t => t.CsatRating!.Value).ToListAsync(ct);

        var (_, s) = await Sla.LoadAsync(db, tid, ignoreFilters: true);
        var deflected = await db.KbFeedbacks.IgnoreQueryFilters().CountAsync(f => f.TenantId == tid && f.CreatedAt >= from && f.Solved, ct);

        var unanswered = await db.AssistantQueries.IgnoreQueryFilters()
            .Where(q => q.TenantId == tid && q.CreatedAt >= from && !q.Answered).Select(q => q.Question).ToListAsync(ct);
        var top = unanswered.GroupBy(q => Automation.Lower(q).Trim().TrimEnd('?', '.', '!'))
            .Select(g => (Question: g.First().Trim(), Count: g.Count()))
            .OrderByDescending(x => x.Count).Take(3).ToList();

        return new DigestData(company, from, now, opened, resolvedList.Count, openNow, breachedOpen, sla,
            rated.Count == 0 ? null : Math.Round(rated.Average(), 2), rated.Count,
            deflected, Math.Round(deflected * s.MinutesPerTicket / 60.0 * s.HourlyCost), top);
    }

    public static string Html(DigestData d, string url)
    {
        string E(string x) => WebUtility.HtmlEncode(x);
        string Card(string label, string value) =>
            $"<td style=\"padding:12px;border:1px solid #dfe1e6;border-radius:6px;text-align:center\"><div style=\"font-size:22px;font-weight:600\">{value}</div><div style=\"font-size:12px;color:#626f86\">{label}</div></td>";
        var sb = new StringBuilder();
        sb.Append($"""
            <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#172b4d">
              <h2 style="margin:0 0 4px">◆ Haftalık destek özeti</h2>
              <div style="color:#626f86;margin-bottom:16px">{E(d.Company)} · {d.From.AddHours(3):dd.MM} – {d.To.AddHours(3):dd.MM.yyyy}</div>
              <table style="width:100%;border-spacing:8px"><tr>
                {Card("açılan ticket", d.Opened.ToString())}{Card("çözülen", d.Resolved.ToString())}
                {Card("SLA'ya uyum", d.SlaPercent is int p ? $"%{p}" : "–")}{Card("memnuniyet", d.Csat is double c ? $"{c:0.0}/5" : "–")}
              </tr></table>
            """);
        if (d.BreachedOpen > 0)
            sb.Append($"<p style=\"background:#ffebe6;padding:10px;border-radius:4px\">🔴 Süresi aşılmış <b>{d.BreachedOpen}</b> açık ticket var (toplam açık: {d.OpenNow}).</p>");
        else
            sb.Append($"<p>Şu an açık ticket: <b>{d.OpenNow}</b>, süresi aşılan yok. 👏</p>");
        sb.Append($"<p>Self-servisle ticket'sız çözülen sorun: <b>{d.Deflected}</b> (≈ {d.MoneySaved:N0} TL destek emeği).</p>");
        if (d.TopUnanswered.Count > 0)
        {
            sb.Append("<p style=\"margin-bottom:4px\"><b>Asistanın cevaplayamadığı sorular</b> (bilgi bankasına makale eklenebilir):</p><ol>");
            foreach (var (q, n) in d.TopUnanswered) sb.Append($"<li>{E(q)} <span style=\"color:#626f86\">({n} kez)</span></li>");
            sb.Append("</ol>");
        }
        sb.Append($"""
              <p style="margin:24px 0"><a href="{url}" style="background:#0c66e4;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Paneli aç</a></p>
              <p style="font-size:12px;color:#626f86">Bu özeti Ayarlar sayfasından kapatabilirsiniz.</p>
            </div>
            """);
        return sb.ToString();
    }

    // Bu haftanın pazartesi 09:00'ı (firma saatiyle), UTC olarak
    public static DateTime WeekSlotUtc(DateTime nowUtc, double offsetHours)
    {
        var local = nowUtc.AddHours(offsetHours);
        var monday = local.Date.AddDays(-(((int)local.DayOfWeek + 6) % 7));
        return DateTime.SpecifyKind(monday.AddHours(9).AddHours(-offsetHours), DateTimeKind.Utc);
    }

    public static bool IsDue(DateTime nowUtc, double offsetHours, DateTime? lastSentUtc)
    {
        var slot = WeekSlotUtc(nowUtc, offsetHours);
        return nowUtc >= slot && (lastSentUtc is null || lastSentUtc < slot);
    }
}

// Her 10 dakikada bir bakar; firma saatiyle pazartesi 09:00 geçtiyse ve bu hafta gönderilmediyse özeti yollar.
public class WeeklyDigestService : BackgroundService
{
    public static DateTime? LastRunAt { get; private set; }
    private readonly IServiceProvider _sp;
    private readonly ILogger<WeeklyDigestService> _log;
    public WeeklyDigestService(IServiceProvider sp, ILogger<WeeklyDigestService> log) { _sp = sp; _log = log; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromSeconds(30), ct);
        while (!ct.IsCancellationRequested)
        {
            try { await TickAsync(ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { _log.LogWarning(ex, "Haftalık özet gönderilemedi"); }
            await Task.Delay(TimeSpan.FromMinutes(10), ct);
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var mail = scope.ServiceProvider.GetRequiredService<IEmailSender>();
        var cfg = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var now = DateTime.UtcNow;
        LastRunAt = now;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var gotLock = await db.Database.SqlQueryRaw<bool>("SELECT pg_try_advisory_xact_lock(7342002) AS \"Value\"").FirstAsync(ct);
        if (!gotLock) return;

        var settings = await db.TenantSettings.IgnoreQueryFilters().Where(s => s.WeeklyDigest).ToListAsync(ct);
        foreach (var s in settings.Where(s => Digest.IsDue(now, s.UtcOffsetHours, s.LastDigestAt)))
        {
            var data = await Digest.BuildAsync(db, s.TenantId, now, ct);
            var html = Digest.Html(data, AuthTokens.FrontendUrl(cfg, "/performance"));
            var to = await db.Users.IgnoreQueryFilters()
                .Where(u => u.TenantId == s.TenantId && u.IsActive && (u.Role == Roles.Manager || u.Role == Roles.Admin))
                .Select(u => u.Email).ToListAsync(ct);
            foreach (var e in to) await mail.SendAsync(e, $"Haftalık destek özeti · {data.Company}", html);
            s.LastDigestAt = now;
            _log.LogInformation("Haftalık özet gönderildi: {Company} ({Count} kişi)", data.Company, to.Count);
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}
