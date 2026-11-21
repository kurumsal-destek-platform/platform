"""
Kurulum sonrası otomatik kontrol.  Çalıştırma (proje klasöründe):
    docker compose exec rag python scripts/smoke_test.py

Tüm sistemi uçtan uca dener ve neyin çalışıp neyin çalışmadığını Türkçe açıklar.
Demo verisini neredeyse değiştirmez. Yan etkiler: Ayşe'ye şifre sıfırlama e-postası gider (Mailpit) ve
e-posta kanalını denemek için "[Otomatik test]" başlıklı bir ticket açılıp hemen "çözüldü" yapılır.
"""

import io
import os
import smtplib
import sys
import time
import uuid
from email.message import EmailMessage
from urllib.parse import urlparse

import httpx

API = os.getenv("SMOKE_API", "http://api:8080")
RAG = os.getenv("SMOKE_RAG", "http://localhost:8000")
MAIL = os.getenv("SMOKE_MAIL", "http://mailpit:8025")
WEB = os.getenv("SMOKE_WEB", "http://web:80")
PASSWORD = os.getenv("SMOKE_PASSWORD", "Demo123!")

OK, WARN, FAIL, SKIP = "✓", "!", "✗", "–"
results: list[tuple[str, str, str]] = []
c = httpx.Client(timeout=30)


def check(name: str):
    """Her kontrol bir fonksiyon: (durum, açıklama) döner; hata fırlatırsa ✗ sayılır."""

    def deco(fn):
        t0 = time.time()
        try:
            status, detail = fn()
        except KeyError:
            status, detail = SKIP, "atlandı (önceki bir adım başarısız oldu)"
        except AssertionError as e:
            status, detail = FAIL, str(e) or "beklenen sonuç alınamadı"
        except httpx.HTTPError as e:
            status, detail = FAIL, f"bağlantı hatası: {type(e).__name__} ({e})"
        except Exception as e:  # noqa: BLE001
            status, detail = FAIL, f"{type(e).__name__}: {e}"
        ms = int((time.time() - t0) * 1000)
        results.append((status, name, f"{detail}  ({ms} ms)"))
        print(f" {status}  {name:<44} {detail}", flush=True)
        return fn

    return deco


def login(email: str) -> tuple[str, dict]:
    r = c.post(f"{API}/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, (
        f"{email} giriş yapamadı (HTTP {r.status_code}: {r.text[:120]})"
    )
    j = r.json()
    return j["token"], j["user"]


def H(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


print("\nDestek Platformu — otomatik kontrol\n" + "-" * 78)
S: dict = {}


# ------------------------------------------------------------------ temel servisler
@check("API ayakta (/health)")
def _():
    r = c.get(f"{API}/health")
    assert r.status_code == 200, f"HTTP {r.status_code}"
    return OK, "çalışıyor"


@check("Web arayüzü (nginx)")
def _():
    r = c.get(WEB)
    assert r.status_code == 200 and 'id="root"' in r.text, f"HTTP {r.status_code}"
    return OK, "sayfa geliyor"


@check("Giriş: yonetici@anka.com")
def _():
    S["tok"], S["me"] = login("yonetici@anka.com")
    return (
        OK,
        f"{S['me']['fullName']} ({S['me']['role']}) · {S['me'].get('tenantName')}",
    )


@check("Oturum olmadan erişim engelleniyor")
def _():
    r = c.get(f"{API}/api/tickets")
    assert r.status_code == 401, f"HTTP {r.status_code} (401 bekleniyordu)"
    return OK, "401"


# ------------------------------------------------------------------ demo verisi + özellikler
@check("Demo verisi yüklü")
def _():
    t = c.get(f"{API}/api/tickets", headers=H(S["tok"])).json()
    a = c.get(f"{API}/api/kb/articles", headers=H(S["tok"])).json()
    S["tickets"] = t
    assert len(t) >= 100, (
        f"sadece {len(t)} ticket var; 'docker compose down -v' ile sıfırlayıp tekrar kurun"
    )
    return OK, f"{len(t)} ticket, {len(a)} makale"


@check("SLA bilgisi ticket'larda")
def _():
    with_sla = [
        t
        for t in S["tickets"]
        if (t.get("sla") or {}).get("resolution") not in (None, "none")
    ]
    assert with_sla, "hiçbir ticket'ta SLA yok (migration/seed eski olabilir)"
    br = sum(1 for t in with_sla if t["sla"]["resolution"] == "breached")
    return OK, f"{len(with_sla)} ticket'ta hedef var · {br} tanesi aşılmış"


@check("Performans: hizmet kalitesi")
def _():
    j = c.get(f"{API}/api/performance/quality", headers=H(S["tok"])).json()
    return (
        OK,
        f"SLA %{j['sla']['resolutionPct']} · memnuniyet {j['csat']['average']}/5 ({j['csat']['count']} puan)",
    )


@check("Performans: tasarruf")
def _():
    j = c.get(f"{API}/api/performance/savings", headers=H(S["tok"])).json()
    assert j["deflected"] > 0, "ticket açılmadan çözülen kayıt yok"
    return (
        OK,
        f"{j['deflected']} sorun ticket'sız çözüldü ≈ {int(j['moneySaved']):,} TL".replace(
            ",", "."
        ),
    )


@check("Büyük olay önerisi (VPN seli)")
def _():
    j = c.get(f"{API}/api/incidents/suggestions", headers=H(S["tok"])).json()
    if not j:
        return (
            WARN,
            "öneri yok (ticket seli 'son 3 gün' içinde kuruldu; veritabanı eskiyse down -v ile sıfırlayın)",
        )
    return OK, f'{j[0]["count"]} benzer ticket: "{j[0]["title"]}"'


@check("Bilgi boşluğu radarı")
def _():
    j = c.get(
        f"{API}/api/insights/knowledge-gaps", headers=H(S["tok"]), timeout=90
    ).json()
    assert j["gaps"], "boşluk bulunamadı (demo verisinde en az 3 olmalı)"
    mode = "anlamsal" if j.get("mode") == "semantic" else "güvenli mod (Ollama kapalı)"
    return OK, f'{len(j["gaps"])} boşluk · {mode} · ilk: "{j["gaps"][0]["topic"]}"'


@check("Sprint risk tahmini")
def _():
    sprints = c.get(f"{API}/api/projects/ANK/sprints", headers=H(S["tok"])).json()
    act = next((s for s in sprints if s["status"] == "active"), None)
    assert act, "ANK projesinde aktif sprint yok"
    j = c.get(f"{API}/api/sprints/{act['id']}/risk", headers=H(S["tok"])).json()
    assert j.get("available"), j.get("message", "tahmin yok")
    return (
        OK,
        f"%{j['completion']} tamamlanacak · risk: {j['level']} · {len(j['risks'])} riskli iş",
    )


@check("Akıllı atama önerisi")
def _():
    t = next(t for t in S["tickets"] if t["status"] in ("open", "assigned"))
    j = c.get(
        f"{API}/api/tickets/{t['id']}/assign-suggestions", headers=H(S["tok"])
    ).json()
    assert j, "öneri dönmedi"
    return OK, f'"{t["title"][:30]}" → {j[0]["fullName"]} (%{j[0]["match"]})'


@check("Ticket yazışması + cevap taslağı")
def _():
    t = next((t for t in S["tickets"] if t["status"] == "in_progress"), S["tickets"][0])
    m = c.get(f"{API}/api/tickets/{t['id']}/messages", headers=H(S["tok"])).json()
    d = c.post(
        f"{API}/api/tickets/{t['id']}/reply-draft", headers=H(S["tok"]), timeout=150
    ).json()
    assert d.get("draft"), "taslak boş"
    how = (
        "yapay zekâ yazdı" if d.get("aiGenerated") else "şablonla (Ollama kapalı/yavaş)"
    )
    return (
        OK if d.get("aiGenerated") else WARN
    ), f"{len(m)} mesaj · taslak {how} · {len(d.get('sources', []))} kaynak"


@check("Rozetler")
def _():
    j = c.get(f"{API}/api/performance/badges", headers=H(S["tok"])).json()
    return (OK if j else WARN), f"{len(j)} rozet" + (
        ": " + ", ".join(f"{b['emoji']} {b['name']}" for b in j[:3]) if j else ""
    )


# ------------------------------------------------------------------ yapay zekâ ve OCR
@check("RAG servisi + Ollama")
def _():
    j = c.get(f"{RAG}/health").json()
    S["rag"] = j
    if j.get("ollama") != "ok":
        return (
            WARN,
            "RAG çalışıyor ama Ollama'ya ulaşamıyor → 'ollama serve' açık mı? (asistan güvenli modda)",
        )
    return OK, f"{j['embed_model']} + {j['llm_model']} · eşik {j['threshold']}"


@check("Asistan araması (RAG, VPN sorusu)")
def _():
    r = c.post(
        f"{RAG}/search",
        json={
            "tenant_id": S["me"]["tenantId"],
            "query": "VPN bağlanmıyor ne yapmalıyım",
        },
        timeout=120,
    ).json()
    top = r["results"][0] if r["results"] else None
    assert top and "VPN" in top["title"], (
        f"beklenen VPN makalesi gelmedi: {top and top['title']}"
    )
    return (
        OK if r["mode"] == "hybrid" else WARN
    ), f'mod: {r["mode"]} · ilk sonuç: "{top["title"]}" (güvenilir: {top["confident"]})'


@check("Model ısıtma (ilk soru hızlı)")
def _():
    w = S.get("rag", {}).get("warmup") or {}
    if w.get("state") != "done":
        return WARN, f"ısıtma sürüyor ({w.get('state', '?')}); 1-2 dk sonra tekrar deneyin"
    if not (w.get("embed") and w.get("llm")):
        return WARN, f"modeller yüklenemedi: {w.get('detail')} → 'ollama list' ile modelleri kontrol edin"
    return OK, f"modeller bellekte · {w.get('tenants', 0)} firma indekslendi · {w.get('seconds')} sn"


@check("Asistan: takip sorusu (sohbet bağlamı)")
def _():
    first = "VPN programını yeni bilgisayara nasıl kurarım"
    a = c.post(
        f"{API}/api/assistant/ask", headers=H(S["tok"]), json={"question": first}, timeout=120
    ).json()
    r = c.post(
        f"{API}/api/assistant/ask",
        headers=H(S["tok"]),
        json={
            "question": "peki Mac'te?",
            "history": [{"question": first, "answer": a.get("answer") or a.get("message")}],
        },
        timeout=120,
    ).json()
    assert "followup" in r, "RAG takip sorusunu tanımadı (RAG servisi kapalı mı, yedek aramaya mı düşüldü?)"
    used = r.get("question_used", "?")
    if r.get("rewrite_mode") != "llm":
        return WARN, f'yapay zekâsız birleştirme: "{used[:50]}" (Ollama kapalı/yavaş)'
    return OK, f'"peki Mac\'te?" → "{used[:55]}"'


@check("Yinelenen ticket uyarısı")
def _():
    r = c.post(
        f"{API}/api/tickets/similar",
        headers=H(S["tok"]),
        json={"title": "VPN'e bağlanamıyorum", "description": "evden çalışırken bağlantı kurulamıyor"},
        timeout=120,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}"
    j = r.json()
    assert j["matches"], "VPN seli olmasına rağmen benzer açık ticket bulunamadı"
    top = j["matches"][0]
    return (OK if j["mode"] == "semantic" else WARN), (
        f'mod: {j["mode"]} · {len(j["matches"])} benzer açık ticket · ilk: "{top["title"][:35]}" ({top["similarity"]})'
    )


@check("Kategori ve öncelik önerisi")
def _():
    r = c.post(
        f"{API}/api/tickets/suggest-triage",
        headers=H(S["tok"]),
        json={"title": "Yazıcı kağıt sıkıştırıyor", "description": "2. kattaki yazıcı sürekli kağıt sıkıştırıyor"},
        timeout=120,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}"
    j = r.json()
    s = j.get("suggestion")
    assert s and s.get("category"), "öneri gelmedi (geçmişte benzer ticket yok mu?)"
    return (OK if j["mode"] == "semantic" else WARN), (
        f'mod: {j["mode"]} · kategori: {s["category"]} (%{round(100 * s["categoryConfidence"])}) · '
        f'öncelik: {s["priority"]} · {s["basedOn"]} benzer ticket'
    )


@check("Ekran görüntüsü okuma (OCR)")
def _():
    if S.get("rag", {}).get("ocr") != "ok":
        return (
            WARN,
            "Tesseract kurulu değil (rag imajını --build ile yeniden oluşturun)",
        )
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (900, 160), "white")
    try:
        font = ImageFont.load_default(size=40)
    except TypeError:
        font = ImageFont.load_default()
    ImageDraw.Draw(img).text(
        (30, 50), "Hata 809: Uzak sunucu yanit vermiyor", fill="black", font=font
    )
    buf = io.BytesIO()
    img.save(buf, "PNG")
    r = c.post(
        f"{API}/api/ocr",
        headers=H(S["tok"]),
        files={"file": ("test.png", buf.getvalue(), "image/png")},
        timeout=60,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text[:120]}"
    j = r.json()
    assert "809" in (j.get("title", "") + " ".join(j.get("codes", []))), (
        f"okunan: {j.get('title')!r}"
    )
    return OK, f'okunan: "{j["title"]}"'


@check("Doküman içe aktarma (önizleme)")
def _():
    md = "# Test el kitabı\n\nBu bölüm otomatik kontrol için oluşturuldu ve kaydedilmez.\n\n## Yazıcı kurulumu\n\nAyarlar > Yazıcılar bölümünden Kat2-Yazıcı'yı ekleyin.\n"
    r = c.post(
        f"{API}/api/kb/import/preview",
        headers=H(S["tok"]),
        files={"file": ("test.md", md.encode(), "text/markdown")},
        timeout=60,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text[:120]}"
    secs = r.json()["sections"]
    assert len(secs) == 2, f"{len(secs)} bölüm (2 bekleniyordu)"
    return OK, "2 bölüm bulundu: " + ", ".join(
        f'"{x["title"]}"' for x in secs
    ) + " (kaydedilmedi)"


# ------------------------------------------------------------------ e-posta, canlı, güvenlik
@check("E-posta (şifre sıfırlama → Mailpit)")
def _():
    before = time.time()
    r = c.post(f"{API}/api/auth/forgot-password", json={"email": "ayse@anka.com"})
    assert r.status_code == 200, f"HTTP {r.status_code}"
    for _ in range(10):
        time.sleep(0.5)
        try:
            j = c.get(
                f"{MAIL}/api/v1/search", params={"query": "to:ayse@anka.com"}
            ).json()
        except httpx.HTTPError:
            return (
                WARN,
                "Mailpit'e ulaşılamadı (gerçek SMTP ayarlıysa normal; gelen kutusuna bakın)",
            )
        fresh = [
            m
            for m in j.get("messages", [])
            if time.mktime(time.strptime(m["Created"][:19], "%Y-%m-%dT%H:%M:%S"))
            >= before - 120
        ]
        if fresh:
            S["reset_mail"] = fresh[0]["ID"]
            return OK, "e-posta Mailpit'te (http://localhost:8025)"
    return FAIL, "e-posta 5 sn içinde Mailpit'e düşmedi (docker logs platform-api)"


@check("Şifre sıfırlama bağlantısı çalışıyor")
def _():
    # E-postadaki bağlantının ekranda gerçekten açılabildiğini doğrula (şifreyi DEĞİŞTİRMEZ)
    import re
    from urllib.parse import unquote

    msg = c.get(f"{MAIL}/api/v1/message/{S['reset_mail']}").json()
    body = (msg.get("HTML") or "") + (msg.get("Text") or "")
    m = re.search(r"token=([A-Za-z0-9_%.~-]+)", body)
    assert m, "e-postada sıfırlama bağlantısı bulunamadı"
    r = c.post(f"{API}/api/auth/check-token", json={"token": unquote(m.group(1))})
    assert r.status_code == 200, (
        f"bağlantı ekranda açılmıyor (check-token HTTP {r.status_code}); "
        "AuthController ve Security.cs Öncelik 3 sürümü mü?"
    )
    return OK, f"bağlantı geçerli: {r.json().get('email')}"


@check("Canlı güncelleme (SignalR)")
def _():
    r = c.post(
        f"{API}/hubs/live/negotiate",
        params={"negotiateVersion": 1},
        headers=H(S["tok"]),
    )
    assert r.status_code == 200 and "connectionId" in r.text, f"HTTP {r.status_code}"
    return OK, "bağlantı kurulabiliyor"


@check("Firma izolasyonu (Mavi ↔ Anka)")
def _():
    tok, me = login("yonetici@mavi.com")
    mavi_tickets = c.get(f"{API}/api/tickets", headers=H(tok)).json()
    anka_ids = {t["id"] for t in S["tickets"]}
    assert not any(t["id"] in anka_ids for t in mavi_tickets), (
        "Mavi, Anka'nın ticket'larını görüyor!"
    )
    one = S["tickets"][0]["id"]
    r = c.get(f"{API}/api/tickets/{one}/messages", headers=H(tok))
    assert r.status_code in (403, 404), (
        f"Mavi, Anka ticket'ının mesajlarına erişebildi (HTTP {r.status_code})"
    )
    s = c.post(
        f"{RAG}/search",
        json={"tenant_id": me["tenantId"], "query": "Anka Connect VPN bağlanmıyor"},
        timeout=120,
    ).json()
    leaked = [x["title"] for x in s["results"] if "Anka" in x.get("snippet", "")]
    assert not leaked, f"Mavi'nin aramasında Anka içeriği: {leaked}"
    return OK, f"Mavi {len(mavi_tickets)} ticket görüyor, Anka verisine erişemiyor"


@check("Çalışan, yönetici sayfasına giremiyor")
def _():
    tok, _ = login("selin@anka.com")
    r = c.get(f"{API}/api/performance/quality", headers=H(tok))
    assert r.status_code == 403, f"HTTP {r.status_code} (403 bekleniyordu)"
    return OK, "403"


@check("Denetim kaydı yazılıyor")
def _():
    j = c.get(
        f"{API}/api/audit",
        params={"onlySecurity": True, "days": 1},
        headers=H(S["tok"]),
    ).json()
    assert any("Giriş" in a["action"] for a in j), "giriş kayıtları görünmüyor"
    return OK, f"son 24 saatte {len(j)} güvenlik kaydı"


@check("Ticket listesi sayfalama")
def _():
    r = c.get(
        f"{API}/api/tickets",
        params={"page": 2, "pageSize": 10},
        headers=H(S["tok"]),
    )
    assert r.status_code == 200, f"HTTP {r.status_code}"
    j = r.json()
    assert isinstance(j, dict) and len(j["items"]) == 10, "sayfalı cevap gelmedi"
    assert j["total"] == len(S["tickets"]), (
        f"toplam {j['total']}, liste {len(S['tickets'])}"
    )
    return OK, f"sayfa 2/{j['pages']} · 10 kayıt · toplam {j['total']}"


@check("KVKK: firma verisi dışa aktarma")
def _():
    tok, _ = login("admin@anka.com")
    r = c.get(f"{API}/api/privacy/tenant/export", headers=H(tok), timeout=60)
    assert r.status_code == 200, f"HTTP {r.status_code}"
    assert "passwordHash" not in r.text and "tokenHash" not in r.text, (
        "dışa aktarılan dosyada şifre özeti var!"
    )
    j = r.json()
    r2 = c.get(f"{API}/api/privacy/tenant/export", headers=H(S["tok"]))
    assert r2.status_code == 403, (
        f"yönetici (Admin değil) indirebildi: HTTP {r2.status_code}"
    )
    kb = len(r.content) // 1024
    return (
        OK,
        f"{len(j['tickets'])} ticket, {len(j['users'])} kullanıcı ({kb} KB) · sadece Admin",
    )


def send_mail(sender: str, to: str, subject: str, body: str) -> None:
    """Mailpit'in SMTP kapısına (1025) e-posta bırakır: dışarıdan gelen bir maili taklit eder."""
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = sender, to, subject
    m.set_content(body)
    with smtplib.SMTP(urlparse(MAIL).hostname, 1025, timeout=10) as s:
        s.send_message(m)


def wait_for(fn, seconds: int = 45):
    """fn bir değer döndürene kadar bekler (gelen kutusu 10 sn'de bir okunur)."""
    end = time.time() + seconds
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(2)
    return None


@check("E-postadan ticket (destek@ adresine mail)")
def _():
    ch = c.get(f"{API}/api/mail/channel", headers=H(S["tok"])).json()
    if not ch.get("mailpitInbox"):
        return SKIP, "gelen kutusu kapalı (MAILPIT_INBOX_URL boş)"
    code = uuid.uuid4().hex[:6]
    subject = f"[Otomatik test] Yazıcı kağıt sıkıştırıyor {code}"
    send_mail(
        "ayse@anka.com",
        ch["supportAddress"],
        subject,
        "3. kattaki yazıcı sürekli kağıt sıkıştırıyor.",
    )

    def find():
        r = c.get(
            f"{API}/api/tickets",
            params={"page": 1, "pageSize": 5, "search": code},
            headers=H(S["tok"]),
        )
        items = r.json().get("items", []) if r.status_code == 200 else []
        return items[0] if items else None

    t = wait_for(find)
    assert t, (
        "45 sn içinde ticket oluşmadı (api loglarında 'Gelen e-posta' satırına bakın)"
    )
    S["mail_ticket"] = t
    return (
        OK,
        f'ticket açıldı: "{t["title"]}" · bildiren: {t.get("reporterName", "Ayşe")}',
    )


@check("E-posta cevabı ticket'a düşüyor")
def _():
    t = S.get("mail_ticket")
    if not t:
        return SKIP, "önceki kontrol geçmedi"
    tag = f"[#{t['id'].replace('-', '')[:8]}]"
    # 1) Destek ekibinin cevabı Ayşe'ye e-posta olarak gitmeli
    r = c.post(
        f"{API}/api/tickets/{t['id']}/messages",
        json={"body": "Merhaba, tepsiyi çıkarıp sıkışan kağıdı alır mısınız?"},
        headers=H(S["tok"]),
    )
    assert r.status_code == 200, f"cevap yazılamadı: HTTP {r.status_code}"

    def mail_out():
        q = {"query": "to:ayse@anka.com", "limit": 20}
        msgs = c.get(f"{MAIL}/api/v1/search", params=q).json().get("messages") or []
        return [m for m in msgs if tag in m.get("Subject", "")] or None

    assert wait_for(mail_out, 20), "destek cevabı e-posta olarak gitmedi"
    # 2) Ayşe maili yanıtlıyor → aynı ticket'a mesaj olarak eklenmeli
    send_mail(
        "ayse@anka.com",
        "destek@platform.local",
        f"Re: {t['title']} {tag}",
        "Denedim, düzeldi. Teşekkürler!\n\n> eski mesaj",
    )

    def reply_in():
        msgs = c.get(
            f"{API}/api/tickets/{t['id']}/messages", headers=H(S["tok"])
        ).json()
        return [m for m in msgs if "düzeldi" in m["body"]] or None

    got = wait_for(reply_in)
    c.patch(
        f"{API}/api/tickets/{t['id']}/status",
        json={"status": "resolved", "resolutionNote": "Otomatik test"},
        headers=H(S["tok"]),
    )
    assert got, "çalışanın e-posta cevabı ticket'a eklenmedi"
    assert "eski mesaj" not in got[0]["body"], "alıntılanan eski yazışma ayıklanmadı"
    return OK, f"cevap Ayşe'ye mail gitti, Ayşe'nin yanıtı ticket'a eklendi ({tag})"


@check("Otomasyon kuralları")
def _():
    users = c.get(f"{API}/api/users", headers=H(S["tok"])).json()
    ali = next((u for u in users if u["fullName"].startswith("Ali")), None)
    assert ali, "Ali Çelik bulunamadı"
    rule = {
        "name": "Smoke test kuralı",
        "whenKeywords": "smoketest-vpn",
        "setAssigneeId": ali["id"],
        "setPriority": "High",
        "stopProcessing": True,
        "sortOrder": -1000,
    }
    r = c.post(f"{API}/api/automation/rules", json=rule, headers=H(S["tok"]))
    assert r.status_code == 200, (
        f"kural eklenemedi: HTTP {r.status_code} {r.text[:120]}"
    )
    rid = r.json()["id"]
    try:
        t = c.post(
            f"{API}/api/automation/rules/test",
            json={"title": "SMOKETEST-VPN bağlanmıyor"},
            headers=H(S["tok"]),
        ).json()
        res = t["result"]
        assert any(m["ruleId"] == rid for m in t["matched"]), "kural eşleşmedi"
        assert res["assigneeId"] == ali["id"] and res["priority"] == "High", (
            f"beklenmeyen sonuç: {res}"
        )
        emp, _ = login("ayse@anka.com")
        r2 = c.get(f"{API}/api/automation/rules", headers=H(emp))
        assert r2.status_code == 403, (
            f"çalışan kuralları görebildi: HTTP {r2.status_code}"
        )
    finally:
        c.delete(f"{API}/api/automation/rules/{rid}", headers=H(S["tok"]))
    return (
        OK,
        f'"vpn" içeren ticket → {res["assigneeName"]}, öncelik Yüksek (kural silindi)',
    )


@check("Haftalık yönetici özeti")
def _():
    r = c.get(f"{API}/api/digest/preview", headers=H(S["tok"]))
    assert r.status_code == 200, f"HTTP {r.status_code}"
    d = r.json()
    sla = f"%{d['slaPercent']}" if d["slaPercent"] is not None else "–"
    csat = f"{d['csat']}" if d["csat"] is not None else "–"
    return OK, (
        f"son 7 gün: {d['opened']} açılan, {d['resolved']} çözülen, SLA {sla}, "
        f"memnuniyet {csat} · {'açık' if d['enabled'] else 'kapalı'}"
    )


@check("Sistem durumu")
def _():
    j = c.get(f"{API}/api/system/status", headers=H(S["tok"]), timeout=30).json()
    bad = [f"{x['name']}: {x['detail']}" for x in j["checks"] if x["status"] != "ok"]
    return (OK if j["overall"] == "ok" else WARN), (
        "her şey yolunda" if not bad else " | ".join(bad)[:150]
    )


# ------------------------------------------------------------------ özet
print("-" * 78)
fails = [r for r in results if r[0] == FAIL]
warns = [r for r in results if r[0] == WARN]
skips = [r for r in results if r[0] == SKIP]
print(
    f"Sonuç: {len(results) - len(fails) - len(warns) - len(skips)} başarılı, {len(warns)} uyarı, {len(fails)} hata, {len(skips)} atlandı\n"
)
names = {n for _, n, _ in fails}
if names & {"API ayakta (/health)", "Giriş: yonetici@anka.com"}:
    print("İpucu: API çalışmıyor ya da giriş yapılamıyor. Sırayla bakın:")
    print("  docker compose ps                      → platform-api 'Up' mu?")
    print(
        "  docker logs platform-api --tail 60     → kırmızı hata satırını bana iletin"
    )
    print(
        "  Migration oluşturuldu mu? (dotnet ef migrations add …) ve 'docker compose down -v' yapıldı mı?\n"
    )
if fails:
    print("Hatalar (bunları bana iletin):")
    for _, n, d in fails:
        print(f"  ✗ {n}: {d}")
    print()
sys.exit(1 if fails else 0)
