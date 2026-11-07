namespace Platform.Domain;

// Bu arayüzü taşıyan her tablo firmaya (tenant) aittir ve otomatik filtrelenir.
public interface ITenantEntity
{
    Guid TenantId { get; set; }
}

public static class Roles
{
    public const string Employee = "Employee";
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
    public const string Resolved = "resolved";
    public const string Closed = "closed";
    public static readonly string[] All = { Open, Assigned, InProgress, Resolved, Closed };
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
}

public class KbFeedback : ITenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }
    public Guid? ArticleId { get; set; }
    public bool Solved { get; set; }
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
