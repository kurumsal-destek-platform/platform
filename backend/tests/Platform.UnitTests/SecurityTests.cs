using Platform.Api;
using Xunit;

namespace Platform.UnitTests;

public class SecurityTests
{
    [Theory]
    [InlineData("kisa1A")]          // 8'den kısa
    [InlineData("hepsikucuk1")]     // büyük harf yok
    [InlineData("HEPSIBUYUK1")]     // küçük harf yok
    [InlineData("RakamYokSifre")]   // rakam yok
    [InlineData("")]
    public void Zayif_sifreler_reddedilir(string pwd) => Assert.NotNull(PasswordPolicy.Validate(pwd));

    [Theory]
    [InlineData("Demo123!")]
    [InlineData("Güçlü2026Şifre")]
    public void Kurallara_uyan_sifre_kabul_edilir(string pwd) => Assert.Null(PasswordPolicy.Validate(pwd));

    [Fact]
    public void Token_veritabaninda_ozetlenmis_saklanir()
    {
        var h = AuthTokens.Hash("ornek-token");
        Assert.Equal(64, h.Length);                          // SHA-256 hex
        Assert.Equal(h, AuthTokens.Hash("ornek-token"));     // aynı token → aynı özet
        Assert.NotEqual(h, AuthTokens.Hash("ornek-token2"));
        Assert.DoesNotContain("ornek", h);
    }

    [Theory]
    [InlineData("POST", "/api/tickets", "Ticket oluşturdu")]
    [InlineData("PUT", "/api/users/5b1c/role", "Kullanıcı rolünü değiştirdi")]
    [InlineData("POST", "/api/incidents/aa/resolve", "Büyük olayı çözdü")]
    [InlineData("PUT", "/api/settings", "SLA ve firma ayarlarını değiştirdi")]
    public void Denetim_kaydi_islemi_anlasilir_yazar(string method, string path, string expected) =>
        Assert.Equal(expected, AuditFilter.Describe(method, path));
}
