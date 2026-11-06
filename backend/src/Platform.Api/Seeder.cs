using Microsoft.AspNetCore.Identity;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// Demo verisi. Veritabanı boşsa bir kez çalışır. Tüm şifreler: Demo123!
public static class Seeder
{
    public const string DemoPassword = "Demo123!";

    public static void Seed(AppDbContext db)
    {
        if (db.Tenants.Any()) return;
        var hasher = new PasswordHasher<User>();

        User NewUser(Guid tenant, string email, string name, string role)
        {
            var u = new User { TenantId = tenant, Email = email, FullName = name, Role = role };
            u.PasswordHash = hasher.HashPassword(u, DemoPassword);
            return u;
        }

        // ---- Firma 1: Anka Lojistik ----
        var anka = new Tenant { Name = "Anka Lojistik" };
        var ankaMgr = NewUser(anka.Id, "yonetici@anka.com", "Zeynep Kaya", Roles.Manager);
        var ayse = NewUser(anka.Id, "ayse@anka.com", "Ayşe Demir", Roles.Employee);
        var mehmet = NewUser(anka.Id, "mehmet@anka.com", "Mehmet Yıldız", Roles.Employee);
        var ali = NewUser(anka.Id, "ali@anka.com", "Ali Çelik", Roles.Employee);

        var vpn = new Project { TenantId = anka.Id, Key = "ANK", Name = "VPN Geçişi", Description = "Şirket VPN altyapısının yeni sağlayıcıya taşınması", NextItemNumber = 6 };
        var epic = new WorkItem { TenantId = anka.Id, ProjectId = vpn.Id, Key = "ANK-1", Type = "Epic", Title = "VPN geçişi", ReporterId = ankaMgr.Id, AssigneeId = ankaMgr.Id, Status = WorkItemStatus.InProgress, Priority = "High" };
        var items = new List<WorkItem>
        {
            epic,
            new() { TenantId = anka.Id, ProjectId = vpn.Id, Key = "ANK-2", Type = "Story", ParentId = epic.Id, Title = "Kullanıcılar yeni VPN istemcisini kurabilmeli", ReporterId = ankaMgr.Id, AssigneeId = mehmet.Id, Status = WorkItemStatus.Todo, DueDate = DateTime.UtcNow.AddDays(7) },
            new() { TenantId = anka.Id, ProjectId = vpn.Id, Key = "ANK-3", Type = "Task", ParentId = epic.Id, Title = "Yeni VPN sunucusunu yapılandır", Description = "Sertifikalar ve kullanıcı grupları tanımlanacak.", ReporterId = ankaMgr.Id, AssigneeId = ayse.Id, Status = WorkItemStatus.Todo, Priority = "High", DueDate = DateTime.UtcNow.AddDays(3) },
            new() { TenantId = anka.Id, ProjectId = vpn.Id, Key = "ANK-4", Type = "Task", ParentId = epic.Id, Title = "Kurulum dokümanını bilgi bankasına ekle", ReporterId = ankaMgr.Id, AssigneeId = ali.Id, Status = WorkItemStatus.InReview },
            new() { TenantId = anka.Id, ProjectId = vpn.Id, Key = "ANK-5", Type = "Bug", Title = "Eski istemci Windows 11'de bağlantıyı düşürüyor", ReporterId = mehmet.Id, Status = WorkItemStatus.Todo, Priority = "Critical" },
        };

        // ---- Firma 2: Mavi Yazılım ----
        var mavi = new Tenant { Name = "Mavi Yazılım" };
        var maviMgr = NewUser(mavi.Id, "yonetici@mavi.com", "Can Arslan", Roles.Manager);
        var elif = NewUser(mavi.Id, "deniz@mavi.com", "Deniz Şahin", Roles.Employee);
        var web = new Project { TenantId = mavi.Id, Key = "MAV", Name = "Web Sitesi Yenileme", Description = "Kurumsal web sitesinin yenilenmesi", NextItemNumber = 3 };
        items.Add(new() { TenantId = mavi.Id, ProjectId = web.Id, Key = "MAV-1", Type = "Epic", Title = "Yeni tasarım", ReporterId = maviMgr.Id, AssigneeId = maviMgr.Id });
        items.Add(new() { TenantId = mavi.Id, ProjectId = web.Id, Key = "MAV-2", Type = "Task", Title = "Ana sayfa taslağı", ReporterId = maviMgr.Id, AssigneeId = elif.Id, Status = WorkItemStatus.InProgress });

        db.Tenants.AddRange(anka, mavi);
        db.Users.AddRange(ankaMgr, ayse, mehmet, ali, maviMgr, elif);
        db.Projects.AddRange(vpn, web);
        db.ProjectMembers.AddRange(
            new ProjectMember { TenantId = anka.Id, ProjectId = vpn.Id, UserId = ankaMgr.Id, Role = ProjectRoles.Manager },
            new ProjectMember { TenantId = anka.Id, ProjectId = vpn.Id, UserId = ayse.Id },
            new ProjectMember { TenantId = anka.Id, ProjectId = vpn.Id, UserId = mehmet.Id },
            new ProjectMember { TenantId = anka.Id, ProjectId = vpn.Id, UserId = ali.Id },
            new ProjectMember { TenantId = mavi.Id, ProjectId = web.Id, UserId = maviMgr.Id, Role = ProjectRoles.Manager },
            new ProjectMember { TenantId = mavi.Id, ProjectId = web.Id, UserId = elif.Id });
        db.WorkItems.AddRange(items);
        db.Comments.Add(new Comment { TenantId = anka.Id, WorkItemId = items[2].Id, AuthorId = mehmet.Id, Body = "Sertifikaları ben hazırlayabilirim, haber ver." });

        db.Articles.AddRange(
            new Article { TenantId = anka.Id, Category = "Ağ/VPN", Title = "VPN bağlanmıyor", Body = "1) İnternet bağlantınızı kontrol edin. 2) VPN istemcisini kapatıp yeniden açın. 3) Kullanıcı adınızı 'anka\\kullaniciadi' biçiminde girin. 4) Hâlâ bağlanmıyorsa bilgisayarı yeniden başlatın ve 'Ağ/VPN' kategorisinde ticket açın." },
            new Article { TenantId = anka.Id, Category = "Erişim/Hesap", Title = "Şifremi unuttum, nasıl sıfırlarım?", Body = "portal.anka.local adresine gidin, 'Şifremi unuttum' bağlantısına tıklayın. Telefonunuza gelen kodu girerek yeni şifre belirleyin. Şifre en az 12 karakter olmalıdır." },
            new Article { TenantId = anka.Id, Category = "Donanım", Title = "Yazıcı çıktı vermiyor", Body = "Yazıcının açık ve kağıdın takılı olduğunu kontrol edin. Bilgisayarda Ayarlar > Yazıcılar bölümünden 'Kat2-Yazıcı'yı varsayılan yapın. Kuyruktaki işleri temizleyip tekrar deneyin." },
            new Article { TenantId = anka.Id, Category = "E-posta", Title = "Outlook e-postaları senkronize etmiyor", Body = "Outlook'u kapatın, Denetim Masası > Posta > Profiller bölümünden profili onarın. Posta kutusu doluysa eski e-postaları arşivleyin." },
            new Article { TenantId = anka.Id, Category = "Yazılım/Lisans", Title = "Office lisans hatası", Body = "Office uygulamasında Dosya > Hesap bölümünden çıkış yapıp şirket hesabınızla tekrar giriş yapın. Lisans atanmadıysa yöneticinizden talep edin." },
            new Article { TenantId = mavi.Id, Category = "Ağ/VPN", Title = "Ofis Wi-Fi şifresi", Body = "Mavi Yazılım ofis Wi-Fi ağı 'Mavi-Ofis'tir. Şifre her ay İK duyurusunda paylaşılır." },
            new Article { TenantId = mavi.Id, Category = "Donanım", Title = "Monitör algılanmıyor", Body = "HDMI kablosunu çıkarıp takın, Windows+P ile 'Genişlet' seçin." });

        db.Tickets.AddRange(
            new Ticket { TenantId = anka.Id, Title = "E-posta eki açılmıyor", Description = "PDF ekleri Outlook'ta açılmıyor.", Category = "E-posta", ReporterId = mehmet.Id, AssigneeId = ali.Id, Status = TicketStatus.Assigned },
            new Ticket { TenantId = anka.Id, Title = "Yeni çalışana hesap açılması", Description = "Pazartesi başlayacak çalışan için hesap gerekli.", Category = "Erişim/Hesap", Priority = "High", ReporterId = ayse.Id, Status = TicketStatus.Open },
            new Ticket { TenantId = mavi.Id, Title = "Laptop çok ısınıyor", Category = "Donanım", ReporterId = elif.Id, Status = TicketStatus.Open });

        db.SaveChanges();
    }
}
