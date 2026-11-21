using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record InboundMailRequest(string From, string Subject, string Text);
public record DigestSettingsRequest(bool Enabled);

[Route("api")]
public class MailController : ApiControllerBase
{
    private readonly MailProcessor _proc;
    private readonly IEmailSender _mail;
    private readonly IConfiguration _cfg;

    public MailController(AppDbContext db, MailProcessor proc, IEmailSender mail, IConfiguration cfg) : base(db)
    {
        _proc = proc; _mail = mail; _cfg = cfg;
    }

    // E-posta sağlayıcısının (SendGrid Inbound Parse, Mailgun Routes vb.) çağıracağı adres.
    // Mail:Inbound:Secret ayarlı değilse kapalıdır; X-Inbound-Secret başlığı eşleşmeli.
    [AllowAnonymous]
    [HttpPost("inbound/email")]
    public async Task<IActionResult> Inbound(InboundMailRequest req, [FromHeader(Name = "X-Inbound-Secret")] string? secret, CancellationToken ct)
    {
        var expected = _cfg["Mail:Inbound:Secret"];
        if (string.IsNullOrEmpty(expected)) return NotFound();
        if (secret is null || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(expected)))
            return Unauthorized();
        var result = await _proc.ProcessAsync(new InboundMail(req.From ?? "", req.Subject ?? "", req.Text ?? ""), ct);
        return Ok(new { result });
    }

    // Ayarlar sayfası için: destek adresi ve kanal durumu
    [HttpGet("mail/channel")]
    public IActionResult Channel() => Ok(new
    {
        supportAddress = _proc.SupportAddress,
        mailpitInbox = !string.IsNullOrWhiteSpace(_cfg["Mail:Inbound:MailpitUrl"]),
        webhook = !string.IsNullOrWhiteSpace(_cfg["Mail:Inbound:Secret"]),
        lastCheckAt = MailpitInbox.LastRunAt,
    });

    // ---------------- Haftalık yönetici özeti ----------------
    [HttpGet("digest/preview")]
    public async Task<IActionResult> Preview(CancellationToken ct)
    {
        if (!IsManagerOrAdmin) return Forbidden("Özeti sadece yöneticiler görebilir.");
        var tid = Db.CurrentTenantId!.Value;
        var d = await Digest.BuildAsync(Db, tid, DateTime.UtcNow, ct);
        var s = await Db.TenantSettings.FirstOrDefaultAsync(ct);
        return Ok(new
        {
            enabled = s?.WeeklyDigest ?? true, lastSentAt = s?.LastDigestAt,
            d.From, d.To, d.Opened, d.Resolved, d.OpenNow, d.BreachedOpen, d.SlaPercent, d.Csat, d.CsatCount,
            d.Deflected, d.MoneySaved,
            topUnanswered = d.TopUnanswered.Select(x => new { question = x.Question, count = x.Count }),
            html = Digest.Html(d, AuthTokens.FrontendUrl(_cfg, "/performance")),
        });
    }

    // Demo / kontrol için: özeti şimdi sadece bana gönder
    [HttpPost("digest/send-now")]
    public async Task<IActionResult> SendNow(CancellationToken ct)
    {
        if (!IsManagerOrAdmin) return Forbidden("Sadece yöneticiler.");
        var me = await Db.Users.FirstAsync(u => u.Id == Me, ct);
        var d = await Digest.BuildAsync(Db, me.TenantId, DateTime.UtcNow, ct);
        await _mail.SendAsync(me.Email, $"Haftalık destek özeti · {d.Company}", Digest.Html(d, AuthTokens.FrontendUrl(_cfg, "/performance")));
        return Ok(new { message = $"Özet {me.Email} adresine gönderildi." });
    }

    [HttpPut("digest/settings")]
    public async Task<IActionResult> DigestSettings(DigestSettingsRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Sadece yöneticiler.");
        var s = await Db.TenantSettings.FirstOrDefaultAsync();
        if (s is null) { s = Sla.DefaultSettings(Db.CurrentTenantId!.Value); Db.TenantSettings.Add(s); }
        s.WeeklyDigest = req.Enabled;
        await Db.SaveChangesAsync();
        return Ok(new { enabled = s.WeeklyDigest });
    }
}
