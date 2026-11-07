using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// Aktivite kaydı ve bildirim üretimi tek yerde. Kayıtlar SaveChanges ile birlikte yazılır.
public static class Events
{
    public static void Log(AppDbContext db, Guid userId, WorkItem item, string action,
        string? field = null, string? oldValue = null, string? newValue = null)
    {
        db.ActivityLogs.Add(new ActivityLog
        {
            TenantId = item.TenantId, ProjectId = item.ProjectId, WorkItemId = item.Id, UserId = userId,
            Action = action, Field = field, OldValue = oldValue, NewValue = newValue,
        });
    }

    public static void Notify(AppDbContext db, Guid tenantId, Guid toUserId, Guid fromUserId,
        string title, string body, string? link)
    {
        if (toUserId == fromUserId) return; // kendi yaptığın işin bildirimi gelmez
        db.Notifications.Add(new Notification
        {
            TenantId = tenantId, UserId = toUserId, Title = title, Body = body, Link = link,
        });
    }

    public static string StatusLabel(string s) => s switch
    {
        "todo" => "Yapılacak", "in_progress" => "Devam ediyor", "in_review" => "İncelemede", "done" => "Tamamlandı",
        "open" => "Açık", "assigned" => "Atandı", "resolved" => "Çözüldü", "closed" => "Kapandı",
        _ => s,
    };

    public static string ItemLink(string projectKey, string itemKey) => $"/projects/{projectKey}?item={itemKey}";
}
