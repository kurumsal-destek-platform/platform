using Platform.Api;
using Platform.Domain;
using Xunit;

namespace Platform.UnitTests;

// SLA süreleri MESAİ saatine göre işler (09:00-18:00, Pzt-Cum, Türkiye UTC+3)
public class SlaTests
{
    private static readonly TenantSettings S = new();                       // varsayılan mesai
    private static DateTime Local(int y, int m, int d, int h, int min = 0) => new DateTime(y, m, d, h, min, 0, DateTimeKind.Utc).AddHours(-3);
    private static DateTime ToLocal(DateTime utc) => utc.AddHours(3);

    [Theory]
    // başlangıç (yerel)             saat   beklenen (yerel)
    [InlineData("2026-11-13 17:00", 2, "2026-11-16 10:00")]   // Cuma 17:00 + 2 sa → Pazartesi 10:00
    [InlineData("2026-11-14 11:00", 2, "2026-11-16 11:00")]   // Cumartesi → Pazartesi mesai başı
    [InlineData("2026-11-16 07:30", 0.5, "2026-11-16 09:30")] // mesai öncesi → 09:00'dan sayılır
    [InlineData("2026-11-16 10:00", 24, "2026-11-18 16:00")]  // 24 sa = 2 gün 6 saat mesai
    [InlineData("2026-11-16 18:00", 4, "2026-11-17 13:00")]   // mesai bitti → ertesi gün
    [InlineData("2026-11-16 12:00", 3, "2026-11-16 15:00")]   // aynı gün içinde
    public void AddBusinessHours_mesai_saatine_gore_hesaplar(string start, double hours, string expected)
    {
        var s = DateTime.Parse(start); var e = DateTime.Parse(expected);
        var due = Sla.AddBusinessHours(Local(s.Year, s.Month, s.Day, s.Hour, s.Minute), hours, S);
        Assert.Equal(e, ToLocal(due));
    }

    [Fact]
    public void State_bitmis_isi_hedefe_gore_degerlendirir()
    {
        var c = new DateTime(2026, 11, 16, 7, 0, 0, DateTimeKind.Utc);
        Assert.Equal("met", Sla.State(c, c.AddHours(4), c.AddHours(3), c.AddHours(10)));
        Assert.Equal("breached", Sla.State(c, c.AddHours(4), c.AddHours(5), c.AddHours(10)));
    }

    [Fact]
    public void State_acik_iste_kalan_sureye_bakar()
    {
        var c = new DateTime(2026, 11, 16, 7, 0, 0, DateTimeKind.Utc);
        Assert.Equal("running", Sla.State(c, c.AddHours(4), null, c.AddHours(1)));   // %75 kaldı
        Assert.Equal("at_risk", Sla.State(c, c.AddHours(4), null, c.AddHours(3.5))); // %12 kaldı
        Assert.Equal("breached", Sla.State(c, c.AddHours(4), null, c.AddHours(5)));
        Assert.Equal("none", Sla.State(c, null, null, c));
    }

    [Fact]
    public void ApplyTargets_oncelige_gore_hedef_koyar()
    {
        var policies = Sla.Defaults.Select(d => new SlaPolicy { Priority = d.Priority, ResponseHours = d.Response, ResolutionHours = d.Resolution }).ToList();
        var t = new Ticket { Priority = "Critical", CreatedAt = Local(2026, 11, 16, 10) };
        Sla.ApplyTargets(t, policies, S);
        Assert.Equal(new DateTime(2026, 11, 16, 10, 30, 0), ToLocal(t.ResponseDueAt!.Value));
        Assert.Equal(new DateTime(2026, 11, 16, 14, 0, 0), ToLocal(t.ResolutionDueAt!.Value));
    }
}
