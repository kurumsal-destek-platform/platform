namespace Platform.Domain;

// Bu arayüzü taşıyan her tablo firmaya (tenant) aittir ve otomatik filtrelenir.
public interface ITenantEntity
{
    Guid TenantId { get; set; }
}

public static class Roles
{
    public const string Employee = "Employee";
    public const string Agent = "Agent";        // Destek uzmanı: tüm ticketları görür ve çözer, yönetim ekranlarına girmez
    public const string Manager = "Manager";
    public const string Admin = "Admin";
}

public static class ProjectRoles
{
    public const string Manager = "Manager";
    public const string Member = "Member";
}

public static class WorkItemStatus
{
    public const string Todo = "todo";
    public const string InProgress = "in_progress";
    public const string InReview = "in_review";
    public const string Done = "done";
    public static readonly string[] All = { Todo, InProgress, InReview, Done };
}

public static class WorkItemTypes
{
    public static readonly string[] All = { "Epic", "Story", "Task", "Bug", "Subtask" };
}

public static class TicketStatus
{
    public const string Open = "open";
    public const string Assigned = "assigned";
    public const string InProgress = "in_progress";
    public const string Waiting = "waiting";      // çalışandan yanıt bekleniyor: SLA süresi durur
    public const string Resolved = "resolved";
    public const string Closed = "closed";
    public static readonly string[] All = { Open, Assigned, InProgress, Waiting, Resolved, Closed };
}

public class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
}

public class User : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Email { get; set; } = "";
    public string FullName { get; set; } = "";
    public string PasswordHash { get; set; } = "";   // davet edilip henüz şifre koymamışsa boş
    public string Role { get; set; } = Roles.Employee;
    public string? Department { get; set; }          // "Muhasebe", "IT Destek"… (firma kendi listesini oluşturur)
    public bool IsActive { get; set; } = true;
    public bool EmailConfirmed { get; set; }
    public int FailedLoginCount { get; set; }
    public DateTime? LockoutEnd { get; set; }
    // Şifre değişince yenilenir; eski JWT'ler geçersiz olur
    public string SecurityStamp { get; set; } = Guid.NewGuid().ToString("N");
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
}

public static class TokenPurposes
{
    public const string ResetPassword = "reset";
    public const string Invite = "invite";
    public const string VerifyEmail = "verify";
}

// Şifre sıfırlama / davet / e-posta doğrulama bağlantıları. Token'ın kendisi değil, SHA-256 özeti saklanır.
public class AuthToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Purpose { get; set; } = TokenPurposes.ResetPassword;
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Project : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int NextItemNumber { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ProjectMember : ITenantEntity
{
    public Guid ProjectId { get; set; }
    public Guid UserId { get; set; }
    public Guid TenantId { get; set; }
    public string Role { get; set; } = ProjectRoles.Member;
}

public class WorkItem : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public string Key { get; set; } = "";
    public string Type { get; set; } = "Task";
    public Guid? ParentId { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Status { get; set; } = WorkItemStatus.Todo;
    public string Priority { get; set; } = "Medium";
    public Guid? AssigneeId { get; set; }
    public Guid ReporterId { get; set; }
    public DateTime? StartDate { get; set; }   // zaman çizelgesi için
    public DateTime? DueDate { get; set; }
    public string[] Labels { get; set; } = Array.Empty<string>();
    public int? StoryPoints { get; set; }
    public Guid? SprintId { get; set; }      // null = backlog
    public int Rank { get; set; }            // backlog sırası
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class Comment : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WorkItemId { get; set; }
    public Guid AuthorId { get; set; }
    public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Ticket : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Category { get; set; } = "Diğer";
    public string Priority { get; set; } = "Medium";
    public string Status { get; set; } = TicketStatus.Open;
    public Guid ReporterId { get; set; }
    public Guid? AssigneeId { get; set; }
    public string? ResolutionNote { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
    public Guid? WorkItemId { get; set; }   // göreve çevrildiyse
    public Guid? IncidentId { get; set; }   // büyük bir olaya bağlandıysa
    public Guid? MergedIntoId { get; set; } // başka bir ticket ile birleştirildiyse (bu ticket kapanır)
    public Guid[] Watchers { get; set; } = Array.Empty<Guid>();  // ek takipçiler: görür ve bildirim alır
    public DateTime? WaitingSince { get; set; }  // "yanıt bekleniyor" durumuna geçiş anı (SLA durur)

    // ---- SLA ----
    public DateTime? ResponseDueAt { get; set; }    // ilk yanıt için son an (mesai saatine göre)
    public DateTime? ResolutionDueAt { get; set; }  // çözüm için son an
    public DateTime? FirstResponseAt { get; set; }  // ilk kez atandığı / işleme alındığı an
    public bool SlaWarned { get; set; }             // "süre dolmak üzere" bildirimi gönderildi
    public bool SlaBreachNotified { get; set; }     // "süre aşıldı" bildirimi gönderildi

    // ---- Memnuniyet anketi ----
    public int? CsatRating { get; set; }            // 1-5
    public string? CsatComment { get; set; }
    public DateTime? CsatAt { get; set; }
}

// Ticket yazışması: destek ekibi ↔ çalışan. Internal = ekip içi not (çalışan görmez)
public class TicketMessage : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid TicketId { get; set; }
    public Guid AuthorId { get; set; }
    public string Body { get; set; } = "";
    public bool Internal { get; set; }
    public bool AiAssisted { get; set; }   // yapay zekâ taslağından yazıldı (raporlama için)
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Denetim kaydı (KVKK / iç denetim): kim, neyi, ne zaman yaptı. İçerik değil, işlem kaydedilir.
public class AuditLog : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid? UserId { get; set; }
    public string UserName { get; set; } = "";   // o anki ad (kullanıcı silinse de kayıt okunur kalsın)
    public string Action { get; set; } = "";     // "Ticket oluşturdu", "Giriş başarısız" …
    public string Method { get; set; } = "";
    public string Path { get; set; } = "";
    public int StatusCode { get; set; }
    public string? Ip { get; set; }
    public DateTime At { get; set; } = DateTime.UtcNow;
}

// Önceliğe göre SLA hedefleri (mesai saati cinsinden)
public class SlaPolicy : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Priority { get; set; } = "Medium";
    public double ResponseHours { get; set; }
    public double ResolutionHours { get; set; }
}

// Firma ayarları: mesai saatleri ve tasarruf hesabı için maliyet varsayımları
public class TenantSettings : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public int WorkStartHour { get; set; } = 9;
    public int WorkEndHour { get; set; } = 18;
    public string WorkDays { get; set; } = "1,2,3,4,5";   // 1=Pazartesi … 7=Pazar
    public double UtcOffsetHours { get; set; } = 3;       // Türkiye
    public double HourlyCost { get; set; } = 450;         // destek personelinin saatlik maliyeti (TL)
    public double MinutesPerTicket { get; set; } = 35;    // bir ticket'ın ortalama destek emeği
    public bool WeeklyDigest { get; set; } = true;        // pazartesi 09:00 yönetici özeti e-postası
    public DateTime? LastDigestAt { get; set; }           // son gönderim (aynı hafta tekrar gitmesin)
}

// Otomasyon kuralı: "ŞU olursa ŞUNU yap". Yeni ticket açılınca (portal veya e-posta) sırayla çalışır.
// Boş koşul = her ticket'a uyar. Koşullar VE ile bağlanır; anahtar kelimelerden biri geçmesi yeterli.
public class AutomationRule : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public int SortOrder { get; set; }

    // ---- Koşullar ----
    public string? WhenCategory { get; set; }
    public string? WhenPriority { get; set; }
    public string? WhenKeywords { get; set; }        // virgülle: "vpn, uzak bağlantı"
    public string? WhenSenderDomain { get; set; }    // ör. "anka.com" (e-postayla gelenler dahil)

    // ---- Eylemler ----
    public Guid? SetAssigneeId { get; set; }
    public string? SetPriority { get; set; }
    public string? SetCategory { get; set; }
    public bool NotifyManagers { get; set; }
    public bool StopProcessing { get; set; }         // bu kural çalışırsa sonrakilere bakma

    public int RunCount { get; set; }
    public DateTime? LastRunAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class IncidentStatus
{
    public const string Active = "active";
    public const string Resolved = "resolved";
}

// Büyük olay: aynı sorun için açılan çok sayıda ticket tek çatı altında toplanır
public class Incident : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Severity { get; set; } = "High";
    public string Status { get; set; } = IncidentStatus.Active;
    public Guid CreatedById { get; set; }
    public Guid? OwnerId { get; set; }
    public string? ResolutionNote { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
}

// Asistana sorulan her soru: cevaplanamayanlar "bilgi boşluğu radarı"nı besler
public class AssistantQuery : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }
    public string Question { get; set; } = "";
    public bool Answered { get; set; }
    public Guid? DraftArticleId { get; set; }  // bu soru için taslak yazıldıysa radar tekrar göstermesin
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Article : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string Category { get; set; } = "Diğer";
    public bool Published { get; set; } = true;
    public Guid? SourceTicketId { get; set; }  // çözülen ticket'tan üretildiyse
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    // Yönetim bilgileri: kim yazdı/değiştirdi, kaçıncı sürüm, etiketler, okunma, arşiv (silinen makale geri alınabilir)
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public int Version { get; set; } = 1;
    public string[] Tags { get; set; } = Array.Empty<string>();
    public int ViewCount { get; set; }
    public bool Archived { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public Guid? ArchivedBy { get; set; }
}

// Makalenin eski sürümleri: her düzenlemeden önce önceki hal saklanır, istenirse geri yüklenir
public class ArticleRevision : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ArticleId { get; set; }
    public int Version { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string Category { get; set; } = "";
    public string[] Tags { get; set; } = Array.Empty<string>();
    public Guid? EditedBy { get; set; }
    public DateTime EditedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class KbFeedback : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }
    public Guid? ArticleId { get; set; }
    public bool Solved { get; set; }
    public string Source { get; set; } = "article";   // article | wizard | assistant
    public int? StepsTried { get; set; }               // sihirbazda kaç adım denendi
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class SprintStatus
{
    public const string Planned = "planned";
    public const string Active = "active";
    public const string Closed = "closed";
}

public class Sprint : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = "";
    public string Goal { get; set; } = "";
    public string Status { get; set; } = SprintStatus.Planned;
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Kim, neyi, ne zaman değiştirdi
public class ActivityLog : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid? ProjectId { get; set; }
    public Guid? WorkItemId { get; set; }
    public Guid UserId { get; set; }
    public string Action { get; set; } = "";     // created, status, assignee, comment, updated, sprint
    public string? Field { get; set; }
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public DateTime At { get; set; } = DateTime.UtcNow;
}

public class Notification : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }             // bildirimi alan
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string? Link { get; set; }            // frontend adresi, ör. /projects/ANK?item=ANK-3
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class LinkTypes
{
    public const string Blocks = "blocks";       // kaynak, hedefi engeller
    public const string Relates = "relates";     // ilişkili
    public const string Duplicates = "duplicates"; // kaynak, hedefin kopyası
    public static readonly string[] All = { Blocks, Relates, Duplicates };
}

public class WorkItemLink : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid SourceId { get; set; }
    public Guid TargetId { get; set; }
    public string Type { get; set; } = LinkTypes.Relates;
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// "Bana atanan açık buglar" gibi kaydedilmiş liste/pano filtreleri
public class SavedFilter : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid OwnerId { get; set; }
    public string Name { get; set; } = "";
    public string Query { get; set; } = "{}";   // filtre alanları (JSON)
    public bool Shared { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Attachment : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid? WorkItemId { get; set; }
    public Guid? TicketId { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
    public string StoredName { get; set; } = "";  // diskteki adı
    public Guid UploadedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Hazır yanıt: destek ekibinin sık yazdığı cevaplar. {ad}, {ticket}, {benim_adim} yer tutucuları doldurulur.
public class CannedResponse : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string? Category { get; set; }
    public Guid CreatedBy { get; set; }
    public bool Shared { get; set; } = true;     // tüm destek ekibi kullanır (değilse sadece oluşturan)
    public int UsageCount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
