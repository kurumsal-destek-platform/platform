using System.Diagnostics;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

// Yöneticiler için: sistem durumu (tüm bileşenler tek ekranda) ve denetim kaydı
[Route("api")]
public class SystemController : ApiControllerBase
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private static readonly DateTime StartedAt = DateTime.UtcNow;

    public SystemController(AppDbContext db, IHttpClientFactory http, IConfiguration cfg) : base(db) { _http = http; _cfg = cfg; }

    private record Check(string Key, string Name, string Status, string Detail, long? Ms = null);   // Status: ok | warn | down

    [HttpGet("system/status")]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        if (!IsManagerOrAdmin) return Forbidden("Sadece yöneticiler.");
        var checks = new List<Check>();

        // 1) Veritabanı + bekleyen migration
        var sw = Stopwatch.StartNew();
        try
        {
            await Db.Database.ExecuteSqlRawAsync("SELECT 1", ct);
            var pending = (await Db.Database.GetPendingMigrationsAsync(ct)).Count();
            checks.Add(new("db", "Veritabanı (PostgreSQL)", pending == 0 ? "ok" : "warn",
                pending == 0 ? "Bağlı, şema güncel" : $"{pending} migration uygulanmamış", sw.ElapsedMilliseconds));
        }
        catch (Exception ex) { checks.Add(new("db", "Veritabanı (PostgreSQL)", "down", ex.Message)); }

        // 2) RAG servisi + içindekiler (Ollama, OCR, vektör tablosu)
        var ragUrl = _cfg["Rag:Url"];
        if (string.IsNullOrWhiteSpace(ragUrl)) checks.Add(new("rag", "Yapay zekâ servisi (RAG)", "warn", "Ayarlı değil; asistan kelime aramasıyla çalışır"));
        else
        {
            sw.Restart();
            try
            {
                var c = _http.CreateClient(); c.Timeout = TimeSpan.FromSeconds(6);
                var j = await c.GetFromJsonAsync<JsonElement>($"{ragUrl.TrimEnd('/')}/health", ct);
                var ms = sw.ElapsedMilliseconds;
                string P(string k) => j.TryGetProperty(k, out var v) ? v.GetString() ?? "" : "";
                checks.Add(new("rag", "Yapay zekâ servisi (RAG)", "ok", $"Çalışıyor · eşik {(j.TryGetProperty("threshold", out var th) ? th.ToString() : "?")}", ms));
                checks.Add(new("ollama", $"Yerel dil modeli (Ollama: {P("embed_model")}, {P("llm_model")})", P("ollama") == "ok" ? "ok" : "warn",
                    P("ollama") == "ok" ? "Ulaşılıyor" : "Ulaşılamıyor → asistan 'güvenli mod'da (kelime araması), taslaklar şablonla"));
                checks.Add(new("ocr", "Ekran görüntüsü okuma (Tesseract)", P("ocr") == "ok" ? "ok" : "warn",
                    P("ocr") == "ok" ? "Kurulu" : "Kurulu değil → görüntü eklenir ama okunamaz"));
            }
            catch (Exception ex) { checks.Add(new("rag", "Yapay zekâ servisi (RAG)", "down", $"Ulaşılamıyor ({ex.GetType().Name}) → backend kendi aramasına düşer")); }
        }

        // 3) E-posta sunucusu (TCP bağlantısı)
        var host = _cfg["Smtp:Host"];
        if (string.IsNullOrWhiteSpace(host)) checks.Add(new("smtp", "E-posta (SMTP)", "warn", "Ayarlı değil; e-postalar sadece log'a yazılır"));
        else
        {
            sw.Restart();
            try
            {
                using var tcp = new TcpClient();
                var port = int.TryParse(_cfg["Smtp:Port"], out var p) ? p : 25;
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct); cts.CancelAfter(3000);
                await tcp.ConnectAsync(host, port, cts.Token);
                checks.Add(new("smtp", "E-posta (SMTP)", "ok", $"{host}:{port} bağlantı kabul ediyor", sw.ElapsedMilliseconds));
            }
            catch (Exception) { checks.Add(new("smtp", "E-posta (SMTP)", "down", $"{host} sunucusuna bağlanılamıyor → şifre sıfırlama/davet e-postaları gitmez")); }
        }

        // 4) SLA bekçisi
        var last = SlaMonitor.LastRunAt;
        checks.Add(new("sla", "SLA bekçisi (arka plan)",
            last is null ? "warn" : (DateTime.UtcNow - last.Value).TotalMinutes < 3 ? "ok" : "down",
            last is null ? "Henüz çalışmadı (açılıştan 15 sn sonra başlar)" : $"Son kontrol {(int)(DateTime.UtcNow - last.Value).TotalSeconds} sn önce"));

        // 5) Dosya deposu
        var up = _cfg["Uploads:Path"] ?? Path.Combine(AppContext.BaseDirectory, "uploads");
        try
        {
            Directory.CreateDirectory(up);
            var probe = Path.Combine(up, ".probe");
            await System.IO.File.WriteAllTextAsync(probe, "ok", ct); System.IO.File.Delete(probe);
            checks.Add(new("files", "Dosya deposu", "ok", "Yazılabilir"));
        }
        catch (Exception ex) { checks.Add(new("files", "Dosya deposu", "down", ex.Message)); }

        // 6) Güvenlik yapılandırması
        var weakJwt = string.IsNullOrWhiteSpace(_cfg["Jwt:Key"]) || _cfg["Jwt:Key"]!.StartsWith("gelistirme");
        checks.Add(new("secrets", "Gizli anahtarlar", weakJwt ? "warn" : "ok",
            weakJwt ? "Geliştirme anahtarı kullanılıyor; canlıya geçmeden .env'de JWT_KEY belirleyin" : "Özel JWT anahtarı tanımlı"));

        var overall = checks.Any(c => c.Status == "down") ? "down" : checks.Any(c => c.Status == "warn") ? "warn" : "ok";
        return Ok(new
        {
            overall, checks,
            uptimeMinutes = (int)(DateTime.UtcNow - StartedAt).TotalMinutes,
            version = typeof(SystemController).Assembly.GetName().Version?.ToString(),
            environment = _cfg["ASPNETCORE_ENVIRONMENT"] ?? "?",
            counts = new
            {
                users = await Db.Users.CountAsync(ct), tickets = await Db.Tickets.CountAsync(ct),
                articles = await Db.Articles.CountAsync(ct), auditLast24h = await Db.AuditLogs.CountAsync(a => a.At >= DateTime.UtcNow.AddDays(-1), ct),
            },
        });
    }

    // Denetim kaydı: filtrelenebilir, CSV olarak indirilebilir
    [HttpGet("audit")]
    public async Task<IActionResult> Audit([FromQuery] string? q, [FromQuery] Guid? userId, [FromQuery] bool onlySecurity = false,
        [FromQuery] int days = 30, [FromQuery] string? format = null)
    {
        if (!IsManagerOrAdmin) return Forbidden("Sadece yöneticiler.");
        var since = DateTime.UtcNow.AddDays(-Math.Clamp(days, 1, 365));
        var query = Db.AuditLogs.Where(a => a.At >= since);
        if (userId is Guid u) query = query.Where(a => a.UserId == u);
        if (onlySecurity) query = query.Where(a => a.Action.StartsWith("Giriş") || a.Action.StartsWith("YETKİSİZ") || a.Action.StartsWith("Çok fazla")
                                                   || a.Action.Contains("Şifre") || a.Action.Contains("rol") || a.Action.Contains("kilidi") || a.Action.Contains("devre dışı"));
        if (!string.IsNullOrWhiteSpace(q)) { var t = q.Trim().ToLower(); query = query.Where(a => a.Action.ToLower().Contains(t) || a.UserName.ToLower().Contains(t) || a.Path.ToLower().Contains(t)); }
        var rows = await query.OrderByDescending(a => a.At).Take(format == "csv" ? 10000 : 300).ToListAsync();

        if (format == "csv")
        {
            var sb = new StringBuilder("Zaman (UTC);Kullanıcı;İşlem;Yöntem;Adres;Sonuç;IP\n");
            foreach (var a in rows)
                sb.AppendLine(string.Join(';', a.At.ToString("yyyy-MM-dd HH:mm:ss"), Csv(a.UserName), Csv(a.Action), a.Method, Csv(a.Path), a.StatusCode, a.Ip));
            return File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray(), "text/csv", $"denetim-kaydi-{DateTime.UtcNow:yyyyMMdd}.csv");
        }
        return Ok(rows.Select(a => new { a.Id, a.At, a.UserId, a.UserName, a.Action, a.Method, a.Path, a.StatusCode, a.Ip }));
    }

    private static string Csv(string? s) => s is null ? "" : s.Contains(';') || s.Contains('"') ? $"\"{s.Replace("\"", "\"\"")}\"" : s;
}
