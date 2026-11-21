using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// ================= E-posta kanalı =================
// Gelen: destek adresine yazılan mail → yeni ticket; konu satırında [#1a2b3c4d] varsa o ticket'a cevap.
// Giden: destek ekibinin ticket cevabı çalışana e-posta olarak gider (konu etiketi sayesinde cevap aynı ticket'a düşer).
// Kaynaklar: Mailpit (geliştirme/demo, MailpitInbox servisi) veya sağlayıcı webhook'u (POST /api/inbound/email).

public record InboundMail(string From, string Subject, string Text);

public static class MailText
{
    private static readonly Regex TagRx = new(@"\[#([0-9a-f]{8})\]", RegexOptions.IgnoreCase);
    private static readonly Regex PrefixRx = new(@"^\s*((re|fw|fwd|ynt|ilt|yanıt|ilet)\s*:\s*)+", RegexOptions.IgnoreCase);

    public static string Tag(Guid ticketId) => $"[#{ticketId.ToString("N")[..8]}]";

    public static string? TagOf(string subject) => TagRx.Match(subject) is { Success: true } m ? m.Groups[1].Value.ToLowerInvariant() : null;

    // "Re: VPN çalışmıyor [#1a2b3c4d]" → "VPN çalışmıyor"
    public static string CleanSubject(string subject)
    {
        var s = PrefixRx.Replace(TagRx.Replace(subject ?? "", ""), "").Trim();
        return s.Length == 0 ? "E-posta ile gelen talep" : TextUtil.Snip(s, 200);
    }

    // Cevap maillerinde alıntılanan eski yazışmayı at: "> ..." satırları ve "... yazdı:" / "wrote:" sonrası
    public static string StripQuoted(string text)
    {
        var lines = (text ?? "").Replace("\r", "").Split('\n');
        var keep = new List<string>();
        foreach (var line in lines)
        {
            var l = line.Trim();
            if (l.StartsWith(">")) break;
            if ((l.StartsWith("On ") && l.EndsWith("wrote:")) || l.EndsWith("yazdı:") || l.StartsWith("-----Original Message") ||
                l.StartsWith("----- Orijinal") || l.StartsWith("From:") && keep.Count > 0) break;
            keep.Add(line);
        }
        return string.Join("\n", keep).Trim();
    }

    public static string Address(string from)
    {
        var m = Regex.Match(from ?? "", @"<([^>]+)>");
        return (m.Success ? m.Groups[1].Value : from ?? "").Trim().ToLowerInvariant();
    }

    public static string Html(string title, string body, string? url = null, string? button = null) => $"""
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#172b4d">
          <h2 style="margin:0 0 16px">◆ Destek Platformu</h2>
          <h3 style="margin:0 0 12px">{WebUtility.HtmlEncode(title)}</h3>
          <div style="line-height:1.5;white-space:pre-wrap">{WebUtility.HtmlEncode(body)}</div>
          {(url is null ? "" : $"<p style=\"margin:24px 0\"><a href=\"{url}\" style=\"background:#0c66e4;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none\">{button}</a></p>")}
          <p style="font-size:12px;color:#626f86">Bu e-postayı yanıtlayarak ticket'a mesaj ekleyebilirsiniz. Konu satırındaki [#…] etiketini silmeyin.</p>
        </div>
        """;
}

public class MailProcessor
{
    private readonly AppDbContext _db;
    private readonly IEmailSender _mail;
    private readonly IConfiguration _cfg;
    private readonly IHubContext<LiveHub> _hub;
    private readonly ILogger<MailProcessor> _log;

    public MailProcessor(AppDbContext db, IEmailSender mail, IConfiguration cfg, IHubContext<LiveHub> hub, ILogger<MailProcessor> log)
    {
        _db = db; _mail = mail; _cfg = cfg; _hub = hub; _log = log;
    }

    public string SupportAddress => (_cfg["Mail:SupportAddress"] ?? "destek@platform.local").ToLowerInvariant();

    // Sonuç: "created:<id>", "reply:<id>" veya "ignored:<neden>"
    public async Task<string> ProcessAsync(InboundMail mail, CancellationToken ct = default)
    {
        var from = MailText.Address(mail.From);
        if (from.Length == 0 || from == SupportAddress) return "ignored:loop";

        // Sadece kayıtlı, aktif kullanıcılar ticket açabilir (bilinmeyen adresler spam/kimlik taklidi olabilir)
        var user = await _db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email.ToLower() == from && u.IsActive, ct);
        if (user is null) { _log.LogInformation("Bilinmeyen göndericiden e-posta yok sayıldı: {From}", from); return "ignored:unknown_sender"; }
        var tid = user.TenantId;
        var body = TextUtil.Snip(MailText.StripQuoted(mail.Text), 8000);

        // 1) Mevcut ticket'a cevap mı?
        if (MailText.TagOf(mail.Subject) is string tag)
        {
            var ids = await _db.Tickets.IgnoreQueryFilters().Where(t => t.TenantId == tid).Select(t => t.Id).ToListAsync(ct);
            var id = ids.FirstOrDefault(x => x.ToString("N").StartsWith(tag));
            var t = id == Guid.Empty ? null : await _db.Tickets.IgnoreQueryFilters().FirstAsync(x => x.Id == id, ct);
            var isSupport = user.Role is Roles.Manager or Roles.Admin || t?.AssigneeId == user.Id;
            if (t is not null && (t.ReporterId == user.Id || isSupport))
            {
                if (body.Length == 0) return "ignored:empty";
                _db.TicketMessages.Add(new TicketMessage { TenantId = tid, TicketId = t.Id, AuthorId = user.Id, Body = "📧 " + body });
                if (t.ReporterId == user.Id)
                {
                    if (t.Status == TicketStatus.Resolved) t.Status = TicketStatus.InProgress;   // çalışan "hâlâ olmuyor" dedi
                    if (t.AssigneeId is Guid a)
                        Events.Notify(_db, tid, a, user.Id, "Çalışan e-postayla cevap yazdı", $"\"{t.Title}\": {TextUtil.Snip(body, 120)}", $"/tickets?open={t.Id}");
                }
                await _db.SaveChangesAsync(ct);
                await LiveHub.BroadcastAsync(_hub, tid, "/api/tickets");
                return $"reply:{t.Id}";
            }
        }

        // 2) Yeni ticket
        var ticket = new Ticket
        {
            TenantId = tid, Title = MailText.CleanSubject(mail.Subject),
            Description = body.Length > 0 ? body : "(e-posta gövdesi boş)", ReporterId = user.Id,
        };
        await TicketIntake.CreateAsync(_db, ticket, user.Id, from, ct);
        _db.TicketMessages.Add(new TicketMessage
        {
            TenantId = tid, TicketId = ticket.Id, AuthorId = TicketIntake.System, Internal = true,
            Body = $"📧 E-postadan oluşturuldu ({from}).",
        });
        await _db.SaveChangesAsync(ct);
        await LiveHub.BroadcastAsync(_hub, tid, "/api/tickets");

        await _mail.SendAsync(from, $"Talebiniz alındı: {ticket.Title} {MailText.Tag(ticket.Id)}",
            MailText.Html("Talebiniz alındı",
                $"Merhaba {user.FullName.Split(' ')[0]},\n\n\"{ticket.Title}\" talebiniz destek ekibine ulaştı. " +
                "Gelişmeleri e-postayla bildireceğiz; bu e-postayı yanıtlayarak ek bilgi gönderebilirsiniz.",
                AuthTokens.FrontendUrl(_cfg, $"/tickets?open={ticket.Id}"), "Ticket'ı görüntüle"));
        return $"created:{ticket.Id}";
    }

    // Destek ekibinin cevabı → çalışana e-posta
    public async Task SendReplyAsync(Ticket t, string authorName, string body)
    {
        var reporter = await _db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == t.ReporterId && u.IsActive);
        if (reporter is null) return;
        await _mail.SendAsync(reporter.Email, $"Re: {t.Title} {MailText.Tag(t.Id)}",
            MailText.Html($"{authorName} cevap yazdı", body, AuthTokens.FrontendUrl(_cfg, $"/tickets?open={t.Id}"), "Ticket'ı görüntüle"));
    }
}

// Mailpit gelen kutusunu 10 saniyede bir okur (demo/geliştirme). Canlıda sağlayıcı webhook'u veya IMAP kullanılır.
public class MailpitInbox : BackgroundService
{
    public static DateTime? LastRunAt { get; private set; }
    private readonly IServiceProvider _sp;
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly ILogger<MailpitInbox> _log;

    public MailpitInbox(IServiceProvider sp, IHttpClientFactory http, IConfiguration cfg, ILogger<MailpitInbox> log)
    {
        _sp = sp; _http = http; _cfg = cfg; _log = log;
    }

    private record Addr(string Address);
    private record Summary(string ID, Addr From, List<Addr> To, string Subject, bool Read);
    private record SearchResult(List<Summary> Messages);
    private record Full(string ID, Addr From, string Subject, string Text);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var url = _cfg["Mail:Inbound:MailpitUrl"];
        if (string.IsNullOrWhiteSpace(url)) return;   // kapalı
        await Task.Delay(TimeSpan.FromSeconds(10), ct);
        while (!ct.IsCancellationRequested)
        {
            try { await TickAsync(url.TrimEnd('/'), ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { _log.LogWarning(ex, "Mailpit gelen kutusu okunamadı"); }
            await Task.Delay(TimeSpan.FromSeconds(10), ct);
        }
    }

    private async Task TickAsync(string url, CancellationToken ct)
    {
        LastRunAt = DateTime.UtcNow;
        using var scope = _sp.CreateScope();
        var proc = scope.ServiceProvider.GetRequiredService<MailProcessor>();
        var c = _http.CreateClient();
        var q = Uri.EscapeDataString($"to:{proc.SupportAddress} is:unread");
        var res = await c.GetFromJsonAsync<SearchResult>($"{url}/api/v1/search?query={q}&limit=50", ct);
        foreach (var s in (res?.Messages ?? new()).Where(m => !m.Read && (m.To ?? new()).Any(a => a.Address.Equals(proc.SupportAddress, StringComparison.OrdinalIgnoreCase))))
        {
            // Önce "okundu" işaretle: işlem hata verse bile aynı mail sonsuz döngüde tekrar işlenmesin
            await c.PutAsJsonAsync($"{url}/api/v1/messages", new { IDs = new[] { s.ID }, Read = true }, ct);
            var full = await c.GetFromJsonAsync<Full>($"{url}/api/v1/message/{s.ID}", ct);
            if (full is null) continue;
            var result = await proc.ProcessAsync(new InboundMail(full.From.Address, full.Subject ?? "", full.Text ?? ""), ct);
            _log.LogInformation("Gelen e-posta işlendi: {Subject} → {Result}", full.Subject, result);
        }
    }
}
