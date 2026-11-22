using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record DraftGapRequest(string Topic, Guid[]? QuestionIds, Guid[]? TicketIds);

// Akıllı öneriler: atama, bilgi boşlukları, sprint riski
[Route("api")]
public class InsightsController : ApiControllerBase
{
    private readonly LocalLlm _llm;
    private readonly RagClient _rag;
    public InsightsController(AppDbContext db, LocalLlm llm, RagClient rag) : base(db) { _llm = llm; _rag = rag; }

    private static readonly string[] OpenTicket = { TicketStatus.Open, TicketStatus.Assigned, TicketStatus.InProgress };
    private static readonly string[] DoneTicket = { TicketStatus.Resolved, TicketStatus.Closed };

    // =====================================================================
    // 1) AKILLI ATAMA: "Bu ticket'ı en iyi kim çözer?"
    //    Geçmişte benzer sorunları kim, ne kadar hızlı çözdü + şu anki iş yükü
    // =====================================================================
    [HttpGet("tickets/{id:guid}/assign-suggestions")]
    public async Task<IActionResult> AssignSuggestions(Guid id)
    {
        if (!IsSupport) return Forbidden("Sadece destek ekibi.");
        var ticket = await Db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();

        var users = await Db.Users.Where(u => u.IsActive && u.PasswordHash != "" && u.Id != ticket.ReporterId).ToListAsync();
        var resolved = await Db.Tickets.Where(t => t.Id != id && t.AssigneeId != null && DoneTicket.Contains(t.Status)).ToListAsync();
        var openTickets = await Db.Tickets.Where(t => t.AssigneeId != null && OpenTicket.Contains(t.Status))
            .GroupBy(t => t.AssigneeId).Select(g => new { g.Key, n = g.Count() }).ToDictionaryAsync(x => x.Key!.Value, x => x.n);
        var openItems = await Db.WorkItems.Where(w => w.AssigneeId != null && w.Status != WorkItemStatus.Done)
            .GroupBy(w => w.AssigneeId).Select(g => new { g.Key, n = g.Count() }).ToDictionaryAsync(x => x.Key!.Value, x => x.n);

        var v = TextSim.Vec(ticket.Title, ticket.Description);
        var candidates = users.Select(u =>
        {
            var mine = resolved.Where(t => t.AssigneeId == u.Id).ToList();
            var similar = mine.Select(t => (t, sim: TextSim.Cosine(v, TextSim.Vec(t.Title, t.Description))))
                .Where(x => x.sim >= 0.2).OrderByDescending(x => x.sim).ToList();
            var sameCat = mine.Count(t => t.Category == ticket.Category);
            var hours = similar.Where(x => x.t.ResolvedAt != null)
                .Select(x => (x.t.ResolvedAt!.Value - x.t.CreatedAt).TotalHours).DefaultIfEmpty(-1).Average();
            var load = openTickets.GetValueOrDefault(u.Id) + openItems.GetValueOrDefault(u.Id);

            var expertise = similar.Sum(x => x.sim) * 4 + sameCat * 0.8;
            var speed = hours is > 0 and < 8 ? 1.5 : hours is >= 8 and < 24 ? 0.7 : 0;
            var score = expertise + speed - load * 0.6;

            var reasons = new List<string>();
            if (similar.Count > 0) reasons.Add($"Benzer {similar.Count} sorunu çözdü (ör. \"{TextUtil.Snip(similar[0].t.Title, 40)}\")");
            else if (sameCat > 0) reasons.Add($"\"{ticket.Category}\" kategorisinde {sameCat} ticket çözdü");
            if (hours > 0) reasons.Add($"Benzerlerini ortalama {FormatHours(hours)} içinde çözdü");
            reasons.Add(load == 0 ? "Şu an hiç açık işi yok" : $"Şu an {load} açık işi var");
            return new
            {
                userId = u.Id, fullName = u.FullName, role = u.Role, score, load,
                similarCount = similar.Count, avgHours = hours > 0 ? Math.Round(hours, 1) : (double?)null,
                reasons,
                examples = similar.Take(3).Select(x => new { x.t.Id, x.t.Title, sim = Math.Round(x.sim, 2) }),
            };
        }).OrderByDescending(c => c.score).Take(3).ToList();

        // Puanı 0-100 "uyum" yüzdesine çevir (en iyiye göre)
        var max = candidates.Select(c => c.score).DefaultIfEmpty(1).Max();
        var min = candidates.Select(c => c.score).DefaultIfEmpty(0).Min();
        return Ok(candidates.Select((c, i) => new
        {
            c.userId, c.fullName, c.role, c.load, c.similarCount, c.avgHours, c.reasons, c.examples,
            match = (int)Math.Round(max - min < 0.01 ? 70 : 45 + 50 * (c.score - min) / (max - min)),
            best = i == 0,
        }));
    }

    private static string FormatHours(double h) => h < 1 ? $"{Math.Round(h * 60)} dk" : h < 48 ? $"{Math.Round(h, 1)} saat" : $"{Math.Round(h / 24, 1)} gün";

    // =====================================================================
    // 2) BİLGİ BOŞLUĞU RADARI
    //    Asistanın cevaplayamadığı sorular + makalesi olmayan konularda açılan ticket'lar → gruplanır
    // =====================================================================
    private record GapItem(string Kind, Guid Id, string Title, string Body, Guid UserId, DateTime At, string? Resolution, double? Hours);

    // Kural (demo verisiyle ölçülerek belirlendi):
    //  - Asistana sorulup cevaplanamamış soru içeren konu = boşluk. Aynı konudaki ticket'lar ve çözümleri yanına eklenir.
    //  - RAG anlamsal kapsama kontrolü çalışıyorsa: hiç soru sorulmamış ama makalesi olmayan konuda 3+ ticket da boşluktur.
    //    (Kelime benzerliği eş anlamlıları kaçırdığı için ticket-tek başına kuralı sadece anlamsal modda açık.)
    [HttpGet("insights/knowledge-gaps")]
    public async Task<IActionResult> KnowledgeGaps(CancellationToken ct)
    {
        if (!IsSupport) return Forbidden("Sadece destek ekibi.");
        var since = DateTime.UtcNow.AddDays(-60);
        var articles = await Db.Articles.ToListAsync(ct); // taslaklar da sayılır: taslağı yazılmış konu tekrar çıkmasın
        var articleVecs = articles.Select(a => TextSim.Vec(a.Title, a.Body)).ToList();
        var sourceTickets = articles.Where(a => a.SourceTicketId != null).Select(a => a.SourceTicketId!.Value).ToHashSet();
        var draftTitles = articles.Where(a => !a.Published).Select(a => TextSim.Vec(a.Title, a.Body)).ToList();

        var questions = await Db.AssistantQueries.Where(q => !q.Answered && q.DraftArticleId == null && q.CreatedAt >= since).ToListAsync(ct);
        var tickets = await Db.Tickets.Where(t => t.CreatedAt >= since && t.IncidentId == null && !sourceTickets.Contains(t.Id)).ToListAsync(ct);

        // Ticket bilgi bankasında karşılanıyor mu? Önce anlamsal (RAG), olmazsa kelime yöntemi
        var tenantId = Guid.Parse(User.FindFirst("tenant_id")!.Value);
        var sem = await _rag.CoverageAsync(tenantId, tickets.Select(t => $"{t.Title}. {t.Description}").ToList(), ct);
        var semantic = sem is not null;
        bool Uncovered(int i, Ticket t)
        {
            if (sem is { } x) return x.Scores[i] < x.Threshold;
            var v = TextSim.Vec(t.Title, t.Description);
            return articleVecs.All(av => TextSim.Cosine(v, av) < 0.35 && TextSim.Coverage(v, av) < 0.5);
        }
        var openTickets = tickets.Where((t, i) => Uncovered(i, t)).ToList();

        var items = new List<GapItem>();
        items.AddRange(questions.Select(q => new GapItem("question", q.Id, q.Question, "", q.UserId, q.CreatedAt, null, null)));
        items.AddRange(openTickets.Select(t => new GapItem("ticket", t.Id, t.Title, t.Description, t.ReporterId, t.CreatedAt, t.ResolutionNote,
            t.ResolvedAt is DateTime r ? (r - t.CreatedAt).TotalHours : null)));

        var names = await UserNamesAsync();
        var gaps = TextSim.Cluster(items, i => TextSim.Vec(i.Title, i.Body), 0.30)
            .Where(g => g.Count >= 2)
            .Where(g => g.Any(i => i.Kind == "question") || (semantic && g.Count(i => i.Kind == "ticket") >= 3))
            // taslağı yazılmış (henüz yayınlanmamış) konu tekrar çıkmasın
            .Where(g => !draftTitles.Any(d => TextSim.Cosine(TextSim.Vec(TextSim.Central(g, i => TextSim.Vec(i.Title, i.Body)).Title), d) >= 0.5))
            .Select(g =>
            {
                var c = TextSim.Central(g, i => TextSim.Vec(i.Title, i.Body));
                var qs = g.Where(i => i.Kind == "question").ToList();
                var ts = g.Where(i => i.Kind == "ticket").ToList();
                var hours = ts.Where(t => t.Hours != null).Sum(t => t.Hours!.Value);
                return new
                {
                    topic = c.Title,
                    questionCount = qs.Count,
                    ticketCount = ts.Count,
                    affectedUsers = g.Select(i => i.UserId).Distinct().Count(),
                    lastAt = g.Max(i => i.At),
                    score = qs.Count + ts.Count * 2,
                    supportHours = Math.Round(hours, 1),
                    hasKnownFix = ts.Any(t => !string.IsNullOrWhiteSpace(t.Resolution)),
                    questionIds = qs.Select(q => q.Id),
                    ticketIds = ts.Select(t => t.Id),
                    samples = g.OrderByDescending(i => i.Kind == "ticket" && i.Resolution != null).ThenByDescending(i => i.At).Take(6).Select(i => new
                    {
                        i.Kind, i.Id, text = i.Title, userName = names.GetValueOrDefault(i.UserId), i.At, i.Resolution,
                    }),
                };
            })
            .OrderByDescending(g => g.score).ThenByDescending(g => g.lastAt)
            .ToList();

        var totalQ = await Db.AssistantQueries.CountAsync(q => q.CreatedAt >= since, ct);
        var unanswered = await Db.AssistantQueries.CountAsync(q => q.CreatedAt >= since && !q.Answered, ct);
        return Ok(new
        {
            mode = semantic ? "semantic" : "keyword",
            stats = new { totalQuestions = totalQ, unanswered, answerRate = totalQ == 0 ? 0 : (int)Math.Round(100.0 * (totalQ - unanswered) / totalQ) },
            gaps,
        });
    }

    // Boşluk için makale taslağı: yerel yapay zekâ yazar, ulaşılamazsa şablonla hazırlanır
    [HttpPost("insights/knowledge-gaps/draft")]
    public async Task<IActionResult> DraftArticle(DraftGapRequest req, CancellationToken ct)
    {
        if (!IsSupport) return Forbidden("Sadece destek ekibi.");
        var qIds = req.QuestionIds ?? Array.Empty<Guid>();
        var tIds = req.TicketIds ?? Array.Empty<Guid>();
        var questions = await Db.AssistantQueries.Where(q => qIds.Contains(q.Id)).ToListAsync(ct);
        var tickets = await Db.Tickets.Where(t => tIds.Contains(t.Id)).ToListAsync(ct);
        if (questions.Count + tickets.Count == 0) return BadRequest(new { message = "Kaynak bulunamadı." });

        var category = tickets.GroupBy(t => t.Category).OrderByDescending(g => g.Count()).Select(g => g.Key).FirstOrDefault() ?? "Diğer";
        var asked = questions.Select(q => q.Question).Concat(tickets.Select(t => t.Title)).Distinct().Take(10).ToList();
        var fixes = tickets.Where(t => !string.IsNullOrWhiteSpace(t.ResolutionNote)).Select(t => t.ResolutionNote!).Distinct().Take(8).ToList();
        var details = tickets.Where(t => !string.IsNullOrWhiteSpace(t.Description)).Select(t => t.Description).Distinct().Take(5).ToList();

        var prompt = $"""
            Sen bir şirketin IT destek ekibinde bilgi bankası yazarısın. Çalışanların kendi sorununu kendisi çözebilmesi için
            Türkçe, kısa ve adım adım bir bilgi bankası makalesi yaz.

            Konu: {req.Topic}

            Çalışanların sorduğu sorular:
            {TextUtil.Bullets(asked)}

            Ticket açıklamaları:
            {TextUtil.Bullets(details)}

            Destek ekibinin daha önce uyguladığı çözümler:
            {(fixes.Count > 0 ? TextUtil.Bullets(fixes) : "• (henüz kayıtlı çözüm yok)")}

            Kurallar:
            - İlk satır "BAŞLIK: " ile başlasın, kısa bir başlık olsun.
            - Sonra numaralı adımlar yaz. Sadece yukarıdaki çözümleri kullan, bilgi uydurma.
            - Kayıtlı çözüm yoksa genel güvenli kontrol adımları yaz ve sonuna "Bu adımlar IT ekibi tarafından doğrulanmalıdır." ekle.
            - En sona "Sorun devam ederse '{category}' kategorisinde ticket açın." cümlesini ekle.
            """;

        var ai = await _llm.GenerateAsync(prompt, ct);
        string title, body;
        if (ai is not null)
        {
            var lines = ai.Split('\n').ToList();
            var tl = lines.FirstOrDefault(l => l.TrimStart('#', ' ', '*').StartsWith("BAŞLIK", StringComparison.OrdinalIgnoreCase));
            title = tl is null ? req.Topic : tl.TrimStart('#', ' ', '*').Substring("BAŞLIK".Length).Trim(':', ' ', '*');
            if (tl is not null) lines.Remove(tl);
            body = string.Join('\n', lines).Trim();
        }
        else
        {
            title = req.Topic;
            body = $"""
                Bu konuda çalışanlar şunları sordu:
                {TextUtil.Bullets(asked)}

                {(fixes.Count > 0 ? "Destek ekibinin uyguladığı çözümler:\n" + TextUtil.Bullets(fixes) : "Henüz kayıtlı bir çözüm yok. Lütfen çözüm adımlarını buraya ekleyin.")}

                Sorun devam ederse '{category}' kategorisinde ticket açın.

                (Bu taslak bilgi boşluğu radarı tarafından otomatik hazırlandı; yayınlamadan önce kontrol edin.)
                """;
        }

        var article = new Article { Title = TextUtil.Snip(title, 150), Body = body, Category = category, Published = false };
        Db.Articles.Add(article);
        foreach (var q in questions) q.DraftArticleId = article.Id;
        await Db.SaveChangesAsync(ct);
        return Ok(new { article.Id, article.Title, aiGenerated = ai is not null });
    }

    // =====================================================================
    // 3) SPRİNT RİSK TAHMİNİ: "Bu hızla sprint biter mi? Hangi işler riskli?"
    // =====================================================================
    [HttpGet("sprints/{id:guid}/risk")]
    public async Task<IActionResult> SprintRisk(Guid id)
    {
        var sprint = await Db.Sprints.FirstOrDefaultAsync(s => s.Id == id);
        if (sprint is null) return NotFound();
        if (await MembershipAsync(sprint.ProjectId) is null && !IsManagerOrAdmin) return Forbidden("Bu projenin üyesi değilsiniz.");
        if (sprint.Status != SprintStatus.Active || sprint.StartDate is null || sprint.EndDate is null)
            return Ok(new { available = false, message = "Risk tahmini sadece başlamış sprintler için yapılır." });

        var project = await Db.Projects.FirstAsync(p => p.Id == sprint.ProjectId);
        var items = await Db.WorkItems.Where(w => w.SprintId == id && w.Type != "Subtask").ToListAsync();
        if (items.Count == 0) return Ok(new { available = false, message = "Sprintte iş yok." });

        // Puan girilmemişse her iş 1 sayılır
        var usePoints = items.Any(w => (w.StoryPoints ?? 0) > 0);
        double P(WorkItem w) => usePoints ? (w.StoryPoints ?? 0) : 1;
        var unit = usePoints ? "puan" : "iş";

        var now = DateTime.UtcNow;
        var start = sprint.StartDate.Value; var end = sprint.EndDate.Value;
        var totalDays = Math.Max(1, (end - start).TotalDays);
        var elapsed = Math.Clamp((now - start).TotalDays, 0.5, totalDays);
        var daysLeft = Math.Max(0, (end - now).TotalDays);

        var total = items.Sum(P);
        var done = items.Where(w => w.Status == WorkItemStatus.Done).Sum(P);
        var review = items.Where(w => w.Status == WorkItemStatus.InReview).Sum(P);
        var progress = items.Where(w => w.Status == WorkItemStatus.InProgress).Sum(P);

        // Bitirme hızı: bu sprintteki günlük hız; geçmiş sprintler varsa onların hızıyla harmanlanır
        var ratePerDay = done / elapsed;
        var history = new List<double>();
        var closed = await Db.Sprints.Where(s => s.ProjectId == sprint.ProjectId && s.Status == SprintStatus.Closed && s.StartDate != null && s.EndDate != null)
            .OrderByDescending(s => s.EndDate).Take(3).ToListAsync();
        foreach (var c in closed)
        {
            var pts = await Db.WorkItems.Where(w => w.SprintId == c.Id && w.Status == WorkItemStatus.Done).ToListAsync();
            var d = Math.Max(1, (c.EndDate!.Value - c.StartDate!.Value).TotalDays);
            history.Add(pts.Sum(P) / d);
        }
        if (history.Count > 0) ratePerDay = (ratePerDay + history.Average()) / 2;

        // İncelemedeki işlerin çoğu, devam edenlerin bir kısmı yakında biter
        var projected = Math.Min(total, done + review * 0.8 + progress * 0.4 + ratePerDay * daysLeft);
        var completion = (int)Math.Round(100 * projected / total);
        var timePct = (int)Math.Round(100 * elapsed / totalDays);
        var workPct = (int)Math.Round(100 * done / total);

        // ---- Riskli işler ----
        var names = await UserNamesAsync();
        var ids = items.Select(w => w.Id).ToList();
        var blockLinks = await Db.WorkItemLinks.Where(l => l.Type == LinkTypes.Blocks && ids.Contains(l.TargetId)).ToListAsync();
        var blockerIds = blockLinks.Select(l => l.SourceId).Distinct().ToList();
        var blockers = await Db.WorkItems.Where(w => blockerIds.Contains(w.Id)).ToDictionaryAsync(w => w.Id);

        var remaining = items.Where(w => w.Status != WorkItemStatus.Done).ToList();
        var assignees = remaining.Where(w => w.AssigneeId != null).Select(w => w.AssigneeId!.Value).Distinct().ToList();
        var fairShare = assignees.Count == 0 ? 0 : remaining.Sum(P) / assignees.Count;
        var perPerson = remaining.Where(w => w.AssigneeId != null).GroupBy(w => w.AssigneeId!.Value).ToDictionary(g => g.Key, g => g.Sum(P));

        var risks = new List<object>();
        foreach (var w in remaining.OrderByDescending(P))
        {
            var reasons = new List<string>();
            foreach (var l in blockLinks.Where(l => l.TargetId == w.Id))
                if (blockers.TryGetValue(l.SourceId, out var b) && b.Status != WorkItemStatus.Done)
                    reasons.Add($"{b.Key} tarafından engelleniyor ve o iş henüz bitmedi");
            if (w.AssigneeId is null) reasons.Add("Kimseye atanmamış");
            if (w.Status == WorkItemStatus.Todo && timePct >= 50 && P(w) >= (usePoints ? 5 : 1))
                reasons.Add($"Sprintin %{timePct}'i geçti ama bu büyük iş başlamadı");
            if (w.DueDate is DateTime due && due < now) reasons.Add($"Bitiş tarihi {Math.Ceiling((now - due).TotalDays)} gün geçti");
            if (w.Status == WorkItemStatus.InProgress && (now - w.UpdatedAt).TotalDays >= 3)
                reasons.Add($"{Math.Floor((now - w.UpdatedAt).TotalDays)} gündür hareket yok");
            if (w.AssigneeId is Guid a && perPerson.GetValueOrDefault(a) > fairShare * 1.5 && perPerson[a] >= (usePoints ? 8 : 3))
                reasons.Add($"{names.GetValueOrDefault(a)} üzerinde {perPerson[a]} {unit} kaldı (ekip ortalaması {Math.Round(fairShare, 1)})");
            if (reasons.Count > 0)
                risks.Add(new
                {
                    w.Key, w.Title, w.Status, points = w.StoryPoints, assigneeName = w.AssigneeId is Guid x ? names.GetValueOrDefault(x) : null,
                    reasons, severity = reasons.Count >= 2 || reasons.Any(r => r.Contains("engelleniyor")) ? "high" : "medium",
                });
        }

        // ---- Öneriler ----
        var recs = new List<string>();
        var shortfall = total - projected;
        if (shortfall > 0.5)
        {
            var cut = new List<WorkItem>(); double sum = 0;
            foreach (var w in remaining.Where(w => w.Status == WorkItemStatus.Todo)
                         .OrderBy(w => w.Priority switch { "Low" => 0, "Medium" => 1, "High" => 2, _ => 3 }).ThenByDescending(w => w.Rank))
            {
                if (sum >= shortfall) break;
                cut.Add(w); sum += P(w);
            }
            if (cut.Count > 0)
                recs.Add($"Kapsamı daraltın: {string.Join(", ", cut.Select(c => $"{c.Key} ({P(c)} {unit})"))} işlerini sonraki sprinte taşıyın.");
        }
        foreach (var b in blockers.Values.Where(b => b.Status != WorkItemStatus.Done))
            recs.Add($"{b.Key} \"{TextUtil.Snip(b.Title, 40)}\" başka işleri engelliyor; önce onu bitirin.");
        var unassigned = remaining.Count(w => w.AssigneeId is null);
        if (unassigned > 0) recs.Add($"{unassigned} iş atanmamış; sorumlu belirleyin.");
        var over = perPerson.Where(p => p.Value > fairShare * 1.5 && p.Value >= (usePoints ? 8 : 3)).ToList();
        foreach (var o in over) recs.Add($"{names.GetValueOrDefault(o.Key)} üzerindeki işlerin bir kısmını ekipte dağıtın.");
        if (recs.Count == 0) recs.Add("Sprint planlandığı gibi ilerliyor. 👍");

        var level = completion >= 90 && !risks.Any() ? "low" : completion >= 70 ? "medium" : "high";

        // ---- Burndown: gün gün kalan iş + tahmin ----
        var doneLogs = await Db.ActivityLogs.Where(l => l.WorkItemId != null && ids.Contains(l.WorkItemId.Value) && l.Action == "status" && l.NewValue == WorkItemStatus.Done)
            .GroupBy(l => l.WorkItemId).Select(g => new { id = g.Key!.Value, at = g.Max(x => x.At) }).ToDictionaryAsync(x => x.id, x => x.at);
        DateTime DoneAt(WorkItem w) => doneLogs.TryGetValue(w.Id, out var at) ? at : w.UpdatedAt;
        var burn = new List<object>();
        var days = (int)Math.Ceiling(totalDays);
        for (var d = 0; d <= days; d++)
        {
            var day = start.Date.AddDays(d);
            var dayEnd = day.AddDays(1);
            var ideal = Math.Round(total - total * d / days, 1);
            double? actual = dayEnd <= now.Date.AddDays(1)
                ? total - items.Where(w => w.Status == WorkItemStatus.Done && DoneAt(w) < dayEnd).Sum(P) : null;
            double? forecast = day >= now.Date ? Math.Max(0, Math.Round(total - done - (projected - done) * Math.Min(1, (day - now.Date).TotalDays / Math.Max(1, daysLeft)), 1)) : null;
            burn.Add(new { date = day, ideal, actual, forecast });
        }

        return Ok(new
        {
            available = true, sprint = new { sprint.Id, sprint.Name, sprint.StartDate, sprint.EndDate, projectKey = project.Key },
            unit, total, done, projected = Math.Round(projected, 1), completion, timePct, workPct,
            daysLeft = Math.Round(daysLeft, 1), ratePerDay = Math.Round(ratePerDay, 2), usedHistory = history.Count,
            level, risks, recommendations = recs, burndown = burn,
        });
    }
}
