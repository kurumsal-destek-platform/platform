using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record SlaPolicyDto(string Priority, double ResponseHours, double ResolutionHours);
public record SettingsRequest(int WorkStartHour, int WorkEndHour, int[] WorkDays, double HourlyCost, double MinutesPerTicket, SlaPolicyDto[] Policies);

// Ayarlar (mesai, SLA hedefleri, maliyet) + performans panoları (SLA uyumu, memnuniyet, tasarruf)
[Route("api")]
public class PerformanceController : ApiControllerBase
{
    public PerformanceController(AppDbContext db) : base(db) { }

    private Guid TenantId => Guid.Parse(User.FindFirst("tenant_id")!.Value);
    private static readonly string[] Prio = { "Critical", "High", "Medium", "Low" };

    // ---------------- Ayarlar ----------------
    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        if (!IsManagerOrAdmin) return Forbidden("Sadece yöneticiler.");
        var (policies, s) = await Sla.LoadAsync(Db, TenantId);
        return Ok(new
        {
            s.WorkStartHour, s.WorkEndHour, workDays = s.WorkDays.Split(',').Select(int.Parse), s.HourlyCost, s.MinutesPerTicket,
            policies = Prio.Select(p => policies.FirstOrDefault(x => x.Priority == p)).Where(p => p != null)
                .Select(p => new SlaPolicyDto(p!.Priority, p.ResponseHours, p.ResolutionHours)),
        });
    }

    [HttpPut("settings")]
    public async Task<IActionResult> SaveSettings(SettingsRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Sadece yöneticiler.");
        if (req.WorkStartHour is < 0 or > 23 || req.WorkEndHour is < 1 or > 24 || req.WorkEndHour <= req.WorkStartHour)
            return BadRequest(new { message = "Mesai saatleri geçersiz." });
        if (req.WorkDays.Length == 0 || req.WorkDays.Any(d => d is < 1 or > 7)) return BadRequest(new { message = "En az bir iş günü seçin." });
        if (req.Policies.Any(p => p.ResponseHours <= 0 || p.ResolutionHours <= 0 || p.ResponseHours > p.ResolutionHours))
            return BadRequest(new { message = "SLA süreleri pozitif olmalı; ilk yanıt süresi çözüm süresinden uzun olamaz." });

        var s = await Db.TenantSettings.FirstOrDefaultAsync();
        if (s is null) { s = new TenantSettings { TenantId = TenantId }; Db.TenantSettings.Add(s); }
        s.WorkStartHour = req.WorkStartHour; s.WorkEndHour = req.WorkEndHour;
        s.WorkDays = string.Join(',', req.WorkDays.Distinct().OrderBy(d => d));
        s.HourlyCost = Math.Max(0, req.HourlyCost); s.MinutesPerTicket = Math.Clamp(req.MinutesPerTicket, 1, 600);

        var existing = await Db.SlaPolicies.ToListAsync();
        foreach (var p in req.Policies.Where(p => Prio.Contains(p.Priority)))
        {
            var e = existing.FirstOrDefault(x => x.Priority == p.Priority);
            if (e is null) { e = new SlaPolicy { TenantId = TenantId, Priority = p.Priority }; Db.SlaPolicies.Add(e); }
            e.ResponseHours = p.ResponseHours; e.ResolutionHours = p.ResolutionHours;
        }
        await Db.SaveChangesAsync();
        return await GetSettings();   // yeni hedefler bundan sonra açılan ticket'lara uygulanır
    }

    // ---------------- SLA + memnuniyet ----------------
    [HttpGet("performance/quality")]
    public async Task<IActionResult> Quality([FromQuery] int days = 30)
    {
        if (!IsManagerOrAdmin) return Forbidden("Sadece yöneticiler.");
        var now = DateTime.UtcNow;
        var since = now.AddDays(-Math.Clamp(days, 7, 365));
        var all = await Db.Tickets.Where(t => t.CreatedAt >= since && t.ResolutionDueAt != null).ToListAsync();
        var names = await UserNamesAsync();

        string Resp(Ticket t) => Sla.State(t.CreatedAt, t.ResponseDueAt, t.FirstResponseAt ?? (Sla.OpenStatuses.Contains(t.Status) ? null : t.ResolvedAt), now);
        string Res(Ticket t) => Sla.State(t.CreatedAt, t.ResolutionDueAt, Sla.OpenStatuses.Contains(t.Status) ? null : t.ResolvedAt, now);

        var closedResp = all.Where(t => Resp(t) is "met" or "breached").ToList();
        var closedRes = all.Where(t => Res(t) is "met" or "breached").ToList();
        int Pct(int a, int b) => b == 0 ? 100 : (int)Math.Round(100.0 * a / b);

        var open = all.Where(t => Sla.OpenStatuses.Contains(t.Status)).ToList();
        var watch = open.Where(t => Res(t) is "breached" or "at_risk" || Resp(t) is "breached" or "at_risk")
            .OrderBy(t => t.ResolutionDueAt).Take(12)
            .Select(t => new
            {
                t.Id, t.Title, t.Priority, t.Status, t.CreatedAt, t.ResolutionDueAt, t.ResponseDueAt,
                assigneeName = t.AssigneeId is Guid a ? names.GetValueOrDefault(a) : null,
                response = Resp(t), resolution = Res(t),
            });

        var rated = all.Where(t => t.CsatRating != null).ToList();
        var resolvedCount = all.Count(t => !Sla.OpenStatuses.Contains(t.Status));

        // Haftalık trend (son 8 hafta): SLA uyumu ve ortalama puan
        var weeks = Enumerable.Range(0, 8).Select(i => now.Date.AddDays(-7 * (7 - i))).ToList();
        var trend = weeks.Select(w =>
        {
            var wk = closedRes.Where(t => t.ResolvedAt >= w && t.ResolvedAt < w.AddDays(7)).ToList();
            var wr = rated.Where(t => t.CsatAt >= w && t.CsatAt < w.AddDays(7)).ToList();
            return new
            {
                week = w,
                slaPct = wk.Count == 0 ? (int?)null : Pct(wk.Count(t => Res(t) == "met"), wk.Count),
                csat = wr.Count == 0 ? (double?)null : Math.Round(wr.Average(t => t.CsatRating!.Value), 2),
            };
        });

        var agents = all.Where(t => t.AssigneeId != null && !Sla.OpenStatuses.Contains(t.Status))
            .GroupBy(t => t.AssigneeId!.Value)
            .Select(g => new
            {
                name = names.GetValueOrDefault(g.Key),
                resolved = g.Count(),
                slaPct = Pct(g.Count(t => Res(t) == "met"), g.Count(t => Res(t) is "met" or "breached")),
                csat = g.Any(t => t.CsatRating != null) ? Math.Round(g.Where(t => t.CsatRating != null).Average(t => t.CsatRating!.Value), 2) : (double?)null,
                medianHours = Math.Round(Median(g.Where(t => t.ResolvedAt != null).Select(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours)), 1),
            })
            .OrderByDescending(a => a.resolved).ToList();

        return Ok(new
        {
            days,
            sla = new
            {
                responsePct = Pct(closedResp.Count(t => Resp(t) == "met"), closedResp.Count),
                resolutionPct = Pct(closedRes.Count(t => Res(t) == "met"), closedRes.Count),
                openBreached = open.Count(t => Res(t) == "breached" || Resp(t) == "breached"),
                openAtRisk = open.Count(t => (Res(t) == "at_risk" || Resp(t) == "at_risk") && Res(t) != "breached" && Resp(t) != "breached"),
                byPriority = Prio.Select(p => new
                {
                    priority = p,
                    total = closedRes.Count(t => t.Priority == p),
                    pct = Pct(closedRes.Count(t => t.Priority == p && Res(t) == "met"), closedRes.Count(t => t.Priority == p)),
                }),
                watch,
            },
            csat = new
            {
                average = rated.Count == 0 ? 0 : Math.Round(rated.Average(t => t.CsatRating!.Value), 2),
                count = rated.Count,
                responseRate = Pct(rated.Count, resolvedCount),
                distribution = Enumerable.Range(1, 5).Select(r => new { rating = r, count = rated.Count(t => t.CsatRating == r) }),
                comments = rated.Where(t => t.CsatComment != null).OrderByDescending(t => t.CsatAt).Take(6).Select(t => new
                {
                    t.Title, rating = t.CsatRating, comment = t.CsatComment, t.CsatAt,
                    reporterName = names.GetValueOrDefault(t.ReporterId),
                    assigneeName = t.AssigneeId is Guid a ? names.GetValueOrDefault(a) : null,
                }),
            },
            trend,
            agents,
        });
    }

    private static double Median(IEnumerable<double> xs)
    {
        var a = xs.OrderBy(x => x).ToArray();
        return a.Length == 0 ? 0 : a.Length % 2 == 1 ? a[a.Length / 2] : (a[a.Length / 2 - 1] + a[a.Length / 2]) / 2;
    }

    // ---------------- Tasarruf (self-servis değeri) ----------------
    [HttpGet("performance/savings")]
    public async Task<IActionResult> Savings([FromQuery] int days = 30)
    {
        if (!IsManagerOrAdmin) return Forbidden("Sadece yöneticiler.");
        var now = DateTime.UtcNow;
        days = Math.Clamp(days, 7, 365);
        var since = now.AddDays(-days);
        var (_, s) = await Sla.LoadAsync(Db, TenantId);

        var fb = await Db.KbFeedbacks.Where(f => f.CreatedAt >= since).ToListAsync();
        var solved = fb.Where(f => f.Solved).ToList();
        var wizardFailed = fb.Count(f => !f.Solved && f.Source == "wizard");
        var tickets = await Db.Tickets.Where(t => t.CreatedAt >= since).ToListAsync();
        var resolved = tickets.Where(t => t.ResolvedAt != null).Select(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours).ToList();
        var medianWait = Median(resolved);
        var assistantAnswered = await Db.AssistantQueries.CountAsync(q => q.CreatedAt >= since && q.Answered);

        var supportHours = solved.Count * s.MinutesPerTicket / 60.0;
        var articles = await Db.Articles.ToDictionaryAsync(a => a.Id, a => a.Title);

        var weeks = Enumerable.Range(0, Math.Max(1, days / 7)).Select(i => now.Date.AddDays(-7 * (days / 7 - i))).ToList();
        return Ok(new
        {
            days,
            assumptions = new { s.MinutesPerTicket, s.HourlyCost, medianWaitHours = Math.Round(medianWait, 1) },
            deflected = solved.Count,
            bySource = new
            {
                wizard = solved.Count(f => f.Source == "wizard"),
                article = solved.Count(f => f.Source == "article"),
                assistant = solved.Count(f => f.Source == "assistant"),
            },
            ticketsCreated = tickets.Count,
            deflectionRate = solved.Count + tickets.Count == 0 ? 0 : (int)Math.Round(100.0 * solved.Count / (solved.Count + tickets.Count)),
            supportHoursSaved = Math.Round(supportHours, 1),
            moneySaved = Math.Round(supportHours * s.HourlyCost),
            employeeHoursSaved = Math.Round(solved.Count * medianWait, 0),
            assistantAnswered,
            wizard = new
            {
                solved = solved.Count(f => f.Source == "wizard"),
                escalated = wizardFailed,
                avgSteps = solved.Where(f => f.Source == "wizard" && f.StepsTried != null).Select(f => (double)f.StepsTried!.Value).DefaultIfEmpty(0).Average(),
            },
            weekly = weeks.Select(w => new
            {
                week = w,
                deflected = solved.Count(f => f.CreatedAt >= w && f.CreatedAt < w.AddDays(7)),
                tickets = tickets.Count(t => t.CreatedAt >= w && t.CreatedAt < w.AddDays(7)),
            }),
            topArticles = solved.Where(f => f.ArticleId != null).GroupBy(f => f.ArticleId!.Value)
                .Select(g => new { id = g.Key, title = articles.GetValueOrDefault(g.Key) ?? "?", solved = g.Count() })
                .OrderByDescending(x => x.solved).Take(6),
        });
    }

    // ---------------- Rozetler: son 30 günün yıldızları ----------------
    [HttpGet("performance/badges")]
    public async Task<IActionResult> Badges()
    {
        var now = DateTime.UtcNow;
        var since = now.AddDays(-30);
        var names = await UserNamesAsync();
        var done = await Db.Tickets.Where(t => t.AssigneeId != null && t.ResolvedAt != null && t.ResolvedAt >= since).ToListAsync();
        var byAgent = done.GroupBy(t => t.AssigneeId!.Value).Select(g => new
        {
            id = g.Key,
            n = g.Count(),
            sla = g.Count(t => t.ResolutionDueAt != null) == 0 ? 0 : 100.0 * g.Count(t => t.ResolutionDueAt != null && t.ResolvedAt <= t.ResolutionDueAt) / g.Count(t => t.ResolutionDueAt != null),
            median = Median(g.Select(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours)),
            rated = g.Count(t => t.CsatRating != null),
            csat = g.Where(t => t.CsatRating != null).Select(t => (double)t.CsatRating!.Value).DefaultIfEmpty(0).Average(),
            urgent = g.Count(t => (t.Priority == "Critical" || t.Priority == "High") && t.ResolutionDueAt != null && t.ResolvedAt <= t.ResolutionDueAt),
        }).ToList();

        var badges = new List<object>();
        void Add(Guid id, string emoji, string title, string detail) =>
            badges.Add(new { userId = id, name = names.GetValueOrDefault(id), emoji, title, detail });

        var pool = byAgent.Where(a => a.n >= 5).ToList();
        if (pool.Count > 0)
        {
            var most = pool.MaxBy(a => a.n)!;
            Add(most.id, "🏃", "Maratoncu", $"30 günde {most.n} ticket çözdü");
            var fast = pool.MinBy(a => a.median)!;
            Add(fast.id, "⚡", "Işık hızı", $"ortanca çözüm süresi {Math.Round(fast.median, 1)} saat");
            foreach (var a in pool.Where(a => a.n >= 8 && a.sla >= 95))
                Add(a.id, "🎯", "SLA ustası", $"çözümlerin %{Math.Round(a.sla)}'i hedefte");
            var fav = pool.Where(a => a.rated >= 5).MaxBy(a => a.csat);
            if (fav is not null) Add(fav.id, "💛", "Çalışanların favorisi", $"ortalama {fav.csat:0.0}/5 memnuniyet");
            var fire = pool.MaxBy(a => a.urgent);
            if (fire is not null && fire.urgent > 0) Add(fire.id, "🧯", "Yangın söndürücü", $"{fire.urgent} acil/yüksek ticket'ı süresinde çözdü");
        }
        // Bilgi kahramanı: makaleye dönüşen çözümleri en çok kişinin sorununu çözen
        var fromTickets = await Db.Articles.Where(a => a.SourceTicketId != null).Select(a => new { a.Id, a.SourceTicketId }).ToListAsync();
        if (fromTickets.Count > 0)
        {
            var srcIds = fromTickets.Select(a => a.SourceTicketId!.Value).ToList();
            var owners = await Db.Tickets.Where(t => srcIds.Contains(t.Id) && t.AssigneeId != null).ToDictionaryAsync(t => t.Id, t => t.AssigneeId!.Value);
            var artIds = fromTickets.Select(a => a.Id).ToList();
            var helped = await Db.KbFeedbacks.Where(f => f.Solved && f.ArticleId != null && artIds.Contains(f.ArticleId.Value)).GroupBy(f => f.ArticleId).Select(g => new { g.Key, n = g.Count() }).ToListAsync();
            var hero = fromTickets.Where(a => owners.ContainsKey(a.SourceTicketId!.Value))
                .GroupBy(a => owners[a.SourceTicketId!.Value])
                .Select(g => new { id = g.Key, n = helped.Where(h => g.Any(a => a.Id == h.Key)).Sum(h => h.n) })
                .Where(x => x.n > 0).MaxBy(x => x.n);
            if (hero is not null) Add(hero.id, "📚", "Bilgi kahramanı", $"yazdığı çözümler {hero.n} kişinin sorununu ticket açmadan çözdü");
        }
        return Ok(badges);
    }
}
