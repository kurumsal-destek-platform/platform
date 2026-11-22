using Platform.Api;
using Platform.Api.Controllers;
using Platform.Domain;
using Xunit;

namespace Platform.UnitTests;

// "Yanıt bekleniyor": SLA süresi durur, çıkınca geçen mesai süresi kadar hedef ileri kayar
public class WaitingTests
{
    private static readonly TenantSettings Tr = new();   // 09-18, Pzt-Cuma, UTC+3

    private static DateTime Local(int day, int hour, int min = 0) =>
        new DateTime(2026, 11, day, hour, min, 0, DateTimeKind.Utc).AddHours(-3);   // 2026-11-23 Pazartesi

    [Fact]
    public void Ayni_gun_mesai_saati() =>
        Assert.Equal(3.0, Sla.BusinessHoursBetween(Local(23, 10), Local(23, 13), Tr), 3);

    [Fact]
    public void Gece_ve_hafta_sonu_sayilmaz()
    {
        Assert.Equal(2.0, Sla.BusinessHoursBetween(Local(23, 17), Local(24, 10), Tr), 3);      // Pzt 17 → Sal 10
        Assert.Equal(2.0, Sla.BusinessHoursBetween(Local(27, 17), Local(30, 10), Tr), 3);      // Cuma 17 → Pzt 10
    }

    [Fact]
    public void Beklemeden_cikinca_hedef_kayar()
    {
        var t = new Ticket { Status = TicketStatus.Waiting, ResolutionDueAt = Local(23, 15), FirstResponseAt = Local(23, 9) };
        Sla.EnterWaiting(t, Local(23, 10));
        Sla.LeaveWaiting(t, Local(23, 12), Tr);              // 2 saat beklendi
        Assert.Equal(Local(23, 17), t.ResolutionDueAt);
        Assert.Null(t.WaitingSince);
    }

    [Fact]
    public void Beklerken_sla_durumu_duraklatildi()
    {
        var t = new Ticket { Status = TicketStatus.Waiting, CreatedAt = Local(23, 9), ResolutionDueAt = Local(23, 10) };
        Assert.Equal("ok", Sla.Summary(t, Local(23, 16)));   // süresi geçmiş görünse de aşılmış sayılmaz
    }

    [Fact]
    public void Hazir_yanit_yer_tutuculari()
    {
        var body = CannedResponsesController.Render("Merhaba {ad}, \"{ticket}\" için {benim_adim}", "Ayşe Demir", "VPN çalışmıyor", "Ali Çelik");
        Assert.Equal("Merhaba Ayşe, \"VPN çalışmıyor\" için Ali Çelik", body);
    }
}
