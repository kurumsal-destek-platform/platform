using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api;

// Demo verisi: SeedData.cs içindeki JSON'dan (iki şirket, ~240 ticket, ~30 makale, projeler, sprintler).
// Veritabanı boşsa bir kez çalışır. Zamanlar "şu andan önce" olarak tutulur, veri hep güncel görünür.
// Tüm şifreler: Demo123!
public static class Seeder
{
    public const string DemoPassword = "Demo123!";

    // Kimlik doğrulama alanları eklenmeden önce oluşturulan kullanıcılar: aktif ve onaylı yap.
    public static void UpgradeLegacyUsers(AppDbContext db)
    {
        var legacy = db.Users.IgnoreQueryFilters().Where(u => u.SecurityStamp == "").ToList();
        foreach (var u in legacy)
        {
            u.IsActive = true;
            u.EmailConfirmed = true;
            u.SecurityStamp = Guid.NewGuid().ToString("N");
            u.CreatedAt = DateTime.UtcNow;
        }
        if (legacy.Count > 0) db.SaveChanges();
    }

    public static void Seed(AppDbContext db)
    {
        if (db.Tenants.Any()) return;
        var root = JsonNode.Parse(SeedData.Json)!;
        var hasher = new PasswordHasher<User>();
        var now = DateTime.UtcNow;
        var password = (string?)root["password"] ?? DemoPassword;

        foreach (var t in root["tenants"]!.AsArray())
        {
            var tenant = new Tenant { Name = S(t, "name") };
            db.Tenants.Add(tenant);
            var tid = tenant.Id;
            var rnd = new Random(7);   // aynı veri her kurulumda aynı çıksın
            double U(double a, double b) => a + rnd.NextDouble() * (b - a);

            // ---- SLA hedefleri ve firma ayarları ----
            var settings = new TenantSettings { TenantId = tid };
            db.TenantSettings.Add(settings);
            var policies = Sla.Defaults.Select(d => new SlaPolicy { TenantId = tid, Priority = d.Priority, ResponseHours = d.Response, ResolutionHours = d.Resolution }).ToList();
            db.SlaPolicies.AddRange(policies);

            // ---- Kişiler ----
            var users = new Dictionary<string, User>();
            foreach (var u in t["users"]!.AsArray())
            {
                var user = new User
                {
                    TenantId = tid, Email = S(u, "email"), FullName = S(u, "name"), Role = S(u, "role"),
                    EmailConfirmed = true, CreatedAt = now.AddDays(-120), LastLoginAt = now.AddHours(-Random.Shared.Next(1, 72)),
                };
                user.PasswordHash = hasher.HashPassword(user, password);
                users[user.Email] = user;
                db.Users.Add(user);
            }
            Guid UserId(string? email) => email is not null && users.TryGetValue(email, out var x) ? x.Id : Guid.Empty;
            Guid? OptUser(JsonNode? n, string key) => (string?)n?[key] is string e && users.ContainsKey(e) ? users[e].Id : null;
            var manager = users.Values.FirstOrDefault(u => u.Role == Roles.Manager) ?? users.Values.First();

            // ---- Bilgi bankası ----
            var articles = new List<Article>();
            foreach (var a in t["articles"]!.AsArray())
            {
                var art = new Article { TenantId = tid, Title = S(a, "title"), Category = S(a, "category"), Body = S(a, "body"), CreatedAt = now.AddDays(-100) };
                articles.Add(art);
                db.Articles.Add(art);
            }

            // ---- Ticket'lar ----
            string[] good = { "Çok hızlı çözüldü, teşekkürler!", "Adım adım anlattığı için sağ olsun.", "Harika, hemen döndüler.", "Sorunsuz, teşekkürler.", "İlgili ve nazikti." };
            string[] bad = { "Çok uzun sürdü, toplantıyı kaçırdım.", "İki kez aynı şeyi anlatmak zorunda kaldım.", "Çözüldü ama kimse haber vermedi.", "Daha hızlı olabilirdi." };
            foreach (var x in t["tickets"]!.AsArray())
            {
                var created = now.AddHours(-(double)x!["hoursAgo"]!);
                var after = (double?)x["resolvedAfterHours"];
                var tk = new Ticket
                {
                    TenantId = tid, Title = S(x, "title"), Description = S(x, "description"), Category = S(x, "category"),
                    Priority = S(x, "priority"), Status = S(x, "status"), ReporterId = UserId((string?)x["reporter"]),
                    AssigneeId = OptUser(x, "assignee"), ResolutionNote = (string?)x["resolution"],
                    CreatedAt = created, ResolvedAt = after is double h ? created.AddHours(h) : null,
                };
                Sla.ApplyTargets(tk, policies, settings);

                // İlk yanıt: çoğu hedefin içinde, ~%12'si geç
                if (tk.Status != TicketStatus.Open && tk.ResponseDueAt is DateTime rd)
                {
                    var window = Math.Max(0.05, (rd - created).TotalHours);
                    var at = created.AddHours(window * (rnd.NextDouble() < 0.88 ? U(0.15, 0.9) : U(1.1, 2.2)));
                    tk.FirstResponseAt = tk.ResolvedAt is DateTime r0 && at > r0 ? r0 : (at > now ? now : at);
                }

                // Memnuniyet: çözülenlerin ~%78'i puanlanır; SLA aşılanlar daha düşük puan alır
                if (tk.ResolvedAt is DateTime ra && rnd.NextDouble() < 0.78)
                {
                    var met = tk.ResolutionDueAt is null || ra <= tk.ResolutionDueAt;
                    var roll = rnd.NextDouble();
                    tk.CsatRating = met
                        ? (roll < 0.58 ? 5 : roll < 0.88 ? 4 : roll < 0.96 ? 3 : roll < 0.99 ? 2 : 1)
                        : (roll < 0.12 ? 5 : roll < 0.35 ? 4 : roll < 0.65 ? 3 : roll < 0.9 ? 2 : 1);
                    if (rnd.NextDouble() < 0.35) tk.CsatComment = tk.CsatRating >= 4 ? good[rnd.Next(good.Length)] : bad[rnd.Next(bad.Length)];
                    var cAt = ra.AddHours(U(0.1, 20));
                    tk.CsatAt = cAt > now ? now : cAt;
                }

                // Kurulum anında zaten riskli/aşılmış olanlar için bildirim yağmuru olmasın
                var st = Sla.State(created, tk.ResolutionDueAt, tk.ResolvedAt, now);
                if (st is "breached" or "at_risk" || tk.ResolvedAt != null) { tk.SlaWarned = true; tk.SlaBreachNotified = st == "breached" || tk.ResolvedAt != null; }
                db.Tickets.Add(tk);

                // İşlemdeki ticket'larda kısa, gerçekçi bir yazışma
                if (tk.Status == TicketStatus.InProgress && tk.AssigneeId is Guid ag && tk.IncidentId is null)
                {
                    var t0 = tk.FirstResponseAt ?? created.AddMinutes(30);
                    db.TicketMessages.Add(new TicketMessage { TenantId = tid, TicketId = tk.Id, AuthorId = ag, CreatedAt = t0,
                        Body = $"Merhaba, talebinizi aldım ve inceliyorum. Bu arada bilgisayarınızı yeniden başlatıp tekrar dener misiniz?" });
                    db.TicketMessages.Add(new TicketMessage { TenantId = tid, TicketId = tk.Id, AuthorId = tk.ReporterId, CreatedAt = t0.AddMinutes(25),
                        Body = "Yeniden başlattım ama sorun devam ediyor. Ekran görüntüsünü ekleyebilirim." });
                    db.TicketMessages.Add(new TicketMessage { TenantId = tid, TicketId = tk.Id, AuthorId = ag, CreatedAt = t0.AddMinutes(40), Internal = true,
                        Body = "Not: aynı katta benzer bir şikâyet daha var, cihaz kaynaklı olmayabilir." });
                }
            }

            // ---- Self-servis: ticket açılmadan çözülen sorunlar (tasarruf paneli) ----
            // Son 60 günde artan bir eğilim: sihirbaz/makale/asistan ile "çözüldü" kayıtları
            if (articles.Count > 5 && t["tickets"]!.AsArray().Count > 50)
            {
                var people = users.Values.Where(u => u.Role == Roles.Employee).ToList();
                var popular = articles.Take(14).ToList();
                for (var d = 60; d >= 0; d--)
                {
                    var perDay = (int)Math.Round(1 + (60 - d) / 60.0 * 3.2 + U(-0.8, 0.8));
                    for (var i = 0; i < perDay; i++)
                    {
                        var r = rnd.NextDouble();
                        var src = r < 0.45 ? "wizard" : r < 0.75 ? "article" : "assistant";
                        var pool = rnd.NextDouble() < 0.7 ? popular : articles;
                        db.KbFeedbacks.Add(new KbFeedback
                        {
                            TenantId = tid, UserId = people[rnd.Next(people.Count)].Id,
                            ArticleId = pool[rnd.Next(pool.Count)].Id,
                            Solved = true, Source = src, StepsTried = src == "wizard" ? rnd.Next(1, 5) : null,
                            CreatedAt = now.AddDays(-d).AddHours(-U(0, 9)),
                        });
                    }
                    if (rnd.NextDouble() < 0.4)   // sihirbaz denendi ama çözmedi → ticket'a dönüştü
                        db.KbFeedbacks.Add(new KbFeedback
                        {
                            TenantId = tid, UserId = people[rnd.Next(people.Count)].Id, ArticleId = popular[rnd.Next(popular.Count)].Id,
                            Solved = false, Source = "wizard", StepsTried = rnd.Next(3, 7), CreatedAt = now.AddDays(-d).AddHours(-U(0, 9)),
                        });
                }
            }

            // ---- Asistana sorulan sorular (bilgi boşluğu radarı) ----
            foreach (var q in t["questions"]!.AsArray())
                db.AssistantQueries.Add(new AssistantQuery
                {
                    TenantId = tid, UserId = UserId((string?)q!["user"]), Question = S(q, "question"),
                    Answered = (bool)q["answered"]!, CreatedAt = now.AddDays(-(double)q["daysAgo"]!),
                });

            // ---- Projeler, sprintler, işler ----
            var projects = new Dictionary<string, Project>();
            foreach (var p in t["projects"]!.AsArray())
            {
                var project = new Project { TenantId = tid, Key = S(p, "key"), Name = S(p, "name"), Description = S(p, "description") };
                projects[project.Key] = project;
                db.Projects.Add(project);
                var mgrEmail = S(p, "manager");
                foreach (var m in p!["members"]!.AsArray())
                    db.ProjectMembers.Add(new ProjectMember
                    {
                        TenantId = tid, ProjectId = project.Id, UserId = UserId((string?)m),
                        Role = (string?)m == mgrEmail ? ProjectRoles.Manager : ProjectRoles.Member,
                    });

                var sprints = new List<Sprint>();
                foreach (var s in p["sprints"]!.AsArray())
                {
                    var sp = new Sprint
                    {
                        TenantId = tid, ProjectId = project.Id, Name = S(s, "name"), Goal = S(s, "goal"), Status = S(s, "status"),
                        StartDate = (double?)s!["startDays"] is double sd ? now.AddDays(sd) : null,
                        EndDate = (double?)s["endDays"] is double ed ? now.AddDays(ed) : null,
                        CreatedAt = now.AddDays(-45),
                    };
                    sprints.Add(sp);
                    db.Sprints.Add(sp);
                }

                var items = new Dictionary<string, WorkItem>();
                var n = 0;
                foreach (var it in p["items"]!.AsArray())
                {
                    n++;
                    var key = $"{project.Key}-{n}";
                    var doneAgo = (double?)it!["doneDaysAgo"];
                    var w = new WorkItem
                    {
                        TenantId = tid, ProjectId = project.Id, Key = key, Type = S(it, "type"), Title = S(it, "title"),
                        Description = S(it, "description"), Status = S(it, "status"), Priority = S(it, "priority"),
                        AssigneeId = OptUser(it, "assignee"), ReporterId = UserId(mgrEmail),
                        StoryPoints = (int?)it["points"] is int pts && pts > 0 ? pts : null,
                        SprintId = (int?)it["sprint"] is int si ? sprints[si].Id : null,
                        ParentId = (string?)it["parent"] is string pk && items.TryGetValue(pk, out var parent) ? parent.Id : null,
                        Labels = it["labels"]!.AsArray().Select(l => (string)l!).ToArray(),
                        StartDate = (double?)it["startDays"] is double st ? now.AddDays(st) : null,
                        DueDate = (double?)it["dueDays"] is double du ? now.AddDays(du) : null,
                        Rank = n,
                        CreatedAt = now.AddDays(-42),
                        UpdatedAt = doneAgo is double d0 ? now.AddDays(-d0) : now.AddDays(-Random.Shared.Next(1, 5)),
                    };
                    items[key] = w;
                    db.WorkItems.Add(w);
                    db.ActivityLogs.Add(new ActivityLog { TenantId = tid, ProjectId = project.Id, WorkItemId = w.Id, UserId = manager.Id, Action = "created", At = w.CreatedAt });
                    if (doneAgo is double d)
                        db.ActivityLogs.Add(new ActivityLog
                        {
                            TenantId = tid, ProjectId = project.Id, WorkItemId = w.Id, UserId = w.AssigneeId ?? manager.Id,
                            Action = "status", Field = "Durum", OldValue = WorkItemStatus.InProgress, NewValue = WorkItemStatus.Done, At = now.AddDays(-d),
                        });
                }
                project.NextItemNumber = n + 1;

                foreach (var l in p["links"]!.AsArray())
                {
                    var arr = l!.AsArray();
                    if (items.TryGetValue((string)arr[0]!, out var src) && items.TryGetValue((string)arr[1]!, out var dst))
                        db.WorkItemLinks.Add(new WorkItemLink { TenantId = tid, SourceId = src.Id, TargetId = dst.Id, Type = (string)arr[2]!, CreatedBy = manager.Id });
                }
                foreach (var c in p["comments"]!.AsArray())
                {
                    var arr = c!.AsArray();
                    if (items.TryGetValue((string)arr[0]!, out var w))
                        db.Comments.Add(new Comment { TenantId = tid, WorkItemId = w.Id, AuthorId = UserId((string?)arr[1]), Body = (string)arr[2]!, CreatedAt = now.AddDays(-2) });
                }
            }

            foreach (var f in t["filters"]!.AsArray())
            {
                if (!projects.TryGetValue(S(f, "project"), out var proj)) continue;
                db.SavedFilters.Add(new SavedFilter { TenantId = tid, ProjectId = proj.Id, OwnerId = UserId((string?)f!["owner"]), Name = S(f, "name"), Query = S(f, "query"), Shared = (bool)f["shared"]! });
            }

            // ---- Yönetici için başlangıç bildirimleri ----
            if (tenant.Name == "Anka Lojistik")
            {
                db.Notifications.Add(new Notification { TenantId = tid, UserId = manager.Id, Title = "⚠ Olası büyük olay", Body = "Son 2 saatte 6 benzer VPN ticket'ı açıldı. Tek olayda birleştirmek ister misiniz?", Link = "/incidents", CreatedAt = now.AddMinutes(-10) });
                db.Notifications.Add(new Notification { TenantId = tid, UserId = manager.Id, Title = "Sprint riski: ANK Sprint 3", Body = "Tahmine göre sprint işlerinin yarısı yetişmeyecek. Detaylar panoda.", Link = "/projects/ANK?tab=board", CreatedAt = now.AddHours(-3) });
            }
        }
        db.SaveChanges();
    }

    private static string S(JsonNode? n, string key) => (string?)n?[key] ?? "";
}
