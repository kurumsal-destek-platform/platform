using Platform.Api;
using Xunit;

namespace Platform.UnitTests;

public class ArticleRulesTests
{
    private const string Body = "1) Bilgisayarı yeniden başlatın. 2) Tekrar deneyin.";

    [Fact] public void GecerliMakaleKabulEdilir() => Assert.Null(ArticleRules.Validate("VPN bağlanmıyor", Body, "Ağ/VPN", new[] { "vpn" }));
    [Fact] public void KisaBaslikReddedilir() => Assert.NotNull(ArticleRules.Validate("VPN", Body, "Ağ/VPN", null));
    [Fact] public void KisaIcerikReddedilir() => Assert.NotNull(ArticleRules.Validate("VPN bağlanmıyor", "kısa", null, null));
    [Fact] public void FazlaEtiketReddedilir() =>
        Assert.NotNull(ArticleRules.Validate("VPN bağlanmıyor", Body, null, Enumerable.Range(0, 11).Select(i => "e" + i)));

    [Fact]
    public void EtiketlerTemizlenir()
    {
        var t = ArticleRules.NormalizeTags(new[] { " VPN ", "#Outlook", "vpn", "", "İZİN" });
        Assert.Equal("vpn,outlook,izin", string.Join(",", t));
    }

    [Fact] public void BosKategoriDigerOlur() => Assert.Equal("Diğer", ArticleRules.CleanCategory("  "));
}
