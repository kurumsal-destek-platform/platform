import io

import pytest

import ocr

pytestmark = pytest.mark.skipif(not ocr.available(), reason="Tesseract kurulu değil")


def _img(text: str, dark: bool = False) -> bytes:
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (1000, 220), "#202124" if dark else "white")
    font = ImageFont.load_default(size=36)
    d = ImageDraw.Draw(img)
    d.text((30, 30), "Anka Connect", fill="#e8eaed" if dark else "black", font=font)
    d.text((30, 100), text, fill="#e8eaed" if dark else "black", font=font)
    d.text((800, 170), "OK", fill="#e8eaed" if dark else "black", font=font)
    b = io.BytesIO(); img.save(b, "PNG"); return b.getvalue()


def test_hata_satiri_ve_kodu_bulunur():
    r = ocr.extract(_img("Error 809: The remote server is not responding"))
    assert "809" in r["title"] and any("809" in c for c in r["codes"])


def test_koyu_tema_ekran_goruntusu():
    r = ocr.extract(_img("Error 809: The remote server is not responding", dark=True))
    assert "809" in r["title"]


def test_dugme_yazilari_baslik_olmaz():
    assert ocr.extract(_img("Connection failed"))["title"].lower() != "ok"
