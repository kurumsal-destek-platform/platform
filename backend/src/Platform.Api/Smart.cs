using System.Globalization;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Platform.Api;

// Metin benzerliği: Ollama kapalı olsa bile çalışsın diye backend içinde, hızlı ve bağımlılıksız.
// Türkçe ekler yüzünden kelimeler ilk 5 harfe kısaltılır: "bağlanmıyor", "bağlantı" → "bağla"; "yazıcıdan" → "yazıc".
public static class TextSim
{
    private static readonly CultureInfo Tr = new("tr-TR");
    private static readonly HashSet<string> Stop = new()
    {
        "nasıl", "neden", "niçin", "nerede", "nereden", "hangi", "kim", "ne", "için", "ile", "gibi", "kadar",
        "daha", "çok", "bir", "bu", "şu", "var", "yok", "olur", "oldu", "olan", "ben", "benim", "bana", "sen",
        "siz", "biz", "lütfen", "acaba", "gerekiyor", "istiyorum", "nedir", "hala", "hâlâ", "yine", "sonra",
        "önce", "şimdi", "bugün", "dün", "sabah", "akşam", "her", "hiç", "çalışmıyor", "sorun", "problem",
        "yardım", "merhaba", "teşekkürler", "olarak", "değil", "ama", "fakat", "veya", "ve", "de", "da", "mi", "mı",
    };

    public static IEnumerable<string> Words(string text) =>
        new string(text.ToLower(Tr).Select(c => char.IsLetterOrDigit(c) ? c : ' ').ToArray())
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length >= 3 && !Stop.Contains(w));

    public static string Stem(string w) => w.Length > 5 ? w[..5] : w;

    // Başlık iki kat ağırlıklı
    public static Dictionary<string, double> Vec(string title, string? body = null)
    {
        var v = new Dictionary<string, double>();
        foreach (var w in Words(title)) v[Stem(w)] = v.GetValueOrDefault(Stem(w)) + 2;
        foreach (var w in Words(body ?? "")) v[Stem(w)] = v.GetValueOrDefault(Stem(w)) + 1;
        return v;
    }

    public static double Cosine(Dictionary<string, double> a, Dictionary<string, double> b)
    {
        if (a.Count == 0 || b.Count == 0) return 0;
        double dot = 0;
        foreach (var (k, x) in a) if (b.TryGetValue(k, out var y)) dot += x * y;
        var na = Math.Sqrt(a.Values.Sum(x => x * x));
        var nb = Math.Sqrt(b.Values.Sum(x => x * x));
        return dot / (na * nb);
    }

    // Sorgudaki kelimelerin (ağırlıklı) ne kadarı dokümanda geçiyor: kısa ticket'ı uzun makaleyle karşılaştırmak için
    public static double Coverage(Dictionary<string, double> query, Dictionary<string, double> doc)
    {
        var total = query.Values.Sum();
        return total == 0 ? 0 : query.Where(kv => doc.ContainsKey(kv.Key)).Sum(kv => kv.Value) / total;
    }

    public static double Sim(string t1, string? b1, string t2, string? b2) => Cosine(Vec(t1, b1), Vec(t2, b2));

    // Benzer öğeleri gruplar: bir öğe, gruptaki öğelerle ortalama benzerliği eşiği geçerse o gruba girer.
    public static List<List<T>> Cluster<T>(IReadOnlyList<T> items, Func<T, Dictionary<string, double>> vec, double threshold)
    {
        var vecs = items.ToDictionary(i => (object)i!, i => vec(i));
        var groups = new List<List<T>>();
        foreach (var it in items)
        {
            List<T>? best = null; double bestScore = 0;
            foreach (var g in groups)
            {
                var avg = g.Average(m => Cosine(vecs[it!], vecs[m!]));
                if (avg >= threshold && avg > bestScore) { best = g; bestScore = avg; }
            }
            if (best is null) groups.Add(new List<T> { it }); else best.Add(it);
        }
        return groups;
    }

    // Grubu en iyi temsil eden öğe (diğerlerine en çok benzeyen)
    public static T Central<T>(List<T> group, Func<T, Dictionary<string, double>> vec)
    {
        if (group.Count <= 2) return group[0];
        var vs = group.Select(vec).ToList();
        var best = 0; var bestAvg = -1.0;
        for (var i = 0; i < group.Count; i++)
        {
            var avg = Enumerable.Range(0, group.Count).Where(j => j != i).Average(j => Cosine(vs[i], vs[j]));
            if (avg > bestAvg) { bestAvg = avg; best = i; }
        }
        return group[best];
    }
}

// Yerel yapay zekâ (Ollama) ile metin yazdırma. Ulaşılamazsa null döner, çağıran şablona düşer.
public class LocalLlm
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly ILogger<LocalLlm> _log;
    public LocalLlm(IHttpClientFactory http, IConfiguration cfg, ILogger<LocalLlm> log) { _http = http; _cfg = cfg; _log = log; }

    public async Task<string?> GenerateAsync(string prompt, CancellationToken ct = default)
    {
        var url = _cfg["Ollama:Url"];
        if (string.IsNullOrWhiteSpace(url)) return null;
        try
        {
            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(90);
            var resp = await client.PostAsJsonAsync($"{url.TrimEnd('/')}/api/generate", new
            {
                model = _cfg["Ollama:Model"] ?? "qwen2.5:3b",
                prompt,
                stream = false,
                options = new { temperature = 0.2 },
            }, ct);
            if (!resp.IsSuccessStatusCode) { _log.LogWarning("Ollama {Code} döndü", (int)resp.StatusCode); return null; }
            var json = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            var text = json.TryGetProperty("response", out var r) ? r.GetString() : null;
            return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Ollama'ya ulaşılamadı, şablon kullanılacak.");
            return null;
        }
    }
}

public static class TextUtil
{
    public static string Snip(string s, int n) => s.Length <= n ? s : s[..n] + "…";
    public static string Bullets(IEnumerable<string> lines) =>
        string.Join("\n", lines.Where(l => !string.IsNullOrWhiteSpace(l)).Distinct().Select(l => "• " + l.Trim()));
}

// RAG servisiyle konuşan küçük istemci. RAG kapalıysa sessizce null/false döner; çağıran kendi yöntemine düşer.
public class RagClient
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly ILogger<RagClient> _log;
    public RagClient(IHttpClientFactory http, IConfiguration cfg, ILogger<RagClient> log) { _http = http; _cfg = cfg; _log = log; }

    private string? BaseUrl => string.IsNullOrWhiteSpace(_cfg["Rag:Url"]) ? null : _cfg["Rag:Url"]!.TrimEnd('/');

    // Makale değişince indeksi hemen güncelle (beklemeden; RAG zaten en geç 60 sn'de kendisi de fark eder)
    public void ReindexInBackground(Guid tenantId)
    {
        if (BaseUrl is not string url) return;
        _ = Task.Run(async () =>
        {
            try
            {
                var c = _http.CreateClient();
                c.Timeout = TimeSpan.FromSeconds(120);
                await c.PostAsync($"{url}/reindex?tenant_id={tenantId}", null);
            }
            catch (Exception ex) { _log.LogWarning(ex, "RAG yeniden indeksleme isteği başarısız"); }
        });
    }

    // Yinelenen ticket uyarısı / kategori-öncelik önerisi için RAG'e ticket taslağını gönderir. RAG kapalıysa null.
    // path: "similar-tickets" veya "suggest-triage"
    public async Task<JsonElement?> TicketAssistAsync(string path, Guid tenantId, string title, string? description,
        Guid? excludeId = null, CancellationToken ct = default)
    {
        if (BaseUrl is not string url) return null;
        try
        {
            var c = _http.CreateClient();
            c.Timeout = TimeSpan.FromSeconds(30);
            var resp = await c.PostAsJsonAsync($"{url}/{path}", new
            {
                tenant_id = tenantId.ToString(), title, description = description ?? "",
                exclude_id = excludeId?.ToString(), limit = 3,
            }, ct);
            if (!resp.IsSuccessStatusCode) return null;
            return await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        }
        catch (Exception ex)
        {
            _log.LogInformation("RAG {Path} yapılamadı ({Msg}); kelime yöntemine düşülüyor.", path, ex.Message);
            return null;
        }
    }

    // Her metin için bilgi bankasındaki en yakın parçanın anlamsal benzerliği. RAG/Ollama kapalıysa null.
    public async Task<(double[] Scores, double Threshold)?> CoverageAsync(Guid tenantId, IReadOnlyList<string> texts, CancellationToken ct = default)
    {
        if (BaseUrl is not string url || texts.Count == 0) return null;
        try
        {
            var c = _http.CreateClient();
            c.Timeout = TimeSpan.FromSeconds(60);
            var resp = await c.PostAsJsonAsync($"{url}/coverage", new { tenant_id = tenantId.ToString(), texts }, ct);
            if (!resp.IsSuccessStatusCode) return null;
            var json = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            var scores = json.GetProperty("scores").EnumerateArray().Select(x => x.GetDouble()).ToArray();
            return (scores, json.GetProperty("threshold").GetDouble());
        }
        catch (Exception ex)
        {
            _log.LogInformation("RAG kapsama kontrolü yapılamadı ({Msg}); kelime yöntemine düşülüyor.", ex.Message);
            return null;
        }
    }
}

// RAG arama sonucu (cevap taslağı için). RAG kapalıysa null.
public static class RagSearch
{
    public static async Task<List<(Guid ArticleId, string Title, string Snippet, bool Confident)>?> SearchAsync(
        IHttpClientFactory http, IConfiguration cfg, Guid tenantId, string query, CancellationToken ct = default)
    {
        var url = cfg["Rag:Url"];
        if (string.IsNullOrWhiteSpace(url)) return null;
        try
        {
            var c = http.CreateClient();
            c.Timeout = TimeSpan.FromSeconds(30);
            var resp = await c.PostAsJsonAsync($"{url.TrimEnd('/')}/search", new { tenant_id = tenantId.ToString(), query, top_k = 4 }, ct);
            if (!resp.IsSuccessStatusCode) return null;
            var json = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            return json.GetProperty("results").EnumerateArray()
                .Select(r => (Guid.Parse(r.GetProperty("source_id").GetString()!), r.GetProperty("title").GetString() ?? "",
                              r.GetProperty("snippet").GetString() ?? "", r.GetProperty("confident").GetBoolean()))
                .ToList();
        }
        catch { return null; }
    }
}
