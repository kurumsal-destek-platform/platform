using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

// Ticket ve görev ekleri (ekran görüntüsü, log, belge). Dosyalar diskte (docker volume: uploads), bilgisi veritabanında.
// Erişim: ticket → bildiren, atanan, yönetici/admin; görev → proje üyeleri.
[Route("api")]
public class AttachmentsController : ApiControllerBase
{
    public const long MaxBytes = 100 * 1024 * 1024;   // 100 MB (log arşivleri, ekran kayıtları)
    public static readonly string[] AllowedExt =
        { ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".txt", ".log", ".csv", ".docx", ".xlsx", ".pptx", ".zip", ".mp4", ".webm" };
    private static readonly string[] ImageExt = { ".png", ".jpg", ".jpeg", ".gif", ".webp" };

    private readonly string _dir;
    private readonly ILogger<AttachmentsController> _log;

    public AttachmentsController(AppDbContext db, IConfiguration cfg, ILogger<AttachmentsController> log) : base(db)
    {
        _dir = cfg["Uploads:Path"] ?? cfg["Storage:Uploads"] ?? Path.Combine(AppContext.BaseDirectory, "uploads");
        _log = log;
    }

    // Saf kontrol (birim testi var): sorun yoksa null, varsa kullanıcıya gösterilecek mesaj
    public static string? Validate(string fileName, long size)
    {
        if (size <= 0) return "Dosya boş.";
        if (size > MaxBytes) return "Dosya en fazla 100 MB olabilir.";
        var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
        if (!AllowedExt.Contains(ext)) return $"Bu dosya türü yüklenemez ({ext}). İzin verilenler: resim, video (mp4/webm), PDF, metin/log, Office, zip.";
        return null;
    }

    private static object Dto(Attachment a) => new
    {
        a.Id, a.FileName, a.ContentType, a.Size, a.CreatedAt, a.UploadedBy,
        isImage = ImageExt.Contains(Path.GetExtension(a.FileName).ToLowerInvariant()),
    };

    private async Task<bool> CanSeeTicketAsync(Guid ticketId)
    {
        var t = await Db.Tickets.FirstOrDefaultAsync(x => x.Id == ticketId);
        return t is not null && (IsSupport || t.ReporterId == Me || t.AssigneeId == Me || t.Watchers.Contains(Me));
    }

    private async Task<WorkItem?> ItemIfMemberAsync(string key)
    {
        var item = await Db.WorkItems.FirstOrDefaultAsync(w => w.Key == key.ToUpper());
        if (item is null || await MembershipAsync(item.ProjectId) is null) return null;
        return item;
    }

    private async Task<IActionResult> SaveAsync(IFormFile? file, Guid? ticketId, Guid? workItemId)
    {
        if (file is null) return BadRequest(new { message = "Dosya seçilmedi." });
        if (Validate(file.FileName, file.Length) is string err) return BadRequest(new { message = err });

        Directory.CreateDirectory(_dir);
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var a = new Attachment
        {
            TicketId = ticketId, WorkItemId = workItemId,
            FileName = Path.GetFileName(file.FileName),   // yol içeren adlara karşı
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            Size = file.Length, UploadedBy = Me,
            StoredName = $"{Guid.NewGuid():N}{ext}",    // diskte tahmin edilemeyen ad
        };
        await using (var fs = System.IO.File.Create(Path.Combine(_dir, a.StoredName)))
            await file.CopyToAsync(fs);
        Db.Attachments.Add(a);
        await Db.SaveChangesAsync();
        return Ok(Dto(a));
    }

    // ---- Ticket ekleri ----
    [HttpGet("tickets/{ticketId:guid}/attachments")]
    public async Task<IActionResult> TicketList(Guid ticketId)
    {
        if (!await CanSeeTicketAsync(ticketId)) return NotFound();
        var list = await Db.Attachments.Where(a => a.TicketId == ticketId).OrderBy(a => a.CreatedAt).ToListAsync();
        return Ok(list.Select(Dto));
    }

    [HttpPost("tickets/{ticketId:guid}/attachments")]
    [RequestSizeLimit(MaxBytes + 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxBytes + 1024 * 1024)]
    public async Task<IActionResult> TicketUpload(Guid ticketId, IFormFile? file)
    {
        if (!await CanSeeTicketAsync(ticketId)) return NotFound();
        return await SaveAsync(file, ticketId, null);
    }

    // ---- Görev (iş) ekleri ----
    [HttpGet("items/{key}/attachments")]
    public async Task<IActionResult> ItemList(string key)
    {
        var item = await ItemIfMemberAsync(key);
        if (item is null) return NotFound();
        var list = await Db.Attachments.Where(a => a.WorkItemId == item.Id).OrderBy(a => a.CreatedAt).ToListAsync();
        return Ok(list.Select(Dto));
    }

    [HttpPost("items/{key}/attachments")]
    [RequestSizeLimit(MaxBytes + 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxBytes + 1024 * 1024)]
    public async Task<IActionResult> ItemUpload(string key, IFormFile? file)
    {
        var item = await ItemIfMemberAsync(key);
        if (item is null) return NotFound();
        return await SaveAsync(file, null, item.Id);
    }

    // ---- İndirme ve silme ----
    private async Task<bool> CanSeeAsync(Attachment a)
    {
        if (a.TicketId is Guid tid && await CanSeeTicketAsync(tid)) return true;
        if (a.WorkItemId is Guid wid)
        {
            var item = await Db.WorkItems.FirstOrDefaultAsync(w => w.Id == wid);
            if (item is not null && await MembershipAsync(item.ProjectId) is not null) return true;
        }
        return false;
    }

    [HttpGet("attachments/{id:guid}")]
    public async Task<IActionResult> Download(Guid id)
    {
        var a = await Db.Attachments.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null || !await CanSeeAsync(a)) return NotFound();
        var path = Path.Combine(_dir, a.StoredName);
        if (!System.IO.File.Exists(path)) return NotFound(new { message = "Dosya sunucuda bulunamadı." });
        return PhysicalFile(path, a.ContentType, a.FileName);
    }

    [HttpDelete("attachments/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var a = await Db.Attachments.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null || !await CanSeeAsync(a)) return NotFound();
        if (a.UploadedBy != Me && !IsSupport) return Forbidden("Sadece yükleyen kişi veya destek ekibi silebilir.");
        Db.Attachments.Remove(a);
        await Db.SaveChangesAsync();
        try { System.IO.File.Delete(Path.Combine(_dir, a.StoredName)); }
        catch (Exception ex) { _log.LogWarning(ex, "Ek dosyası silinemedi: {Name}", a.StoredName); }
        return NoContent();
    }
}
