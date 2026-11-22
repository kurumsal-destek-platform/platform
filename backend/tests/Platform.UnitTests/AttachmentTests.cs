using Platform.Api.Controllers;
using Xunit;

namespace Platform.UnitTests;

// Ek yükleme kuralları: boyut ve dosya türü
public class AttachmentTests
{
    [Theory]
    [InlineData("Ekran görüntüsü.png", 200_000)]
    [InlineData("hata.LOG", 1_000)]
    [InlineData("rapor.pdf", 100 * 1024 * 1024)]
    [InlineData("ekran-kaydi.mp4", 60 * 1024 * 1024)]
    public void Izin_verilen_dosyalar(string name, long size) => Assert.Null(AttachmentsController.Validate(name, size));

    [Theory]
    [InlineData("virus.exe", 1_000, "türü")]
    [InlineData("betik.ps1", 1_000, "türü")]
    [InlineData("buyuk.zip", 100 * 1024 * 1024 + 1, "100 MB")]
    [InlineData("bos.png", 0, "boş")]
    public void Reddedilen_dosyalar(string name, long size, string why) =>
        Assert.Contains(why, AttachmentsController.Validate(name, size));
}
