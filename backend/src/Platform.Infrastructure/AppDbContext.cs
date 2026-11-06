using Microsoft.EntityFrameworkCore;
using Platform.Application;
using Platform.Domain;

namespace Platform.Infrastructure;

public class AppDbContext : DbContext
{
    private readonly ITenantProvider _tenant;

    public AppDbContext(DbContextOptions<AppDbContext> options, ITenantProvider tenant) : base(options)
    {
        _tenant = tenant;
    }

    // Query filter'lar her sorguda bu değeri okur.
    public Guid? CurrentTenantId => _tenant.TenantId;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<WorkItem> WorkItems => Set<WorkItem>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<Article> Articles => Set<Article>();
    public DbSet<KbFeedback> KbFeedbacks => Set<KbFeedback>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<ProjectMember>().HasKey(x => new { x.ProjectId, x.UserId });
        b.Entity<Project>().HasIndex(x => new { x.TenantId, x.Key }).IsUnique();
        b.Entity<WorkItem>().HasIndex(x => new { x.TenantId, x.Key }).IsUnique();
        b.Entity<User>().HasIndex(x => x.Email).IsUnique();

        // Çoklu firma izolasyonu: hiçbir sorgu başka firmanın satırını göremez.
        b.Entity<User>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
        b.Entity<Project>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
        b.Entity<ProjectMember>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
        b.Entity<WorkItem>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
        b.Entity<Comment>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
        b.Entity<Ticket>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
        b.Entity<Article>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
        b.Entity<KbFeedback>().HasQueryFilter(e => e.TenantId == CurrentTenantId);
    }

    // Yeni kayıtlara TenantId'yi otomatik yazar; geliştirici unutsa bile.
    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        if (CurrentTenantId is Guid tid)
        {
            foreach (var e in ChangeTracker.Entries<ITenantEntity>())
                if (e.State == EntityState.Added && e.Entity.TenantId == Guid.Empty)
                    e.Entity.TenantId = tid;
        }
        return base.SaveChangesAsync(ct);
    }
}
