using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record ImportSection(string Title, string Body, string? Category);
public record ImportRequest(ImportSection[] Sections, bool Publish, string? SourceFile);

// Doküman içe aktarma: PDF/Word/metin → önizleme → onaylanan bölümler bilgi bankasına (ve asistana)
[Route("api/kb/import")]
public class KbImportController : ApiControllerBase
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly RagClient _rag;
    public KbImportController(AppDbContext db, IHttpClientFactory http, IConfiguration cfg, RagClient rag) : base(db) { _http = http; _cfg = cfg; _rag = rag; }

    private static readonly string[] Exts = { ".pdf", ".docx", ".txt", ".md", ".markdown", ".html", ".htm" };

    // 1) Önizleme: dosyayı bölümlere ayır, her bölüme kategori öner, benzer makale varsa uyar. Henüz HİÇBİR ŞEY kaydedilmez.
    [HttpPost("preview")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> Preview(IFormFile file, CancellationToken ct)
    {
        if (!IsManagerOrAdmin) return Forbidden("Doküman içe aktarmak için yönetici olmalısınız.");
        if (file is null || file.Length == 0) return BadRequest(new { message = "Dosya yok." });
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!Exts.Contains(ext)) return BadRequest(new { message = "PDF, Word (.docx), TXT, Markdown veya HTML yükleyin." });
        var url = _cfg["Rag:Url"];
        if (string.IsNullOrWhiteSpace(url)) return StatusCode(503, new { message = "Doküman okuma servisi (RAG) kapalı." });

        JsonElement doc;
        try
        {
            using var content = new MultipartFormDataContent();
            var part = new StreamContent(file.OpenReadStream());
            part.Headers.ContentType = new MediaTypeHeaderValue(string.IsNullOrEmpty(file.ContentType) ? "application/octet-stream" : file.ContentType);
            content.Add(part, "file", file.FileName);
            var c = _http.CreateClient(); c.Timeout = TimeSpan.FromSeconds(90);
            var resp = await c.PostAsync($"{url.TrimEnd('/')}/extract", content, ct);
            if ((int)resp.StatusCode == 422)
            {
                var err = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
                return BadRequest(new { message = err.TryGetProperty("detail", out var d) ? d.GetString() : "Dosya okunamadı." });
            }
            if (!resp.IsSuccessStatusCode) return StatusCode(503, new { message = "Doküman okunamadı." });
            doc = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        }
        catch (Exception) { return StatusCode(503, new { message = "Doküman okuma servisine ulaşılamadı." }); }

        // Kategori önerisi ve tekrar kontrolü: mevcut makalelere en çok benzeyen
        var articles = await Db.Articles.ToListAsync(ct);
        var vecs = articles.Select(a => (a, v: TextSim.Vec(a.Title, a.Body))).ToList();
        var sections = doc.GetProperty("sections").EnumerateArray().Select(s =>
        {
            var title = s.GetProperty("title").GetString() ?? "";
            var body = s.GetProperty("body").GetString() ?? "";
            var v = TextSim.Vec(title, body);
            var best = vecs.Select(x => (x.a, sim: TextSim.Cosine(v, x.v))).OrderByDescending(x => x.sim).FirstOrDefault();
            return new
            {
                title, body,
                suggestedCategory = best.a is not null && best.sim >= 0.15 ? best.a.Category : "Diğer",
                similarArticle = best.a is not null && best.sim >= 0.55 ? new { best.a.Id, best.a.Title, sim = Math.Round(best.sim, 2) } : null,
            };
        }).ToList();
        return Ok(new { file = doc.GetProperty("file").GetString(), pages = doc.TryGetProperty("pages", out var p) && p.ValueKind == JsonValueKind.Number ? p.GetInt32() : (int?)null, sections });
    }

    // 2) Onay: seçilen bölümleri makale olarak kaydet (taslak ya da yayında), asistanın indeksini güncelle
    [HttpPost]
    public async Task<IActionResult> Import(ImportRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Yetkiniz yok.");
        var list = (req.Sections ?? Array.Empty<ImportSection>()).Where(s => !string.IsNullOrWhiteSpace(s.Title) && !string.IsNullOrWhiteSpace(s.Body)).ToList();
        if (list.Count == 0) return BadRequest(new { message = "Kaydedilecek bölüm seçilmedi." });
        if (list.Count > 100) return BadRequest(new { message = "Tek seferde en fazla 100 bölüm." });

        var existing = (await Db.Articles.Select(a => a.Title).ToListAsync()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var created = new List<Article>();
        foreach (var s in list)
        {
            var title = TextUtil.Snip(s.Title.Trim(), 150);
            if (existing.Contains(title)) title = TextUtil.Snip($"{title} ({Path.GetFileNameWithoutExtension(req.SourceFile ?? "içe aktarılan")})", 150);
            existing.Add(title);
            var a = new Article
            {
                Title = title, CreatedBy = Me, Body = s.Body.Trim(), Category = string.IsNullOrWhiteSpace(s.Category) ? "Diğer" : s.Category!,
                Published = req.Publish,
            };
            Db.Articles.Add(a);
            created.Add(a);
        }
        await Db.SaveChangesAsync();
        if (req.Publish) _rag.ReindexInBackground(created[0].TenantId);
        return Ok(new { created = created.Count, published = req.Publish, articles = created.Select(a => new { a.Id, a.Title }) });
    }
}
