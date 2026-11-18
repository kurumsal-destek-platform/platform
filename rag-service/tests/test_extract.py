import io

import pytest

import extract


def _docx() -> bytes:
    docx = pytest.importorskip("docx")
    d = docx.Document()
    d.add_heading("IT El Kitabı", 0)
    d.add_paragraph(
        "Bu el kitabı çalışanların sık karşılaştığı sorunlar için hazırlanmıştır."
    )
    d.add_heading("Toplantı odası rezervasyonu", 1)
    d.add_paragraph("Outlook'ta Yeni Toplantı'ya tıklayın.", style="List Number")
    d.add_paragraph("Oda Bul ile Kat3-Toplantı odasını seçin.", style="List Number")
    d.add_heading("Masraf formu", 1)
    d.add_paragraph(
        "Masraf formları ERP'deki Masraf modülünden doldurulur ve yöneticiye onaya gönderilir."
    )
    b = io.BytesIO()
    d.save(b)
    return b.getvalue()


def test_word_baslik_stillerine_gore_bolunur():
    r = extract.extract("IT_El_Kitabi.docx", _docx())
    titles = [s["title"] for s in r["sections"]]
    assert titles == ["IT El Kitabı", "Toplantı odası rezervasyonu", "Masraf formu"]
    assert "Kat3-Toplantı" in r["sections"][1]["body"]


def test_markdown_ve_tek_kelimelik_baslik():
    md = "# Uzaktan destek\n\nIT ekibinin bağlanabilmesi için AnyDesk gerekir, Yazılım Merkezi'nden kurulur.\n\n## Güvenlik\n\nTanımadığınız kişilere asla AnyDesk numaranızı vermeyin, IT sizi önceden arar.\n"
    titles = [s["title"] for s in extract.extract("destek.md", md.encode())["sections"]]
    assert titles == [
        "Uzaktan destek",
        "Uzaktan destek: Güvenlik",
    ]  # Türkçe İ/ı doğru, tek kelime anlamlı hale gelir


def test_html_buyuk_harf_turkce():
    h = "<h1>İŞLEMLER</h1><p>Şifrenizi portal üzerinden değiştirebilirsiniz, işlem birkaç dakika sürer.</p>"
    assert extract.extract("a.html", h.encode())["sections"][0]["title"] == "İşlemler"


def test_desteklenmeyen_ve_bozuk_dosyalar_anlasilir_hata_verir():
    with pytest.raises(ValueError, match="docx"):
        extract.extract("eski.doc", b"xx")
    with pytest.raises(ValueError, match="Desteklenmeyen"):
        extract.extract("resim.exe", b"xx")
    with pytest.raises(ValueError, match="okunabilir metin"):
        extract.extract("bos.txt", b"   ")


def test_endpoint_onizleme(rag):
    r = rag.post("/extract", files={"file": ("IT_El_Kitabi.docx", _docx())})
    assert r.status_code == 200 and len(r.json()["sections"]) == 3
    assert rag.post("/extract", files={"file": ("x.pdf", b"bozuk")}).status_code == 422
