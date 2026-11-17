using System.Net;
using System.Net.Mail;

namespace Platform.Api;

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default);
}

public class SmtpEmailSender : IEmailSender
{
    private readonly IConfiguration _config;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IConfiguration config, ILogger<SmtpEmailSender> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        var host = _config["Smtp:Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            // SMTP ayarlanmamışsa gönderme, sadece logla (geliştirme ortamı için)
            _logger.LogWarning("SMTP ayarlı değil. E-posta gönderilmedi. Alıcı: {To}, Konu: {Subject}", to, subject);
            return;
        }

        var port = int.TryParse(_config["Smtp:Port"], out var p) ? p : 587;
        var user = _config["Smtp:User"];
        var pass = _config["Smtp:Password"];
        var from = _config["Smtp:From"] ?? user ?? "noreply@localhost";

        var ssl = bool.TryParse(_config["Smtp:Ssl"], out var s) && s;
        using var client = new SmtpClient(host, port) { EnableSsl = false };
        if (!string.IsNullOrWhiteSpace(user))
            client.Credentials = new NetworkCredential(user, pass);

        using var msg = new MailMessage(from, to, subject, htmlBody) { IsBodyHtml = true };
        await client.SendMailAsync(msg, ct);
    }
}