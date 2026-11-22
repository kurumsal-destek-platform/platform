using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// SLA hesapları: süreler MESAİ saatine göre işler (Cuma 17:00'de açılan 2 saatlik iş Pazartesi 10:00'da dolar).
public static class Sla
{
    public static readonly (string Priority, double Response, double Resolution)[] Defaults =
    {
        ("Critical", 0.5, 4), ("High", 2, 8), ("Medium", 4, 24), ("Low", 8, 40),
    };

    public static TenantSettings DefaultSettings(Guid tenantId) => new() { TenantId = tenantId };

    // Çözüm süresi aşılan yüksek/kritik ticket bir yöneticide değilse yöneticiye yükseltilir
    public static bool ShouldEscalate(string priority, Guid? assigneeId, IEnumerable<Guid> managerIds) =>
        priority is "High" or "Critical" && (assigneeId is null || !managerIds.Contains(assigneeId.Value));

    private static HashSet<int> Days(TenantSettings s) =>
        s.WorkDays.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToHashSet();

    private static int IsoDay(DateTime d) => d.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)d.DayOfWeek;

    // utcStart'tan itibaren 'hours' mesai saati ekler, UTC döner
    public static DateTime AddBusinessHours(DateTime utcStart, double hours, TenantSettings s)
    {
        var days = Days(s);
        if (days.Count == 0 || s.WorkEndHour <= s.WorkStartHour) return utcStart.AddHours(hours);
        var off = TimeSpan.FromHours(s.UtcOffsetHours);
        var local = utcStart + off;
        var remaining = TimeSpan.FromHours(hours);
        for (var guard = 0; guard < 400; guard++)
        {
            var dayStart = local.Date.AddHours(s.WorkStartHour);
            var dayEnd = local.Date.AddHours(s.WorkEndHour);
            if (!days.Contains(IsoDay(local)) || local >= dayEnd) { local = local.Date.AddDays(1).AddHours(s.WorkStartHour); continue; }
            if (local < dayStart) local = dayStart;
            var avail = dayEnd - local;
            if (remaining <= avail) return local + remaining - off;
            remaining -= avail;
            local = local.Date.AddDays(1).AddHours(s.WorkStartHour);
        }
        return utcStart.AddHours(hours);
    }

    public static void ApplyTargets(Ticket t, IEnumerable<SlaPolicy> policies, TenantSettings s)
    {
        var p = policies.FirstOrDefault(x => x.Priority == t.Priority);
        if (p is null) return;
        t.ResponseDueAt = AddBusinessHours(t.CreatedAt, p.ResponseHours, s);
        t.ResolutionDueAt = AddBusinessHours(t.CreatedAt, p.ResolutionHours, s);
    }

    public static readonly string[] OpenStatuses = { TicketStatus.Open, TicketStatus.Assigned, TicketStatus.InProgress, TicketStatus.Waiting };

    // a ile b arasındaki mesai saati (yanıt beklenirken geçen süre kadar SLA hedefi ileri kayar)
    public static double BusinessHoursBetween(DateTime aUtc, DateTime bUtc, TenantSettings s)
    {
        if (bUtc <= aUtc) return 0;
        var days = Days(s);
        if (days.Count == 0 || s.WorkEndHour <= s.WorkStartHour) return (bUtc - aUtc).TotalHours;
        var off = TimeSpan.FromHours(s.UtcOffsetHours);
        var a = aUtc + off; var b = bUtc + off;
        double total = 0;
        for (var day = a.Date; day <= b.Date; day = day.AddDays(1))
        {
            if (!days.Contains(IsoDay(day))) continue;
            var start = day.AddHours(s.WorkStartHour); var end = day.AddHours(s.WorkEndHour);
            var from = a > start ? a : start; var to = b < end ? b : end;
            if (to > from) total += (to - from).TotalHours;
        }
        return total;
    }

    public static void EnterWaiting(Ticket t, DateTime now) => t.WaitingSince ??= now;

    // Bekleme bitti: geçen mesai süresi kadar hedefleri ileri kaydır
    public static void LeaveWaiting(Ticket t, DateTime now, TenantSettings s)
    {
        if (t.WaitingSince is not DateTime w) return;
        var h = BusinessHoursBetween(w, now, s);
        if (h > 0)
        {
            if (t.FirstResponseAt is null && t.ResponseDueAt is DateTime r) t.ResponseDueAt = AddBusinessHours(r, h, s);
            if (t.ResolutionDueAt is DateTime z && !t.SlaBreachNotified) t.ResolutionDueAt = AddBusinessHours(z, h, s);
            t.SlaWarned = false;
        }
        t.WaitingSince = null;
    }

    // Çalışan cevap yazınca (portal veya e-posta) bekleme biter, ticket işleme döner
    public static async Task ResumeIfWaitingAsync(AppDbContext db, Ticket t, Guid actorId)
    {
        if (t.Status != TicketStatus.Waiting) return;
        var (_, s) = await LoadAsync(db, t.TenantId, ignoreFilters: true);
        LeaveWaiting(t, DateTime.UtcNow, s);
        t.Status = TicketStatus.InProgress;
        if (t.AssigneeId is Guid a)
            Events.Notify(db, t.TenantId, a, actorId, "Çalışan yanıt verdi", $"\"{t.Title}\" tekrar işlemde.", $"/tickets?open={t.Id}");
    }

    // Tek bir hedefin durumu: met | breached | running | at_risk | none
    public static string State(DateTime created, DateTime? due, DateTime? doneAt, DateTime now)
    {
        if (due is null) return "none";
        if (doneAt is DateTime d) return d <= due ? "met" : "breached";
        if (now > due) return "breached";
        var total = (due.Value - created).TotalMinutes;
        var left = (due.Value - now).TotalMinutes;
        return total > 0 && left / total < 0.25 ? "at_risk" : "running";
    }

    // Listeleme filtresi için özet: "breached" | "at_risk" | "ok" (frontend'deki slaOf ile aynı kural)
    public static string Summary(Ticket t, DateTime now)
    {
        if (t.Status == TicketStatus.Waiting) return "ok";   // süre duruyor
        var resolvedAt = t.Status is TicketStatus.Resolved or TicketStatus.Closed ? t.ResolvedAt ?? now : (DateTime?)null;
        var r = State(t.CreatedAt, t.ResponseDueAt, t.FirstResponseAt ?? resolvedAt, now);
        var z = State(t.CreatedAt, t.ResolutionDueAt, resolvedAt, now);
        return r == "breached" || z == "breached" ? "breached" : r == "at_risk" || z == "at_risk" ? "at_risk" : "ok";
    }

    public static object Dto(Ticket t, DateTime now)
    {
        var resolvedAt = t.Status is TicketStatus.Resolved or TicketStatus.Closed ? t.ResolvedAt ?? now : (DateTime?)null;
        return new
        {
            responseDueAt = t.ResponseDueAt,
            resolutionDueAt = t.ResolutionDueAt,
            firstResponseAt = t.FirstResponseAt,
            response = State(t.CreatedAt, t.ResponseDueAt, t.FirstResponseAt ?? resolvedAt, now),
            resolution = t.Status == TicketStatus.Waiting ? "paused" : State(t.CreatedAt, t.ResolutionDueAt, resolvedAt, now),
            waitingSince = t.WaitingSince,
        };
    }

    public static async Task<(List<SlaPolicy> Policies, TenantSettings Settings)> LoadAsync(AppDbContext db, Guid tenantId, bool ignoreFilters = false)
    {
        var pq = ignoreFilters ? db.SlaPolicies.IgnoreQueryFilters().Where(p => p.TenantId == tenantId) : db.SlaPolicies.AsQueryable();
        var sq = ignoreFilters ? db.TenantSettings.IgnoreQueryFilters().Where(p => p.TenantId == tenantId) : db.TenantSettings.AsQueryable();
        var policies = await pq.ToListAsync();
        var settings = await sq.FirstOrDefaultAsync() ?? DefaultSettings(tenantId);
        if (policies.Count == 0)
            policies = Defaults.Select(d => new SlaPolicy { TenantId = tenantId, Priority = d.Priority, ResponseHours = d.Response, ResolutionHours = d.Resolution }).ToList();
        return (policies, settings);
    }
}

// Her dakika açık ticket'ları kontrol eder: süresi dolmak üzere olanlar ve aşılanlar için bildirim gönderir.
public class SlaMonitor : BackgroundService
{
    public static DateTime? LastRunAt { get; private set; }   // sistem durumu sayfası için
    private readonly IServiceProvider _sp;
    private readonly ILogger<SlaMonitor> _log;
    public SlaMonitor(IServiceProvider sp, ILogger<SlaMonitor> log) { _sp = sp; _log = log; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromSeconds(15), ct);
        while (!ct.IsCancellationRequested)
        {
            try { await TickAsync(ct); }
            catch (Exception ex) { _log.LogWarning(ex, "SLA kontrolü başarısız"); }
            await Task.Delay(TimeSpan.FromMinutes(1), ct);
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hub = scope.ServiceProvider.GetRequiredService<IHubContext<LiveHub>>();
        var now = DateTime.UtcNow;
        LastRunAt = now;

        // API birden fazla kopya çalışıyorsa bildirimler çiftlenmesin: aynı anda sadece biri çalışır
        // (PostgreSQL "advisory lock"; işlem bitince kendiliğinden bırakılır)
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var gotLock = await db.Database.SqlQueryRaw<bool>("SELECT pg_try_advisory_xact_lock(7342001) AS \"Value\"").FirstAsync(ct);
        if (!gotLock) return;
        var tickets = await db.Tickets.IgnoreQueryFilters()
            .Where(t => Sla.OpenStatuses.Contains(t.Status) && t.Status != TicketStatus.Waiting && t.ResolutionDueAt != null && (!t.SlaWarned || !t.SlaBreachNotified))
            .ToListAsync(ct);
        if (tickets.Count == 0) { await tx.CommitAsync(ct); return; }

        var tenants = tickets.Select(t => t.TenantId).Distinct().ToList();
        var managers = await db.Users.IgnoreQueryFilters()
            .Where(u => tenants.Contains(u.TenantId) && u.IsActive && (u.Role == Roles.Manager || u.Role == Roles.Admin))
            .Select(u => new { u.Id, u.TenantId, u.FullName, u.Role }).ToListAsync(ct);
        // Eskalasyonda iş yükü en az olan yönetici seçilir
        var load = await db.Tickets.IgnoreQueryFilters()
            .Where(x => tenants.Contains(x.TenantId) && x.AssigneeId != null && Sla.OpenStatuses.Contains(x.Status))
            .GroupBy(x => x.AssigneeId!.Value).Select(g => new { Id = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);

        var touched = new HashSet<Guid>();
        foreach (var t in tickets)
        {
            var resp = Sla.State(t.CreatedAt, t.ResponseDueAt, t.FirstResponseAt, now);
            var res = Sla.State(t.CreatedAt, t.ResolutionDueAt, null, now);
            var targets = t.AssigneeId is Guid a ? new List<Guid> { a } : new List<Guid>();
            targets.AddRange(managers.Where(m => m.TenantId == t.TenantId).Select(m => m.Id));

            if (!t.SlaBreachNotified && (res == "breached" || resp == "breached"))
            {
                var what = res == "breached" ? "çözüm" : "ilk yanıt";
                foreach (var u in targets.Distinct())
                    Events.Notify(db, t.TenantId, u, Guid.Empty, "🔴 SLA aşıldı", $"\"{t.Title}\" için {what} süresi doldu.", "/tickets?sla=breached");
                t.SlaBreachNotified = true; t.SlaWarned = true; touched.Add(t.TenantId);

                // Eskalasyon: yüksek/kritik ticket'ın çözüm süresi aşıldıysa ve bir yönetici ilgilenmiyorsa yöneticiye yükselt
                var tenantManagers = managers.Where(m => m.TenantId == t.TenantId).ToList();
                if (res == "breached" && Sla.ShouldEscalate(t.Priority, t.AssigneeId, tenantManagers.Select(m => m.Id)))
                {
                    var to = tenantManagers.Where(m => m.Role == Roles.Manager).DefaultIfEmpty(tenantManagers.FirstOrDefault())
                        .Where(m => m is not null).OrderBy(m => load.GetValueOrDefault(m!.Id)).FirstOrDefault();
                    if (to is not null)
                    {
                        var before = t.AssigneeId;
                        t.AssigneeId = to.Id;
                        if (t.Status == TicketStatus.Open) t.Status = TicketStatus.Assigned;
                        load[to.Id] = load.GetValueOrDefault(to.Id) + 1;
                        db.TicketMessages.Add(new TicketMessage
                        {
                            TenantId = t.TenantId, TicketId = t.Id, AuthorId = TicketIntake.System, Internal = true,
                            Body = $"⬆ SLA aşıldı: {Automation.PriorityLabel(t.Priority).ToLower()} öncelikli ticket {to.FullName} kişisine yükseltildi" +
                                   (before is null ? "." : " (önceki atanan bilgilendirildi)."),
                        });
                        Events.Notify(db, t.TenantId, to.Id, Guid.Empty, "⬆ Size yükseltilen ticket", $"\"{t.Title}\" SLA süresini aştı.", $"/tickets?open={t.Id}");
                    }
                }
            }
            else if (!t.SlaWarned && (res == "at_risk" || resp == "at_risk"))
            {
                var due = res == "at_risk" ? t.ResolutionDueAt!.Value : t.ResponseDueAt!.Value;
                var mins = Math.Max(1, (int)(due - now).TotalMinutes);
                foreach (var u in targets.Distinct())
                    Events.Notify(db, t.TenantId, u, Guid.Empty, "⏳ SLA süresi dolmak üzere", $"\"{t.Title}\" için {mins} dk kaldı.", "/tickets?sla=at_risk");
                t.SlaWarned = true; touched.Add(t.TenantId);
            }
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        foreach (var tid in touched) await LiveHub.BroadcastAsync(hub, tid, "/api/tickets");
    }
}
