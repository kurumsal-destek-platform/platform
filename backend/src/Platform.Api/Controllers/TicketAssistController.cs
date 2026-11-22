using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

// Ticket formu yazılırken çağrılır (yazmayı bıraktıktan ~600 ms sonra).
public record TicketDraftRequest(string Title, string? Description, Guid? ExcludeId = null);

// Ticket açarken yapay zekâ yardımı (RAG servisi):
//  - POST /api/tickets/similar        → "Bu sorun için 3 açık ticket var, takip etmek ister misiniz?"
//  - POST /api/tickets/suggest-triage → geçmiş benzer ticket'lara göre kategori ve öncelik önerisi
// RAG/Ollama kapalıysa backend'in kendi kelime benzerliğine (TextSim) düşülür; form hiçbir zaman bozulmaz.
[Route("api/tickets")]
public class TicketAssistController : ApiControllerBase
{
    private readonly RagClient _rag;
    public TicketAssistController(AppDbContext db, RagClient rag) : base(db) { _rag = rag; }

    private static readonly string[] OpenTicket = { TicketStatus.Open, TicketStatus.Assigned, TicketStatus.InProgress };
    private Guid TenantId => Db.CurrentTenantId!.Value; // her zaman token'dan

    [HttpPost("similar")]
    public async Task<IActionResult> Similar(TicketDraftRequest req, CancellationToken ct)
    {
        var title = (req.Title ?? "").Trim();
        if (title.Length < 4) return Ok(new { mode = "none", matches = Array.Empty<object>(), message = (string?)null });

        var hits = new List<(Guid Id, double Sim)>();
        var mode = "keyword";
        var rag = await _rag.TicketAssistAsync("similar-tickets", TenantId, title, req.Description, req.ExcludeId, ct);
        if (rag is JsonElement j && j.TryGetProperty("matches", out var arr))
        {
            mode = j.TryGetProperty("mode", out var m) ? m.GetString() ?? "semantic" : "semantic";
            foreach (var x in arr.EnumerateArray())
                if (Guid.TryParse(x.GetProperty("ticket_id").GetString(), out var id))
                    hits.Add((id, x.GetProperty("similarity").GetDouble()));
        }
        else
        {
            // Yedek: kelime benzerliği (açık ticket'lar, son 500)
            var v = TextSim.Vec(title, req.Description);
            var open = await Db.Tickets.Where(t => OpenTicket.Contains(t.Status) && t.Id != req.ExcludeId)
                .OrderByDescending(t => t.CreatedAt).Take(500)
                .Select(t => new { t.Id, t.Title, t.Description }).ToListAsync(ct);
            hits = open.Select(t => (t.Id, Sim: TextSim.Cosine(v, TextSim.Vec(t.Title, t.Description))))
                .Where(x => x.Sim >= 0.55).OrderByDescending(x => x.Sim).Take(3).ToList();
        }

        // Firma filtresi burada bir kez daha uygulanır (Db.Tickets tenant filtreli): RAG ne döndürürse döndürsün
        // başka firmanın ticket'ı asla gösterilmez. Durum da en güncel haliyle buradan okunur.
        var ids = hits.Select(h => h.Id).ToList();
        var tickets = await Db.Tickets.Where(t => ids.Contains(t.Id) && OpenTicket.Contains(t.Status))
            .ToDictionaryAsync(t => t.Id, ct);
        var names = await UserNamesAsync();
        var matches = hits.Where(h => tickets.ContainsKey(h.Id)).Select(h =>
        {
            var t = tickets[h.Id];
            var mine = t.ReporterId == Me;
            return new
            {
                t.Id, t.Title, t.Status, t.Category, t.CreatedAt, similarity = Math.Round(h.Sim, 2), mine,
                // Çalışan başkasının ticket detayını göremez; sadece başlığı ve durumu görür
                canOpen = mine || IsSupport || t.AssigneeId == Me,
                assigneeName = t.AssigneeId is Guid a ? names.GetValueOrDefault(a) : null,
                t.IncidentId,
            };
        }).ToList();

        return Ok(new
        {
            mode,
            matches,
            message = matches.Count == 0 ? null
                : matches.Count == 1 ? "Bu sorun için zaten açık bir ticket var, takip etmek ister misiniz?"
                : $"Bu sorun için {matches.Count} açık ticket var, takip etmek ister misiniz?",
        });
    }

    [HttpPost("suggest-triage")]
    public async Task<IActionResult> SuggestTriage(TicketDraftRequest req, CancellationToken ct)
    {
        var title = (req.Title ?? "").Trim();
        if (title.Length < 4) return Ok(new { mode = "none", suggestion = (object?)null });

        var rag = await _rag.TicketAssistAsync("suggest-triage", TenantId, title, req.Description, null, ct);
        if (rag is JsonElement j && j.TryGetProperty("suggestion", out var s))
        {
            if (s.ValueKind != JsonValueKind.Object) return Ok(new { mode = j.GetProperty("mode").GetString(), suggestion = (object?)null });
            return Ok(new
            {
                mode = j.GetProperty("mode").GetString(),
                suggestion = new
                {
                    category = Str(s, "category"), categoryConfidence = Conf(s, "category"),
                    priority = Str(s, "priority"), priorityConfidence = Conf(s, "priority"),
                    basedOn = s.GetProperty("neighbors").GetInt32(),
                },
            });
        }

        // Yedek: en benzer 15 geçmiş ticket, benzerliğinin karesiyle oy verir
        var v = TextSim.Vec(title, req.Description);
        var past = await Db.Tickets.OrderByDescending(t => t.CreatedAt).Take(1000)
            .Select(t => new { t.Title, t.Description, t.Category, t.Priority }).ToListAsync(ct);
        var near = past.Select(t => (t, sim: TextSim.Cosine(v, TextSim.Vec(t.Title, t.Description))))
            .Where(x => x.sim >= 0.35).OrderByDescending(x => x.sim).Take(15).ToList();
        if (near.Count == 0) return Ok(new { mode = "keyword", suggestion = (object?)null });

        (string? Value, double Conf) Vote(Func<string, string, string> pick)
        {
            var w = near.GroupBy(x => pick(x.t.Category, x.t.Priority))
                .Select(g => (g.Key, W: g.Sum(x => x.sim * x.sim))).OrderByDescending(x => x.W).ToList();
            var total = w.Sum(x => x.W);
            return total <= 0 ? (null, 0d) : (w[0].Key, Math.Round(w[0].W / total, 2));
        }
        var cat = Vote((c, _) => c);
        var pri = Vote((_, p) => p);
        return Ok(new
        {
            mode = "keyword",
            suggestion = new
            {
                category = cat.Value, categoryConfidence = cat.Conf,
                priority = pri.Value, priorityConfidence = pri.Conf,
                basedOn = near.Count,
            },
        });
    }

    private static string? Str(JsonElement s, string name) =>
        s.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Object && p.TryGetProperty("value", out var v)
            && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static double Conf(JsonElement s, string name) =>
        s.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Object && p.TryGetProperty("confidence", out var c)
            && c.ValueKind == JsonValueKind.Number ? c.GetDouble() : 0;
}
