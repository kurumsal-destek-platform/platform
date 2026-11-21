using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record PostMessageRequest(string Body, bool Internal = false, bool AiAssisted = false);

// Ticket yazışması + destek ekibi için yapay zekâ cevap taslağı
[Route("api/tickets/{ticketId:guid}")]
public class TicketMessagesController : ApiControllerBase
{
    private readonly LocalLlm _llm;
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly MailProcessor _mail;

    public TicketMessagesController(AppDbContext db, LocalLlm llm, IHttpClientFactory http, IConfiguration cfg, MailProcessor mail) : base(db)
    {
        _llm = llm; _http = http; _cfg = cfg; _mail = mail;
    }

    // Açan kişi, atanan ve yöneticiler görebilir. Destek tarafı = atanan veya yönetici.
    private async Task<(Ticket? t, bool canSee, bool isSupport)> AccessAsync(Guid ticketId)
    {
        var t = await Db.Tickets.FirstOrDefaultAsync(x => x.Id == ticketId);
        if (t is null) return (null, false, false);
        var support = IsManagerOrAdmin || t.AssigneeId == Me;
        return (t, support || t.ReporterId == Me, support);
    }

    [HttpGet("messages")]
    public async Task<IActionResult> List(Guid ticketId)
    {
        var (t, canSee, support) = await AccessAsync(ticketId);
        if (t is null) return NotFound();
        if (!canSee) return Forbidden("Bu ticket'ı göremezsiniz.");
        var names = await UserNamesAsync();
        var msgs = await Db.TicketMessages.Where(m => m.TicketId == ticketId && (support || !m.Internal))
            .OrderBy(m => m.CreatedAt).ToListAsync();
        return Ok(msgs.Select(m => new
        {
            m.Id, m.Body, m.Internal, m.AiAssisted, m.CreatedAt, m.AuthorId,
            authorName = m.AuthorId == TicketIntake.System ? "Sistem" : names.GetValueOrDefault(m.AuthorId),
            system = m.AuthorId == TicketIntake.System,
            fromSupport = m.AuthorId != t.ReporterId,
        }));
    }

    [HttpPost("messages")]
    public async Task<IActionResult> Post(Guid ticketId, PostMessageRequest req)
    {
        var (t, canSee, support) = await AccessAsync(ticketId);
        if (t is null) return NotFound();
        if (!canSee) return Forbidden("Bu ticket'a yazamazsınız.");
        if (string.IsNullOrWhiteSpace(req.Body)) return BadRequest(new { message = "Mesaj boş olamaz." });
        if (req.Internal && !support) return Forbidden("İç notu sadece destek ekibi yazabilir.");

        var m = new TicketMessage
        {
            TenantId = t.TenantId, TicketId = t.Id, AuthorId = Me, Body = TextUtil.Snip(req.Body.Trim(), 8000),
            Internal = req.Internal, AiAssisted = req.AiAssisted && support,
        };
        Db.TicketMessages.Add(m);

        if (!req.Internal)
        {
            if (support && Me != t.ReporterId)
            {
                t.FirstResponseAt ??= DateTime.UtcNow;   // SLA: ekibin ilk cevabı = ilk yanıt
                if (t.Status == TicketStatus.Open) { t.Status = TicketStatus.InProgress; t.AssigneeId ??= Me; }
                Events.Notify(Db, t.TenantId, t.ReporterId, Me, "Destek ekibi cevap yazdı", $"\"{t.Title}\": {TextUtil.Snip(m.Body, 120)}", $"/tickets?open={t.Id}");
            }
            else if (t.AssigneeId is Guid a)
                Events.Notify(Db, t.TenantId, a, Me, "Çalışan cevap yazdı", $"\"{t.Title}\": {TextUtil.Snip(m.Body, 120)}", $"/tickets?open={t.Id}");
        }
        await Db.SaveChangesAsync();
        var names = await UserNamesAsync();

        // Destek ekibinin cevabı çalışana e-postayla da gider; çalışan maili yanıtlarsa cevap bu ticket'a düşer
        if (!req.Internal && support && Me != t.ReporterId)
            await _mail.SendReplyAsync(t, names.GetValueOrDefault(Me) ?? "Destek ekibi", m.Body);

        return Ok(new { m.Id, m.Body, m.Internal, m.AiAssisted, m.CreatedAt, m.AuthorId, authorName = names.GetValueOrDefault(Me) ?? (m.AuthorId == TicketIntake.System ? "Sistem" : null), fromSupport = Me != t.ReporterId });
    }

    // ✨ Cevap taslağı: bilgi bankası + geçmişte işe yarayan çözümler + yazışma → yerel yapay zekâ
    [HttpPost("reply-draft")]
    public async Task<IActionResult> Draft(Guid ticketId, CancellationToken ct)
    {
        var (t, _, support) = await AccessAsync(ticketId);
        if (t is null) return NotFound();
        if (!support) return Forbidden("Taslak sadece destek ekibi içindir.");

        var names = await UserNamesAsync();
        var reporter = names.GetValueOrDefault(t.ReporterId) ?? "";
        var firstName = reporter.Split(' ').FirstOrDefault() ?? "";
        var me = names.GetValueOrDefault(Me) ?? "Destek Ekibi";
        var query = $"{t.Title}. {t.Description}";

        // 1) Bilgi bankası: önce RAG (anlamsal), olmazsa kelime araması
        var tenantId = Guid.Parse(User.FindFirst("tenant_id")!.Value);
        var articles = new List<Article>();
        var rag = await RagSearch.SearchAsync(_http, _cfg, tenantId, query, ct);
        if (rag is not null)
        {
            var ids = rag.Where(r => r.Confident).Select(r => r.ArticleId).Distinct().Take(2).ToList();
            var found = await Db.Articles.Where(a => ids.Contains(a.Id) && a.Published).ToListAsync(ct);
            articles = ids.Select(id => found.FirstOrDefault(a => a.Id == id)).Where(a => a != null).Select(a => a!).ToList();
        }
        if (articles.Count == 0)
        {
            var all = await Db.Articles.Where(a => a.Published).ToListAsync(ct);
            articles = KbSearch.Rank(all, query, 2).Where(x => x.Score >= 2).Select(x => x.Article).ToList();
        }

        // 2) Benzer, çözülmüş ve iyi puan almış ticket'ların çözüm notları
        var resolved = await Db.Tickets.Where(x => x.Id != t.Id && x.ResolutionNote != null &&
                (x.Status == TicketStatus.Resolved || x.Status == TicketStatus.Closed))
            .OrderByDescending(x => x.CreatedAt).Take(400).ToListAsync(ct);
        var v = TextSim.Vec(t.Title, t.Description);
        var similar = resolved.Select(x => (x, sim: TextSim.Cosine(v, TextSim.Vec(x.Title, x.Description))))
            .Where(x => x.sim >= 0.3 && (x.x.CsatRating ?? 4) >= 3)
            .OrderByDescending(x => x.sim).ThenByDescending(x => x.x.CsatRating ?? 0).Take(3).ToList();

        // 3) Yazışma (çalışan ne söyledi, ne denendi)
        var thread = await Db.TicketMessages.Where(m => m.TicketId == t.Id && !m.Internal).OrderBy(m => m.CreatedAt).ToListAsync(ct);
        var convo = string.Join("\n", thread.TakeLast(6).Select(m => $"{(m.AuthorId == t.ReporterId ? "Çalışan" : "Destek")}: {TextUtil.Snip(m.Body, 300)}"));

        var prompt = $"""
            Sen bir şirketin IT destek uzmanısın. Aşağıdaki ticket'a çalışana gönderilecek Türkçe bir cevap yaz.
            Kurallar: Kibar ve kısa ol. "Merhaba {firstName}," ile başla. Çözümü numaralı adımlarla yaz.
            SADECE aşağıdaki bilgi bankası ve geçmiş çözümlerdeki bilgileri kullan; adres, sürüm, isim uydurma.
            Çalışanın zaten denediğini söylediği adımları tekrar isteme. Bilgi yetersizse eksik bilgiyi nazikçe sor.
            Sonunda "İşe yaramazsa bu mesajı yanıtlamanız yeterli." yaz ve "{me}" diye imzala.

            TICKET: {t.Title}
            AÇIKLAMA: {TextUtil.Snip(t.Description, 1200)}
            {(convo.Length > 0 ? "YAZIŞMA:\n" + convo : "")}

            BİLGİ BANKASI:
            {(articles.Count > 0 ? string.Join("\n\n", articles.Select(a => $"[{a.Title}]\n{TextUtil.Snip(a.Body, 1500)}")) : "(ilgili makale yok)")}

            BENZER TICKET'LARDA İŞE YARAYAN ÇÖZÜMLER:
            {(similar.Count > 0 ? TextUtil.Bullets(similar.Select(s => s.x.ResolutionNote!)) : "(yok)")}
            """;

        var ai = await _llm.GenerateAsync(prompt, ct);
        string draft;
        if (ai is not null) draft = ai.Trim();
        else
        {
            // Yapay zekâ yoksa: makale adımları + benzer çözümlerden derli toplu bir şablon
            var steps = articles.FirstOrDefault()?.Body.Split('\n').Select(l => l.Trim())
                .Where(l => l.Length > 2 && char.IsDigit(l[0])).Take(6).ToList() ?? new();
            var body = steps.Count > 0
                ? "Aşağıdaki adımları sırayla dener misiniz?\n" + string.Join("\n", steps)
                : similar.Count > 0
                    ? $"Benzer durumlarda şu çözüm işe yaradı: {similar[0].x.ResolutionNote}"
                    : "Sorunu daha iyi anlayabilmem için hata mesajının ekran görüntüsünü ve sorunun ne zamandan beri devam ettiğini paylaşır mısınız?";
            draft = $"Merhaba {firstName},\n\n{body}\n\nİşe yaramazsa bu mesajı yanıtlamanız yeterli.\n\n{me}";
        }

        return Ok(new
        {
            draft,
            aiGenerated = ai is not null,
            sources = articles.Select(a => new { type = "article", id = a.Id, title = a.Title })
                .Concat<object>(similar.Select(s => new { type = "ticket", id = s.x.Id, title = s.x.Title, resolution = s.x.ResolutionNote, rating = s.x.CsatRating })),
        });
    }
}
