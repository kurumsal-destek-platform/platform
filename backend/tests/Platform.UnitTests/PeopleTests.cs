using Platform.Api;
using Xunit;

namespace Platform.UnitTests;

public class PeopleTests
{
    [Fact] public void AdBasiylaBulur() => Assert.True(People.Matches("Ayşe Demir", "Muhasebe", "ayse@anka.com", "ay"));
    [Fact] public void AdSoyadParcasiylaBulur() => Assert.True(People.Matches("Ayşe Demir", null, null, "ay de"));
    [Fact] public void DepartmanlaBulur() => Assert.True(People.Matches("Gizem Aksoy", "Muhasebe", null, "muh"));
    [Fact] public void TurkceBuyukHarf() => Assert.True(People.Matches("İsmail Öztürk", null, null, "isMAİL"));
    [Fact] public void AlakasizEslesmez() => Assert.False(People.Matches("Ayşe Demir", "Muhasebe", "ayse@anka.com", "mehmet"));

    [Fact]
    public void SadeceMetindeGecenAnmalarSayilir()
    {
        var a = Guid.NewGuid(); var b = Guid.NewGuid();
        var ids = People.MentionedIn("Merhaba @Ali Çelik bakabilir misin?", new[] { (a, "Ali Çelik"), (b, "Mehmet Yıldız") });
        Assert.Single(ids);
        Assert.Equal(a, ids[0]);
    }

    [Fact]
    public void UzmanlikTemizlenir()
    {
        var x = People.NormalizeExpertise(new[] { " vip ", "Donanım", "donanım", "" });
        Assert.Equal("VIP,Donanım", string.Join(",", x));
    }
}
