"""Ekran görüntüsünden yazı okuma (OCR) — tamamen yerel (Tesseract). Görüntü hiçbir dış servise gitmez.
Hata ekranlarındaki asıl mesajı bulmak için satırlar puanlanır: 'hata', 'error', kod numaraları vb."""
import io
import re

from PIL import Image, ImageOps, ImageStat

try:
    import pytesseract
except ImportError:  # pragma: no cover
    pytesseract = None

ERROR_WORDS = re.compile(
    r"hata|error|başarısız|failed|failure|bağlanam|ulaşılam|erişilem|reddedildi|denied|geçersiz|invalid|"
    r"bulunamadı|not found|timeout|zaman aşımı|lisans|license|uyarı|warning|exception|yapılamadı|cannot|can't|unable",
    re.IGNORECASE)
CODE = re.compile(r"\b(?:0x[0-9a-f]{4,8}|[A-Z]{2,6}[-_ ]?\d{2,6}|\d{3,5})\b", re.IGNORECASE)
NOISE = re.compile(r"^(tamam|ok|iptal|cancel|kapat|close|yardım|help|evet|hayır|yes|no|ayrıntılar|details)$", re.IGNORECASE)


def available() -> bool:
    if pytesseract is None:
        return False
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:  # noqa: BLE001
        return False


def _prepare(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("L")
    # Küçük ekran görüntülerini büyüt: Tesseract ~30px yükseklikteki harflerde en iyi sonucu verir
    if img.width < 1600:
        f = min(3.0, 1600 / max(1, img.width))
        img = img.resize((int(img.width * f), int(img.height * f)), Image.LANCZOS)
    # Koyu temalı ekranlar: ortalama koyuysa tersine çevir
    if ImageStat.Stat(img).mean[0] < 110:
        img = ImageOps.invert(img)
    return ImageOps.autocontrast(img)


def extract(data: bytes) -> dict:
    img = _prepare(data)
    text = pytesseract.image_to_string(img, lang="tur+eng", config="--psm 3")
    lines = [re.sub(r"\s+", " ", l).strip(" |·•-_—") for l in text.splitlines()]
    # Ekranda iki satıra bölünmüş cümleleri birleştir (kapanmamış parantez ya da küçük harfle devam)
    merged: list[str] = []
    for l in lines:
        if merged and l and (merged[-1].count("(") > merged[-1].count(")") or (l[0].islower() and not merged[-1].endswith((".", ":", "!")))):
            merged[-1] = f"{merged[-1]} {l}"
        else:
            merged.append(l)
    lines = [l for l in merged if len(l) >= 4 and not NOISE.match(l) and sum(c.isalpha() for c in l) >= 3]

    def score(l: str) -> float:
        s = 3 * len(ERROR_WORDS.findall(l)) + 2 * len(CODE.findall(l))
        s += min(len(l), 90) / 90           # biraz uzun cümleler başlıktan iyidir
        s -= 2 if len(l) > 140 else 0
        return s

    ranked = sorted(lines, key=score, reverse=True)
    best = ranked[0] if ranked else ""
    codes = sorted({c.upper() for l in lines for c in CODE.findall(l) if not c.isdigit() or len(c) >= 3})
    title = best[:100].rstrip(" .:")
    return {"text": "\n".join(lines), "title": title, "codes": codes[:5], "lines": len(lines)}
