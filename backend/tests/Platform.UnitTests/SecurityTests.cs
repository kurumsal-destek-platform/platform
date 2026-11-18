using Platform.Api;
using Xunit;

namespace Platform.UnitTests;

// Denetim kaydı: her işlem anlaşılır bir Türkçe cümleyle kaydedilmeli
public class AuditTests
{
    [Theory]
    [InlineData("POST", "/api/tickets", "Ticket oluşturdu")]
    [InlineData("PUT", "/api/users/5b1c/role", "Kullanıcı rolünü değiştirdi")]
    [InlineData("POST", "/api/incidents/aa/resolve", "Büyük olayı çözdü")]
    [InlineData("PUT", "/api/settings", "SLA ve firma ayarlarını değiştirdi")]
    [InlineData("POST", "/api/kb/import", "Doküman içe aktardı")]
    [InlineData("POST", "/api/auth/login", "Giriş")]
    public void Islem_anlasilir_yazilir(string method, string path, string expected) =>
        Assert.Equal(expected, AuditFilter.Describe(method, path));

    [Fact]
    public void Bilinmeyen_islem_yontem_ve_adresle_yazilir() =>
        Assert.Equal("PATCH /api/bilinmeyen", AuditFilter.Describe("PATCH", "/api/bilinmeyen"));
}
