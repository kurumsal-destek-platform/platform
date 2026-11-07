using System.Net;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// ---------------- E-posta ----------------
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string html);
}

// Smtp:Host boşsa e-postayı göndermez, loga yazar (geliştirme için).
// Docker'da Mailpit'e gider: http://localhost:8025 adresinden gelen kutusu görülür.
public class SmtpEmailSender : IEmailSender
{
    private readonly IConfiguration _cfg;
    private readonly ILogger<SmtpEmailSender> _log;
    public SmtpEmailSender(IConfiguration cfg, ILogger<SmtpEmailSender> log) { _cfg = cfg; _log = log; }

    public async Task SendAsync(string to, string subject, string html)
    {
        var host = _cfg["Smtp:Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            _log.LogWarning("SMTP ayarlı değil. E-posta gönderilmedi.\nKime: {To}\nKonu: {Subject}\n{Body}", to, subject, html);
            return;
        }
        using var msg = new MailMessage(_cfg["Smtp:From"] ?? "destek@platform.local", to, subject, html) { IsBodyHtml = true };
        using var client = new SmtpClient(host, int.TryParse(_cfg["Smtp:Port"], out var p) ? p : 25)
        {
            EnableSsl = bool.TryParse(_cfg["Smtp:Ssl"], out var ssl) && ssl,
        };
        var user = _cfg["Smtp:User"];
        if (!string.IsNullOrEmpty(user)) client.Credentials = new NetworkCredential(user, _cfg["Smtp:Password"]);
        try
        {
            await client.SendMailAsync(msg);
        }
        catch (SmtpException ex)
        {
            // E-posta gitmese de kullanıcıya hata göstermeyelim; loga yazalım
            _log.LogError(ex, "E-posta gönderilemedi: {To}", to);
        }
    }
}

public static class EmailTemplates
{
    private static string Layout(string title, string body, string buttonText, string url) => $"""
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#172b4d">
          <h2 style="margin:0 0 16px">◆ Destek Platformu</h2>
          <h3 style="margin:0 0 12px">{title}</h3>
          <p style="line-height:1.5">{body}</p>
          <p style="margin:24px 0"><a href="{url}" style="background:#0c66e4;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">{buttonText}</a></p>
          <p style="font-size:12px;color:#626f86">Buton çalışmazsa bu adresi tarayıcıya yapıştırın:<br>{url}</p>
          <p style="font-size:12px;color:#626f86">Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
        </div>
        """;

    public static string Reset(string name, string url) =>
        Layout("Şifre sıfırlama", $"Merhaba {WebUtility.HtmlEncode(name)}, şifrenizi sıfırlamak için aşağıdaki butona tıklayın. Bağlantı 30 dakika geçerlidir.", "Yeni şifre belirle", url);

    public static string Invite(string name, string company, string inviter, string url) =>
        Layout($"{WebUtility.HtmlEncode(company)} sizi davet etti",
            $"Merhaba {WebUtility.HtmlEncode(name)}, {WebUtility.HtmlEncode(inviter)} sizi Destek Platformu'na davet etti. Hesabınızı etkinleştirmek için şifrenizi oluşturun. Bağlantı 7 gün geçerlidir.",
            "Şifremi oluştur", url);

    public static string Verify(string name, string url) =>
        Layout("E-posta adresinizi doğrulayın", $"Merhaba {WebUtility.HtmlEncode(name)}, hesabınızı kullanmaya başlamak için e-posta adresinizi doğrulayın. Bağlantı 24 saat geçerlidir.", "E-postamı doğrula", url);
}

// ---------------- Şifre kuralları ----------------
public static class PasswordPolicy
{
    // null = geçerli; değilse kullanıcıya gösterilecek mesaj
    public static string? Validate(string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < 8) return "Şifre en az 8 karakter olmalı.";
        if (password.Length > 128) return "Şifre çok uzun.";
        if (!password.Any(char.IsUpper)) return "Şifre en az bir büyük harf içermeli.";
        if (!password.Any(char.IsLower)) return "Şifre en az bir küçük harf içermeli.";
        if (!password.Any(char.IsDigit)) return "Şifre en az bir rakam içermeli.";
        return null;
    }
}

// ---------------- Tek kullanımlık bağlantı token'ları ----------------
public static class AuthTokens
{
    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    // Yeni token üretir, öncekileri (aynı amaçla) geçersiz kılar. Ham token'ı döner (sadece e-postaya yazılır).
    public static async Task<string> IssueAsync(AppDbContext db, Guid userId, string purpose, TimeSpan lifetime)
    {
        var old = await db.AuthTokens.Where(t => t.UserId == userId && t.Purpose == purpose && t.UsedAt == null).ToListAsync();
        foreach (var t in old) t.UsedAt = DateTime.UtcNow;

        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        db.AuthTokens.Add(new AuthToken
        {
            UserId = userId, Purpose = purpose, TokenHash = Hash(raw), ExpiresAt = DateTime.UtcNow.Add(lifetime),
        });
        return raw;
    }

    // Geçerliyse token kaydını döner (henüz kullanıldı olarak işaretlemez)
    public static async Task<AuthToken?> FindValidAsync(AppDbContext db, string raw, params string[] purposes)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var hash = Hash(raw.Trim());
        var t = await db.AuthTokens.FirstOrDefaultAsync(x => x.TokenHash == hash);
        return t is not null && t.UsedAt == null && t.ExpiresAt > DateTime.UtcNow && purposes.Contains(t.Purpose) ? t : null;
    }

    public static string FrontendUrl(IConfiguration cfg, string path) =>
        $"{(cfg["App:FrontendUrl"] ?? "http://localhost:5173").TrimEnd('/')}{path}";
}
