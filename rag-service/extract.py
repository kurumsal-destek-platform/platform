"""Doküman içe aktarma: PDF / Word / metin / HTML → başlıklara göre bölümler.
Her bölüm bilgi bankasında ayrı bir makale olur (asistan kısa ve odaklı makalelerde daha iyi cevap verir).
Tamamen yerel; dosya hiçbir dış servise gitmez."""

import html
import io
import re

MAX_SECTIONS = 60
MIN_BODY = 40  # bundan kısa bölümler bir öncekine eklenir
MAX_BODY = 6000  # çok uzun bölümler bölünür

# "1.", "2.3", "1)", "BÖLÜM 2", tamamı büyük harf kısa satırlar … başlık gibi görünür
HEADING_RE = re.compile(
    r"^((\d+(\.\d+){0,3}[.)]?)|(bölüm|kısım|madde|section|chapter)\s+\d+)\s+\S",
    re.IGNORECASE,
)


def tr_lower(s: str) -> str:
    return s.replace("I", "ı").replace("İ", "i").lower()


def tr_upper(s: str) -> str:
    return s.replace("i", "İ").replace("ı", "I").upper()


def tr_capitalize(s: str) -> str:
    low = tr_lower(s)
    return (
        ({"i": "İ", "ı": "I"}.get(low[:1], low[:1].upper()) + low[1:]) if low else low
    )


def _clean(s: str) -> str:
    s = s.replace("\r", "").replace("­", "").replace("\x0c", "\n")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"(\w)-\n(\w)", r"\1\2", s)  # PDF'te satır sonu tirelemesi
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def _looks_like_heading(line: str, next_line: str | None) -> bool:
    l = line.strip()
    if (
        not (3 <= len(l) <= 90)
        or l.endswith((".", ",", ";"))
        and not HEADING_RE.match(l)
    ):
        return False
    if HEADING_RE.match(l) and len(l) < 80:
        # "1) İnternetinizi kontrol edin." gibi madde adımlarını başlık sanma: başlıklar nokta ile bitmez, kısa olur
        return not l.endswith(".") and len(l.split()) <= 9
    letters = [c for c in l if c.isalpha()]
    return bool(
        letters
        and sum(c.isupper() for c in letters) / len(letters) > 0.8
        and len(l.split()) <= 8
    )


def _split_text(text: str, fallback_title: str) -> list[dict]:
    lines = [l.rstrip() for l in _clean(text).split("\n")]
    sections, title, buf = [], None, []
    for i, line in enumerate(lines):
        nxt = next((x for x in lines[i + 1 :] if x.strip()), None)
        if line.strip() and _looks_like_heading(line, nxt):
            if buf and "".join(buf).strip():
                sections.append(
                    {"title": title or fallback_title, "body": "\n".join(buf).strip()}
                )
            title, buf = line.strip().rstrip(":"), []
        else:
            buf.append(line)
    if "".join(buf).strip():
        sections.append(
            {"title": title or fallback_title, "body": "\n".join(buf).strip()}
        )
    return sections


def _from_docx(data: bytes, fallback: str) -> list[dict]:
    import docx  # python-docx

    d = docx.Document(io.BytesIO(data))
    sections, title, buf = [], None, []
    for p in d.paragraphs:
        t = p.text.strip()
        style = (p.style.name or "").lower() if p.style is not None else ""
        if t and (style.startswith(("heading", "başlık")) or style == "title"):
            if buf:
                sections.append(
                    {"title": title or fallback, "body": "\n".join(buf).strip()}
                )
            title, buf = t, []
        elif t:
            numbered = p._p.pPr is not None and p._p.pPr.numPr is not None
            buf.append(f"- {t}" if numbered or "list" in style else t)
    for table in d.tables:  # tablolar: satır satır "a | b | c"
        rows = [" | ".join(c.text.strip() for c in r.cells) for r in table.rows]
        buf.append("\n".join(rows))
    if buf:
        sections.append({"title": title or fallback, "body": "\n".join(buf).strip()})
    # Hiç başlık stili kullanılmamışsa metin sezgisiyle böl
    if len(sections) == 1 and sections[0]["title"] == fallback:
        return _split_text(sections[0]["body"], fallback)
    return sections


def _from_pdf(data: bytes, fallback: str) -> tuple[list[dict], int]:
    from pypdf import PdfReader

    r = PdfReader(io.BytesIO(data))
    if r.is_encrypted:
        try:
            r.decrypt("")
        except Exception:  # noqa: BLE001
            raise ValueError("PDF şifreli; şifresiz bir kopyasını yükleyin.")
    text = "\n".join((p.extract_text() or "") for p in r.pages)
    if len(text.strip()) < 20:
        raise ValueError("PDF'te seçilebilir yazı yok (taranmış görüntü olabilir).")
    return _split_text(text, fallback), len(r.pages)


def _from_html(data: bytes, fallback: str) -> list[dict]:
    s = data.decode("utf-8", errors="replace")
    s = re.sub(r"(?is)<(script|style).*?</\1>", "", s)
    s = re.sub(
        r"(?i)<h[1-3][^>]*>(.*?)</h[1-3]>",
        lambda m: "\n\n" + tr_upper(re.sub("<[^>]+>", "", m.group(1)).strip()) + "\n",
        s,
    )
    s = re.sub(r"(?i)<(br|/p|/li|/div|/tr)[^>]*>", "\n", s)
    s = re.sub(r"(?i)<li[^>]*>", "- ", s)
    return _split_text(html.unescape(re.sub("<[^>]+>", "", s)), fallback)


def _normalize(sections: list[dict]) -> list[dict]:
    out: list[dict] = []
    doc_title = None
    for s in sections:
        body = _clean(s["body"])
        title = re.sub(r"^\d+(\.\d+)*[.)]?\s*", "", s["title"]).strip() or s["title"]
        if title.isupper():
            title = tr_capitalize(title)
        doc_title = doc_title or title
        # "Kurulum", "Güvenlik" gibi tek kelimelik başlık tek başına anlamsız: doküman başlığıyla birleştir
        if len(title.split()) == 1 and doc_title and title != doc_title:
            title = f"{doc_title}: {title}"
        if out and len(body) < MIN_BODY:
            out[-1]["body"] += f"\n\n{title}\n{body}".rstrip()
            continue
        while len(body) > MAX_BODY:  # çok uzun: paragraf sınırından böl
            cut = body.rfind("\n", 0, MAX_BODY)
            cut = cut if cut > MAX_BODY // 2 else MAX_BODY
            out.append({"title": title, "body": body[:cut].strip()})
            body, title = body[cut:].strip(), f"{title} (devam)"
        if body:
            out.append({"title": title[:150], "body": body})
    return out[:MAX_SECTIONS]


def extract(filename: str, data: bytes) -> dict:
    name = filename.rsplit("/", 1)[-1]
    base = (
        re.sub(r"\.[^.]+$", "", name).replace("_", " ").replace("-", " ").strip()
        or "Doküman"
    )
    ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    pages = None
    if ext == "pdf":
        sections, pages = _from_pdf(data, base)
    elif ext == "docx":
        sections = _from_docx(data, base)
    elif ext in ("txt", "md", "markdown", "csv", "log"):
        text = data.decode("utf-8", errors="replace")
        if ext in ("md", "markdown"):  # markdown başlıkları
            text = re.sub(r"(?m)^#{1,3}\s+(.+)$", lambda m: tr_upper(m.group(1)), text)
        sections = _split_text(text, base)
    elif ext in ("html", "htm"):
        sections = _from_html(data, base)
    elif ext == "doc":
        raise ValueError(
            "Eski .doc biçimi desteklenmiyor; Word'de 'Farklı kaydet → .docx' yapın."
        )
    else:
        raise ValueError(
            f"Desteklenmeyen dosya türü: .{ext or '?'} (PDF, DOCX, TXT, MD, HTML desteklenir)"
        )
    sections = _normalize(sections)
    if not sections:
        raise ValueError("Dokümanda okunabilir metin bulunamadı.")
    return {
        "file": name,
        "pages": pages,
        "sections": sections,
        "characters": sum(len(s["body"]) for s in sections),
    }
