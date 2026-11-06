namespace Platform.Application;

// Giriş yapmış kullanıcının firmasını ve kimliğini verir (JWT'den okunur).
public interface ITenantProvider
{
    Guid? TenantId { get; }
    Guid? UserId { get; }
}
