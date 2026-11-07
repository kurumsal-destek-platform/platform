using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Platform.Application;

namespace Platform.Infrastructure;

// Sadece "dotnet ef migrations" komutlarý için. Uygulama çalýþýrken kullanýlmaz.
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
                 ?? "Host=localhost;Port=5432;Database=platform;Username=platform;Password=platform";
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(cs).Options;
        return new AppDbContext(options, new NoTenant());
    }

    private sealed class NoTenant : ITenantProvider
    {
        public Guid? TenantId => null;
        public Guid? UserId => null;
    }
}