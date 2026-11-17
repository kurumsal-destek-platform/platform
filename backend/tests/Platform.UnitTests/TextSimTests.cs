using Platform.Api;
using Xunit;

namespace Platform.UnitTests;

// Benzerlik motoru: olay birleştirme, akıllı atama ve bilgi boşluğu radarı buna dayanır
public class TextSimTests
{
    [Fact]
    public void Ayni_sorunun_farkli_ifadeleri_benzer_cikar()
    {
        var a = TextSim.Sim("VPN'e bağlanamıyorum", "Sunucuya ulaşılamıyor hatası", "Evden VPN bağlanmıyor", "dosya sunucusuna erişemiyorum");
        Assert.True(a >= 0.4, $"benzerlik {a:0.00}");
    }

    [Fact]
    public void Alakasiz_sorunlar_benzer_cikmaz()
    {
        var a = TextSim.Sim("VPN'e bağlanamıyorum", null, "Yazıcı kağıt sıkıştırıyor", null);
        Assert.True(a < 0.15, $"benzerlik {a:0.00}");
    }

    [Fact]
    public void Turkce_ekler_ayni_koke_iner()
    {
        Assert.Equal(TextSim.Stem("bağlanmıyor"), TextSim.Stem("bağlantı"));
        Assert.Equal(TextSim.Stem("yazıcıdan"), TextSim.Stem("yazıcı"));
    }

    [Fact]
    public void Cluster_ticket_selini_tek_grupta_toplar()
    {
        var items = new[] { "VPN'e bağlanamıyorum", "VPN bağlantısı sürekli kopuyor", "Evden VPN bağlanmıyor", "VPN bağlanmıyor acil", "Yeni çalışana hesap açılması" };
        var groups = TextSim.Cluster(items, t => TextSim.Vec(t), 0.40);
        Assert.Contains(groups, g => g.Count == 4);
        Assert.Contains(groups, g => g.Count == 1 && g[0].StartsWith("Yeni"));
    }

    [Fact]
    public void Coverage_kisa_metnin_uzun_dokumanda_gecme_oranini_olcer()
    {
        var q = TextSim.Vec("mouse talebi");
        var doc = TextSim.Vec("Yeni ekipman talebi", "Mouse, klavye, kulaklık gibi küçük ekipmanlar için ticket açın.");
        Assert.Equal(1.0, TextSim.Coverage(q, doc), 3);
        Assert.Equal(0.0, TextSim.Coverage(TextSim.Vec("masraf formu"), doc), 3);
    }
}
