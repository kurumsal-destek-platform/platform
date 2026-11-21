using Platform.Api;
using Platform.Domain;
using Xunit;

namespace Platform.UnitTests;

// Otomasyon kuralları, e-posta konusu/alıntı ayıklama, SLA eskalasyonu ve haftalık özet zamanı
public class AutomationTests
{
    private static readonly Guid Ali = Guid.NewGuid();
    private static readonly Dictionary<Guid, string> Support = new() { [Ali] = "Ali Çelik" };

    private static Ticket T(string title, string cat = "Diğer", string pri = "Medium") =>
        new() { Title = title, Description = "", Category = cat, Priority = pri };

    [Fact]
    public void Anahtar_kelime_buyuk_kucuk_harf_duyarsiz_ve_turkce()
    {
        var r = new AutomationRule { Name = "VPN", WhenKeywords = "vpn, uzak bağlantı", SetAssigneeId = Ali };
        Assert.True(Automation.Matches(r, "VPN'e BAĞLANAMIYORUM", "", "Ağ", "High", null));
        Assert.True(Automation.Matches(r, "UZAK BAĞLANTI kopuyor", "", "Ağ", "High", null));
        Assert.False(Automation.Matches(r, "Yazıcı çalışmıyor", "", "Donanım", "Low", null));
    }

    [Fact]
    public void Kapali_kural_calismaz() =>
        Assert.False(Automation.Matches(new AutomationRule { Enabled = false }, "x", "", "Diğer", "Low", null));

    [Fact]
    public void Gonderen_alan_adi_kosulu()
    {
        var r = new AutomationRule { WhenSenderDomain = "@anka.com", NotifyManagers = true };
        Assert.True(Automation.Matches(r, "x", "", "Diğer", "Low", "ayse@anka.com"));
        Assert.False(Automation.Matches(r, "x", "", "Diğer", "Low", "ayse@mavi.com"));
        Assert.False(Automation.Matches(r, "x", "", "Diğer", "Low", null));
    }

    [Fact]
    public void Kural_atar_onceligi_degistirir_ve_durumu_gunceller()
    {
        var t = T("VPN çalışmıyor");
        var rules = new[] { new AutomationRule { Name = "VPN → Ali", WhenKeywords = "vpn", SetAssigneeId = Ali, SetPriority = "High" } };
        var changes = Automation.Apply(rules, t, null, Support);
        Assert.Single(changes);
        Assert.Equal(Ali, t.AssigneeId);
        Assert.Equal("High", t.Priority);
        Assert.Equal(TicketStatus.Assigned, t.Status);
    }

    [Fact]
    public void Gecersiz_kisiye_atama_yapilmaz()
    {
        var t = T("vpn");
        Automation.Apply(new[] { new AutomationRule { WhenKeywords = "vpn", SetAssigneeId = Guid.NewGuid() } }, t, null, Support);
        Assert.Null(t.AssigneeId);
        Assert.Equal(TicketStatus.Open, t.Status);
    }

    [Fact]
    public void Sira_ve_durdurma()
    {
        var t = T("vpn");
        var rules = new[]
        {
            new AutomationRule { Name = "ikinci", SortOrder = 2, SetPriority = "Low" },
            new AutomationRule { Name = "birinci", SortOrder = 1, SetPriority = "Critical", StopProcessing = true },
        };
        var changes = Automation.Apply(rules, t, null, Support);
        Assert.Single(changes);
        Assert.Equal("Critical", t.Priority);
    }

    [Fact]
    public void Kosullar_ilk_hale_bakar()
    {
        // 1. kural kategoriyi "Ağ" yapar; 2. kural "Ağ" kategorisini bekliyor ama ticket "Diğer" açıldı → çalışmaz
        var t = T("vpn");
        var rules = new[]
        {
            new AutomationRule { SortOrder = 1, WhenKeywords = "vpn", SetCategory = "Ağ" },
            new AutomationRule { SortOrder = 2, WhenCategory = "Ağ", SetPriority = "High" },
        };
        Assert.Single(Automation.Apply(rules, t, null, Support));
        Assert.Equal("Ağ", t.Category);
        Assert.Equal("Medium", t.Priority);
    }

    [Theory]
    [InlineData("Re: VPN çalışmıyor [#1a2b3c4d]", "VPN çalışmıyor", "1a2b3c4d")]
    [InlineData("YNT: Fwd: Yazıcı", "Yazıcı", null)]
    [InlineData("   ", "E-posta ile gelen talep", null)]
    public void Konu_temizleme_ve_etiket(string subject, string clean, string? tag)
    {
        Assert.Equal(clean, MailText.CleanSubject(subject));
        Assert.Equal(tag, MailText.TagOf(subject));
    }

    [Fact]
    public void Etiket_ticket_idsinden_uretilir()
    {
        var id = Guid.Parse("1a2b3c4d-0000-0000-0000-000000000000");
        Assert.Equal("[#1a2b3c4d]", MailText.Tag(id));
        Assert.Equal("1a2b3c4d", MailText.TagOf("Re: x " + MailText.Tag(id)));
    }

    [Fact]
    public void Alinti_kismi_atilir()
    {
        var text = "Hâlâ olmuyor, ekran görüntüsü ekte.\n\n19 Kas 2026 Per, 10:00 tarihinde Destek yazdı:\n> Merhaba";
        Assert.Equal("Hâlâ olmuyor, ekran görüntüsü ekte.", MailText.StripQuoted(text));
    }

    [Theory]
    [InlineData("Ayşe Demir <AYSE@anka.com>", "ayse@anka.com")]
    [InlineData("ali@anka.com", "ali@anka.com")]
    public void Adres_ayiklama(string from, string expected) => Assert.Equal(expected, MailText.Address(from));

    [Fact]
    public void Eskalasyon_sadece_yuksek_ve_yonetici_disi()
    {
        var mgr = Guid.NewGuid();
        Assert.True(Sla.ShouldEscalate("High", Guid.NewGuid(), new[] { mgr }));
        Assert.True(Sla.ShouldEscalate("Critical", null, new[] { mgr }));
        Assert.False(Sla.ShouldEscalate("High", mgr, new[] { mgr }));
        Assert.False(Sla.ShouldEscalate("Medium", null, new[] { mgr }));
    }

    [Fact]
    public void Haftalik_ozet_pazartesi_0900_turkiye()
    {
        // 23 Kasım 2026 Pazartesi. 09:00 TR = 06:00 UTC
        var before = new DateTime(2026, 11, 23, 5, 59, 0, DateTimeKind.Utc);
        var after = new DateTime(2026, 11, 23, 6, 1, 0, DateTimeKind.Utc);
        Assert.False(Digest.IsDue(before, 3, new DateTime(2026, 11, 16, 6, 5, 0, DateTimeKind.Utc)));
        Assert.True(Digest.IsDue(after, 3, new DateTime(2026, 11, 16, 6, 5, 0, DateTimeKind.Utc)));
        Assert.False(Digest.IsDue(after, 3, after));                        // bu hafta zaten gitti
        Assert.True(Digest.IsDue(new DateTime(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc), 3, null)); // hiç gitmediyse hafta içi gider
    }
}
