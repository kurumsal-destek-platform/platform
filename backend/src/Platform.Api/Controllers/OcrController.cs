using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

// Ekran görüntüsünden hata mesajını okur: görüntü yerel RAG servisindeki Tesseract'a gider, dışarı çıkmaz.
[Route("api/ocr")]
public class OcrController : ApiControllerBase
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    public OcrController(AppDbContext db, IHttpClientFactory http, IConfiguration cfg) : base(db) { _http = http; _cfg = cfg; }

    private static readonly string[] Allowed = { "image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif" };

    [HttpPost]
    [RequestSizeLimit(8 * 1024 * 1024)]
    public async Task<IActionResult> Read(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { message = "Görüntü yok." });
        if (!Allowed.Contains(file.ContentType)) return BadRequest(new { message = "Sadece resim dosyası (PNG, JPG…)." });
        var url = _cfg["Rag:Url"];
        if (string.IsNullOrWhiteSpace(url)) return StatusCode(503, new { message = "Görüntü okuma servisi kapalı." });
        try
        {
            using var content = new MultipartFormDataContent();
            var part = new StreamContent(file.OpenReadStream());
            part.Headers.ContentType = new MediaTypeHeaderValue(file.ContentType);
            content.Add(part, "file", file.FileName);
            var c = _http.CreateClient();
            c.Timeout = TimeSpan.FromSeconds(40);
            var resp = await c.PostAsync($"{url.TrimEnd('/')}/ocr", content, ct);
            if (!resp.IsSuccessStatusCode) return StatusCode(503, new { message = "Görüntü okunamadı." });
            return Ok(await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct));
        }
        catch (Exception) { return StatusCode(503, new { message = "Görüntü okuma servisine ulaşılamadı." }); }
    }
}
