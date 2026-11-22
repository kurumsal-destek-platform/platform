using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateArticleRequest(string Title, string Body, string? Category, string[]? Tags = null, bool? Published = null, int? ExpectedVersion = null);
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

    // ---------------- Makaleler ----------------
    private record Stats(int Yes, int No);

    private async Task<Dictionary<Guid, Stats>> FeedbackStatsAsync()
    {
        var rows = await Db.KbFeedbacks.Where(f => f.ArticleId != null && f.Source == "article")
            .GroupBy(f => new { f.ArticleId, f.Solved }).Select(g => new { g.Key.ArticleId, g.Key.Solved, N = g.Count() }).ToListAsync();
        return rows.GroupBy(r => r.ArticleId!.Value).ToDictionary(g => g.Key,
            g => new Stats(g.Where(x => x.Solved).Sum(x => x.N), g.Where(x => !x.Solved).Sum(x => x.N)));
    }

    private static int? HelpfulPct(Stats? s) => s is null || s.Yes + s.No == 0 ? null : (int)Math.Round(100.0 * s.Yes / (s.Yes + s.No));

    private object ListDto(Article a, Dictionary<Guid, Stats> stats, Dictionary<Guid, string> names) => new
    {
        a.Id, a.Title, a.Category, a.Published, a.Tags, a.Version, views = a.ViewCount,
        fromTicket = a.SourceTicketId != null, snippet = Snip(a.Body, 180),
        updatedAt = a.UpdatedAt ?? a.CreatedAt,
        author = a.CreatedBy is Guid c ? names.GetValueOrDefault(c) : null,
        helpful = HelpfulPct(stats.GetValueOrDefault(a.Id)),
        votes = stats.GetValueOrDefault(a.Id) is Stats s ? s.Yes + s.No : 0,
    };

    private object FullDto(Article a, Stats? st, Dictionary<Guid, string> names, bool? myVote) => new
    {
        a.Id, a.Title, a.Body, a.Category, a.Published, a.Tags, a.Version, a.CreatedAt, a.SourceTicketId,
        views = a.ViewCount, updatedAt = a.UpdatedAt ?? a.CreatedAt,
        author = a.CreatedBy is Guid c ? names.GetValueOrDefault(c) : null,
        updatedBy = a.UpdatedBy is Guid u ? names.GetValueOrDefault(u) : null,
        helpfulYes = st?.Yes ?? 0, helpfulNo = st?.No ?? 0, helpful = HelpfulPct(st), myVote,
        canEdit = IsSupport, canDelete = IsManagerOrAdmin,
    };

    // sort: title (varsayılan) | recent | popular | helpful
    [HttpGet("kb/articles")]
    public async Task<IActionResult> Articles([FromQuery] string? q, [FromQuery] string? category, [FromQuery] string? tag,
        [FromQuery] string? sort, [FromQuery] bool drafts = false)
    {
        var all = await Db.Articles.Where(a => a.Published || (drafts && IsSupport)).ToListAsync();
        if (!string.IsNullOrEmpty(category)) all = all.Where(a => a.Category == category).ToList();
        if (!string.IsNullOrWhiteSpace(tag)) { var t = ArticleRules.NormalizeTag(tag); all = all.Where(a => a.Tags.Contains(t)).ToList(); }
        var stats = await FeedbackStatsAsync();
        List<Article> result;
        if (!string.IsNullOrWhiteSpace(q))
        {
            // etiketler de aramaya dahil
            var hits = KbSearch.Rank(all, q, 50).Select(x => x.Article).ToList();
            var tq = ArticleRules.NormalizeTag(q);
            result = hits.Concat(all.Where(a => a.Tags.Any(t => t.Contains(tq)) && !hits.Contains(a))).ToList();
        }
        else result = sort switch
        {
            "recent" => all.OrderByDescending(a => a.UpdatedAt ?? a.CreatedAt).ToList(),
            "popular" => all.OrderByDescending(a => a.ViewCount).ThenBy(a => a.Title).ToList(),
            "helpful" => all.OrderByDescending(a => HelpfulPct(stats.GetValueOrDefault(a.Id)) ?? -1).ThenByDescending(a => a.ViewCount).ToList(),
            _ => all.OrderBy(a => a.Title).ToList(),
        };
        var names = await UserNamesAsync();
        return Ok(result.Select(a => ListDto(a, stats, names)));
    }

    [HttpGet("kb/tags")]
    public async Task<IActionResult> Tags()
    {
        var tags = await Db.Articles.Where(a => a.Published || IsSupport).Select(a => a.Tags).ToListAsync();
        return Ok(tags.SelectMany(t => t).GroupBy(t => t).OrderByDescending(g => g.Count()).ThenBy(g => g.Key)
            .Select(g => new { tag = g.Key, count = g.Count() }));
    }

    [HttpGet("kb/articles/{id:guid}")]
    public async Task<IActionResult> Article(Guid id)
    {
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null || (!a.Published && !IsSupport)) return NotFound();
        // Okunma sayısı: destek ekibinin kendi bakışları sayılmaz (çalışanların gerçek kullanımını ölçer)
        if (!IsSupport && a.Published) { a.ViewCount++; await Db.SaveChangesAsync(); }
        var st = (await FeedbackStatsAsync()).GetValueOrDefault(a.Id);
        var mine = await Db.KbFeedbacks.Where(f => f.UserId == Me && f.ArticleId == id && f.Source == "article")
            .OrderByDescending(f => f.CreatedAt).Select(f => (bool?)f.Solved).FirstOrDefaultAsync();
        return Ok(FullDto(a, st, await UserNamesAsync(), mine));
    }

    private async Task<bool> TitleTakenAsync(string title, Guid? except)
    {
        var t = title.Trim().ToLower();
        return await Db.Articles.AnyAsync(a => a.Title.ToLower() == t && a.Id != except);
    }

    [HttpPost("kb/articles")]
    public async Task<IActionResult> CreateArticle(CreateArticleRequest req)
    {
        if (!IsSupport) return Forbidden("Makale eklemek için destek ekibinde olmalısınız.");
        if (ArticleRules.Validate(req.Title, req.Body, req.Category, req.Tags) is string err) return BadRequest(new { message = err });
        if (await TitleTakenAsync(req.Title, null)) return Conflict(new { message = "Bu başlıkla bir makale zaten var. Mevcut makaleyi düzenleyin ya da farklı bir başlık seçin." });
        var a = new Article
        {
            Title = req.Title.Trim(), Body = req.Body.Trim(), Category = ArticleRules.CleanCategory(req.Category),
            Tags = ArticleRules.NormalizeTags(req.Tags), Published = req.Published ?? true, CreatedBy = Me,
        };
        Db.Articles.Add(a);
        await Db.SaveChangesAsync();
        if (a.Published) _rag.ReindexInBackground(a.TenantId); // asistan yeni bilgiyi hemen kullansın
        return Ok(FullDto(a, null, await UserNamesAsync(), null));
    }

    // Değişiklikten önce mevcut hali geçmişe yazar
    private void Snapshot(Article a) => Db.ArticleRevisions.Add(new ArticleRevision
    {
        TenantId = a.TenantId, ArticleId = a.Id, Version = a.Version, Title = a.Title, Body = a.Body, Category = a.Category,
        Tags = a.Tags, EditedBy = a.UpdatedBy ?? a.CreatedBy, EditedAt = a.UpdatedAt ?? a.CreatedAt,
    });

    [HttpPut("kb/articles/{id:guid}")]
    public async Task<IActionResult> UpdateArticle(Guid id, CreateArticleRequest req)
    {
        if (!IsSupport) return Forbidden("Makale düzenlemek için destek ekibinde olmalısınız.");
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return NotFound();
        // Aynı anda iki kişi düzenliyorsa sonraki kaydeden diğerinin değişikliğini ezmesin
        if (req.ExpectedVersion is int ev && ev != a.Version)
            return Conflict(new { message = "Bu makale siz düzenlerken başka biri tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.", code = "version_conflict" });
        var cat = string.IsNullOrWhiteSpace(req.Category) ? a.Category : req.Category;
        if (ArticleRules.Validate(req.Title, req.Body, cat, req.Tags ?? a.Tags) is string err) return BadRequest(new { message = err });
        if (await TitleTakenAsync(req.Title, a.Id)) return Conflict(new { message = "Bu başlıkla başka bir makale var." });
        var tags = req.Tags is null ? a.Tags : ArticleRules.NormalizeTags(req.Tags);
        var cleanCat = ArticleRules.CleanCategory(cat);
        if (a.Title == req.Title.Trim() && a.Body == req.Body.Trim() && a.Category == cleanCat && a.Tags.SequenceEqual(tags))
            return Ok(FullDto(a, null, await UserNamesAsync(), null));   // değişiklik yok, yeni sürüm açma
        Snapshot(a);
        a.Title = req.Title.Trim(); a.Body = req.Body.Trim(); a.Category = cleanCat; a.Tags = tags;
        a.Version++; a.UpdatedAt = DateTime.UtcNow; a.UpdatedBy = Me;
        await Db.SaveChangesAsync();
        if (a.Published) _rag.ReindexInBackground(a.TenantId);
        return Ok(FullDto(a, null, await UserNamesAsync(), null));
    }

    [HttpPost("kb/articles/{id:guid}/publish")]
    public async Task<IActionResult> Publish(Guid id, [FromQuery] bool published = true)
    {
        if (!IsSupport) return Forbidden("Yayınlamak için destek ekibinde olmalısınız.");
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return NotFound();
        a.Published = published;
        await Db.SaveChangesAsync();
        _rag.ReindexInBackground(a.TenantId); // asistan yeni bilgiyi hemen kullansın
        return Ok(new { a.Id, a.Published });
    }

    // Sürüm geçmişi: en yeni üstte; en baştaki "güncel" sürümdür
    [HttpGet("kb/articles/{id:guid}/revisions")]
    public async Task<IActionResult> Revisions(Guid id)
    {
        if (!IsSupport) return Forbidden("Sürüm geçmişi destek ekibi içindir.");
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return NotFound();
        var names = await UserNamesAsync();
        var revs = await Db.ArticleRevisions.Where(r => r.ArticleId == id).OrderByDescending(r => r.Version).ToListAsync();
        var current = new { version = a.Version, a.Title, a.Body, a.Category, a.Tags, current = true,
            editedAt = a.UpdatedAt ?? a.CreatedAt, editedBy = (a.UpdatedBy ?? a.CreatedBy) is Guid e ? names.GetValueOrDefault(e) : null };
        return Ok(new[] { current }.Concat(revs.Select(r => new { version = r.Version, r.Title, r.Body, r.Category, r.Tags, current = false,
            editedAt = r.EditedAt, editedBy = r.EditedBy is Guid e ? names.GetValueOrDefault(e) : null })));
    }

    [HttpPost("kb/articles/{id:guid}/revisions/{version:int}/restore")]
    public async Task<IActionResult> RestoreRevision(Guid id, int version)
    {
        if (!IsSupport) return Forbidden("Sürüm geri yüklemek için destek ekibinde olmalısınız.");
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        var r = await Db.ArticleRevisions.FirstOrDefaultAsync(x => x.ArticleId == id && x.Version == version);
        if (a is null || r is null) return NotFound();
        Snapshot(a);
        a.Title = r.Title; a.Body = r.Body; a.Category = r.Category; a.Tags = r.Tags;
        a.Version++; a.UpdatedAt = DateTime.UtcNow; a.UpdatedBy = Me;
        await Db.SaveChangesAsync();
        if (a.Published) _rag.ReindexInBackground(a.TenantId);
        return Ok(FullDto(a, null, await UserNamesAsync(), null));
    }

    // Silme = arşive kaldırma (yanlışlıkla silinen makale geri alınabilir). Sadece yönetici/admin.
    [HttpDelete("kb/articles/{id:guid}")]
    public async Task<IActionResult> Archive(Guid id)
    {
        if (!IsManagerOrAdmin) return Forbidden("Makale silmek için yönetici olmalısınız.");
        var a = await Db.Articles.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return NotFound();
        a.Archived = true; a.ArchivedAt = DateTime.UtcNow; a.ArchivedBy = Me; a.Published = false;
        await Db.SaveChangesAsync();
        _rag.ReindexInBackground(a.TenantId);
        return NoContent();
    }

    [HttpGet("kb/archive")]
    public async Task<IActionResult> ArchiveList()
    {
        if (!IsManagerOrAdmin) return Forbidden("Arşiv yöneticiler içindir.");
        var tid = Guid.Parse(User.FindFirst("tenant_id")!.Value);
        var list = await Db.Articles.IgnoreQueryFilters().Where(a => a.TenantId == tid && a.Archived)
            .OrderByDescending(a => a.ArchivedAt).ToListAsync();
        var names = await UserNamesAsync();
        return Ok(list.Select(a => new { a.Id, a.Title, a.Category, a.ArchivedAt,
            archivedBy = a.ArchivedBy is Guid b ? names.GetValueOrDefault(b) : null }));
    }

    [HttpPost("kb/archive/{id:guid}/restore")]
    public async Task<IActionResult> Unarchive(Guid id)
    {
        if (!IsManagerOrAdmin) return Forbidden("Arşiv yöneticiler içindir.");
        var tid = Guid.Parse(User.FindFirst("tenant_id")!.Value);
        var a = await Db.Articles.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tid && x.Archived);
        if (a is null) return NotFound();
        if (await TitleTakenAsync(a.Title, a.Id)) return Conflict(new { message = "Aynı başlıkla yeni bir makale var; önce onun başlığını değiştirin." });
        a.Archived = false; a.ArchivedAt = null; a.ArchivedBy = null;   // taslak olarak döner, kontrol edip yayınlanır
        await Db.SaveChangesAsync();
        return Ok(new { a.Id });
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
        // Makale oyu: kişi başına bir oy (fikrini değiştirirse güncellenir), sayılar şişmesin
        if (source == "article" && req.ArticleId is Guid aid)
        {
            var prev = await Db.KbFeedbacks.FirstOrDefaultAsync(f => f.UserId == Me && f.ArticleId == aid && f.Source == "article");
            if (prev is not null) { prev.Solved = req.Solved; prev.CreatedAt = DateTime.UtcNow; await Db.SaveChangesAsync(); return NoContent(); }
        }
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
