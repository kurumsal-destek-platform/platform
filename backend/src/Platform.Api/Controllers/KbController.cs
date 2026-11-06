using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateArticleRequest(string Title, string Body, string? Category);
public record FeedbackRequest(Guid? ArticleId, bool Solved);
public record AskRequest(string Question);

[Route("api")]
public class KbController : ApiControllerBase
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly ILogger<KbController> _log;

    public KbController(AppDbContext db, IHttpClientFactory http, IConfiguration config, ILogger<KbController> log) : base(db)
    {
        _http = http; _config = config; _log = log;
    }

    [HttpGet("kb/articles")]
    public async Task<IActionResult> Articles([FromQuery] string? q, [FromQuery] string? category)
    {
        var all = await Db.Articles.Where(a => a.Published).ToListAsync();
        if (!string.IsNullOrEmpty(category)) all = all.Where(a => a.Category == category).ToList();
        var result = string.IsNullOrWhiteSpace(q) ? all.OrderBy(a => a.Title).ToList()
            : KbSearch.Rank(all, q, 50).Select(x => x.Article).ToList();
        return Ok(result.Select(a => new { a.Id, a.Title, a.Category, snippet = Snip(a.Body, 160) }));
    }

    [HttpGet("kb/articles/{id:guid}")]
    public async Task<IActionResult> Article(Guid id)
    {
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        return a is null ? NotFound() : Ok(a);
    }

    [HttpPost("kb/articles")]
    public async Task<IActionResult> CreateArticle(CreateArticleRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Makale eklemek için yönetici olmalısınız.");
        var a = new Article { Title = req.Title, Body = req.Body, Category = req.Category ?? "Diğer" };
        Db.Articles.Add(a);
        await Db.SaveChangesAsync();
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
        Db.KbFeedbacks.Add(new KbFeedback { UserId = Me, ArticleId = req.ArticleId, Solved = req.Solved });
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
                client.Timeout = TimeSpan.FromSeconds(20);
                var resp = await client.PostAsJsonAsync($"{ragUrl.TrimEnd('/')}/ask",
                    new { tenant_id = tenantId, question = req.Question, user_id = Me.ToString() });
                if (resp.IsSuccessStatusCode)
                    return Ok(await resp.Content.ReadFromJsonAsync<JsonElement>());
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
            return Ok(new
            {
                answered = false,
                reason = "out_of_scope",
                message = "Bu konuda bilgim yok, ticket açabilirsiniz.",
            });
        }

        var best = hits[0].Article;
        return Ok(new
        {
            answered = true,
            answer = $"{best.Title}: {best.Body}",
            sources = hits.Select(h => new { source_id = h.Article.Id, title = h.Article.Title }),
        });
    }

    private static string Snip(string s, int n) => s.Length <= n ? s : s[..n] + "…";
}
