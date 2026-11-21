using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateArticleRequest(string Title, string Body, string? Category);
public record FeedbackRequest(Guid? ArticleId, bool Solved, string? Source = null, int? StepsTried = null, string? Question = null);
// History: sohbetteki son soru-cevaplar (takip sorusu için, ör. "peki Mac'te?"). RAG servisi kullanır.
public record ChatTurn(string Question, string? Answer);
public record AskRequest(string Question, List<ChatTurn>? History = null);

[Route("api")]
public class KbController : ApiControllerBase
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly ILogger<KbController> _log;
    private readonly RagClient _rag;

    public KbController(AppDbContext db, IHttpClientFactory http, IConfiguration config, ILogger<KbController> log, RagClient rag) : base(db)
    {
        _http = http; _config = config; _log = log; _rag = rag;
    }

    [HttpGet("kb/articles")]
    public async Task<IActionResult> Articles([FromQuery] string? q, [FromQuery] string? category, [FromQuery] bool drafts = false)
    {
        // Yöneticiler taslakları da görebilir
        var all = await Db.Articles.Where(a => a.Published || (drafts && IsManagerOrAdmin)).ToListAsync();
        if (!string.IsNullOrEmpty(category)) all = all.Where(a => a.Category == category).ToList();
        var result = string.IsNullOrWhiteSpace(q) ? all.OrderBy(a => a.Title).ToList()
            : KbSearch.Rank(all, q, 50).Select(x => x.Article).ToList();
        return Ok(result.Select(a => new { a.Id, a.Title, a.Category, a.Published, fromTicket = a.SourceTicketId != null, snippet = Snip(a.Body, 160) }));
    }

    [HttpGet("kb/articles/{id:guid}")]
    public async Task<IActionResult> Article(Guid id)
    {
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        return a is null || (!a.Published && !IsManagerOrAdmin) ? NotFound() : Ok(a);
    }

    [HttpPost("kb/articles")]
    public async Task<IActionResult> CreateArticle(CreateArticleRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Makale eklemek için yönetici olmalısınız.");
        var a = new Article { Title = req.Title, Body = req.Body, Category = req.Category ?? "Diğer" };
        Db.Articles.Add(a);
        await Db.SaveChangesAsync();
        _rag.ReindexInBackground(a.TenantId); // asistan yeni bilgiyi hemen kullansın
        return Ok(a);
    }

    [HttpPut("kb/articles/{id:guid}")]
    public async Task<IActionResult> UpdateArticle(Guid id, CreateArticleRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Makale düzenlemek için yönetici olmalısınız.");
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return NotFound();
        a.Title = req.Title; a.Body = req.Body; a.Category = req.Category ?? a.Category;
        await Db.SaveChangesAsync();
        _rag.ReindexInBackground(a.TenantId); // asistan yeni bilgiyi hemen kullansın
        return Ok(a);
    }

    [HttpPost("kb/articles/{id:guid}/publish")]
    public async Task<IActionResult> Publish(Guid id, [FromQuery] bool published = true)
    {
        if (!IsManagerOrAdmin) return Forbidden("Yayınlamak için yönetici olmalısınız.");
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return NotFound();
        a.Published = published;
        await Db.SaveChangesAsync();
        _rag.ReindexInBackground(a.TenantId); // asistan yeni bilgiyi hemen kullansın
        return Ok(a);
    }

    // Ticket formunda "önce şunlara bakın" paneli
    [HttpGet("kb/suggest")]
    public async Task<IActionResult> Suggest([FromQuery] string q)
    {
        var all = await Db.Articles.Where(a => a.Published).ToListAsync();
        return Ok(KbSearch.Rank(all, q ?? "")
            .Select(x => new { x.Article.Id, x.Article.Title, x.Article.Category, snippet = Snip(x.Article.Body, 160) }));
    }

    // "Bu çözdü" → ticket açılmadı kaydı
    [HttpPost("kb/feedback")]
    public async Task<IActionResult> Feedback(FeedbackRequest req)
    {
        var source = req.Source is "wizard" or "assistant" ? req.Source : "article";
        Db.KbFeedbacks.Add(new KbFeedback { UserId = Me, ArticleId = req.ArticleId, Solved = req.Solved, Source = source, StepsTried = req.StepsTried });

        // Asistanın cevabı "işe yaramadı" → soru cevapsız sayılır ve bilgi boşluğu radarına düşer
        if (source == "assistant" && !req.Solved && !string.IsNullOrWhiteSpace(req.Question))
        {
            var text = TextUtil.Snip(req.Question.Trim(), 500);
            var since = DateTime.UtcNow.AddHours(-2);
            var q = await Db.AssistantQueries.Where(x => x.UserId == Me && x.Question == text && x.CreatedAt >= since)
                .OrderByDescending(x => x.CreatedAt).FirstOrDefaultAsync();
            if (q is not null) q.Answered = false;
        }
        await Db.SaveChangesAsync();
        return NoContent();
    }

    // Asistan: RAG servisi tanımlıysa ona iletir; yoksa / çökerse bilgi bankası aramasıyla cevap verir.
    [HttpPost("assistant/ask")]
    public async Task<IActionResult> Ask(AskRequest req)
    {
        var tenantId = User.FindFirst("tenant_id")!.Value; // tenant her zaman token'dan, kullanıcıdan değil
        var ragUrl = _config["Rag:Url"];

        if (!string.IsNullOrWhiteSpace(ragUrl))
        {
            try
            {
                var client = _http.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(60); // CPU'da LLM cevabı 20 sn'yi geçebilir
                var resp = await client.PostAsJsonAsync($"{ragUrl.TrimEnd('/')}/ask",
                    new
                    {
                        tenant_id = tenantId, question = req.Question, user_id = Me.ToString(),
                        history = (req.History ?? new()).TakeLast(3)
                            .Select(h => new { question = TextUtil.Snip(h.Question ?? "", 500), answer = TextUtil.Snip(h.Answer ?? "", 1500) }),
                    });
                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
                    var ok = json.TryGetProperty("answered", out var an) && an.ValueKind == JsonValueKind.True;
                    await LogQuestionAsync(req.Question, ok);
                    return Ok(json);
                }
                _log.LogWarning("RAG servisi {Code} döndü, yedek aramaya geçiliyor.", (int)resp.StatusCode);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "RAG servisine ulaşılamadı, yedek aramaya geçiliyor.");
            }
        }

        var all = await Db.Articles.Where(a => a.Published).ToListAsync();
        var hits = KbSearch.Rank(all, req.Question ?? "");
        if (hits.Count == 0 || hits[0].Score < 2)
        {
            await LogQuestionAsync(req.Question, false);
            return Ok(new
            {
                answered = false,
                reason = "out_of_scope",
                message = "Bu konuda bilgim yok, ticket açabilirsiniz.",
            });
        }

        var best = hits[0].Article;
        await LogQuestionAsync(req.Question, true);
        return Ok(new
        {
            answered = true,
            answer = $"{best.Title}: {best.Body}",
            sources = hits.Select(h => new { source_id = h.Article.Id, title = h.Article.Title }),
        });
    }

    // Bilgi boşluğu radarı için her soruyu kaydet (hata olursa cevabı engellemesin)
    private async Task LogQuestionAsync(string? question, bool answered)
    {
        if (string.IsNullOrWhiteSpace(question)) return;
        try
        {
            Db.AssistantQueries.Add(new AssistantQuery { UserId = Me, Question = TextUtil.Snip(question.Trim(), 500), Answered = answered });
            await Db.SaveChangesAsync();
        }
        catch (Exception ex) { _log.LogWarning(ex, "Soru kaydedilemedi"); }
    }

    private static string Snip(string s, int n) => s.Length <= n ? s : s[..n] + "…";
}
