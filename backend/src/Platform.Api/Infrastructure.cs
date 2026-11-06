using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Platform.Application;
using Platform.Domain;

namespace Platform.Api;

public class HttpTenantProvider : ITenantProvider
{
    private readonly IHttpContextAccessor _acc;
    public HttpTenantProvider(IHttpContextAccessor acc) { _acc = acc; }

    public Guid? TenantId => Read("tenant_id");
    public Guid? UserId => Read("sub");

    private Guid? Read(string type)
    {
        var v = _acc.HttpContext?.User.FindFirst(type)?.Value;
        return Guid.TryParse(v, out var g) ? g : null;
    }
}

public record JwtSettings(string Key);

public static class TokenService
{
    public static string Create(User u, JwtSettings s)
    {
        var claims = new[]
        {
            new Claim("sub", u.Id.ToString()),
            new Claim("tenant_id", u.TenantId.ToString()),
            new Claim("role", u.Role),
            new Claim("name", u.FullName),
            new Claim("email", u.Email),
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(s.Key));
        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.UtcNow.AddHours(12),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

// RAG servisi yoksa bilgi bankasında basit anahtar kelime araması yapar.
public static class KbSearch
{
    private static readonly CultureInfo Tr = new("tr-TR");

    // Anlam taşımayan kelimeler aramada sayılmaz.
    private static readonly HashSet<string> StopWords = new()
    {
        "nasıl", "neden", "niçin", "nerede", "nereden", "hangi", "kim", "ne", "mi", "mı", "mu", "mü",
        "bugün", "yarın", "dün", "için", "ile", "gibi", "kadar", "daha", "çok", "bir", "bu", "şu", "o",
        "var", "yok", "olur", "oldu", "olan", "ben", "benim", "bana", "sen", "siz", "biz", "lütfen",
        "acaba", "yapmalıyım", "yapabilirim", "yapılır", "yapmam", "gerekiyor", "istiyorum", "nedir",
    }; 

    public static List<(Article Article, int Score)> Rank(IEnumerable<Article> articles, string query, int take = 3)
    {
        var words = query.ToLower(Tr)
            .Split(new[] { ' ', ',', '.', '?', '!', ':', ';' }, StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length >= 3 && !StopWords.Contains(w))
            .ToArray();
        if (words.Length == 0) return new();

        return articles
            .Select(a =>
            {
                var title = a.Title.ToLower(Tr);
                var body = a.Body.ToLower(Tr);
                var score = words.Sum(w => (title.Contains(w) ? 3 : 0) + (body.Contains(w) ? 1 : 0));
                return (Article: a, Score: score);
            })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .Take(take)
            .ToList();
    }
}
