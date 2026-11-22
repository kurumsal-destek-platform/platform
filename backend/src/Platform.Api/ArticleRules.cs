namespace Platform.Api;

// Bilgi bankası makale kuralları (saf fonksiyonlar, birim testi var)
public static class ArticleRules
{
    public const int TitleMin = 5, TitleMax = 200, BodyMin = 20, BodyMax = 20000, MaxTags = 10, TagMax = 30, CategoryMax = 40;

    public static string? Validate(string? title, string? body, string? category, IEnumerable<string>? tags)
    {
        var t = (title ?? "").Trim();
        var b = (body ?? "").Trim();
        if (t.Length < TitleMin) return $"Başlık en az {TitleMin} karakter olmalı.";
        if (t.Length > TitleMax) return $"Başlık en fazla {TitleMax} karakter olabilir.";
        if (b.Length < BodyMin) return $"İçerik çok kısa (en az {BodyMin} karakter). Çözüm adımlarını yazın.";
        if (b.Length > BodyMax) return $"İçerik en fazla {BodyMax} karakter olabilir.";
        if ((category ?? "").Trim().Length > CategoryMax) return $"Kategori adı en fazla {CategoryMax} karakter olabilir.";
        var list = NormalizeTags(tags);
        if (list.Length > MaxTags) return $"En fazla {MaxTags} etiket eklenebilir.";
        if ((tags ?? Array.Empty<string>()).Any(x => (x ?? "").Trim().Length > TagMax)) return $"Etiketler en fazla {TagMax} karakter olabilir.";
        return null;
    }

    public static string CleanCategory(string? c) => string.IsNullOrWhiteSpace(c) ? "Diğer" : c.Trim();

    // "  VPN " → "vpn", "#Outlook" → "outlook"; Türkçe küçük harf
    public static string NormalizeTag(string tag) =>
        (tag ?? "").Trim().TrimStart('#').ToLower(new System.Globalization.CultureInfo("tr-TR"));

    public static string[] NormalizeTags(IEnumerable<string>? tags) =>
        (tags ?? Array.Empty<string>()).Select(NormalizeTag).Where(t => t.Length > 0 && t.Length <= TagMax).Distinct().ToArray();
}
