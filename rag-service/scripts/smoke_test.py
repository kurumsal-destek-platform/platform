"""
Kurulum sonrası otomatik kontrol.  Çalıştırma (proje klasöründe):
    docker compose exec rag python scripts/smoke_test.py

Tüm sistemi uçtan uca dener ve neyin çalışıp neyin çalışmadığını Türkçe açıklar.
Demo verisini DEĞİŞTİRMEZ (tek yan etki: Ayşe'ye bir şifre sıfırlama e-postası gider → Mailpit).
"""
import io
import os
import sys
import time

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
    assert r.status_code == 200, f"{email} giriş yapamadı (HTTP {r.status_code}: {r.text[:120]})"
    j = r.json()
    return j["token"], j["user"]


def H(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


print("\nDestek Platformu — otomatik kontrol\n" + "-" * 78)
S: dict = {}

# ------------------------------------------------------------------ temel servisler
@check("API ayakta (/health)")
def _():
    r = c.get(f"{API}/health"); assert r.status_code == 200, f"HTTP {r.status_code}"
    return OK, "çalışıyor"

@check("Web arayüzü (nginx)")
def _():
    r = c.get(WEB); assert r.status_code == 200 and 'id="root"' in r.text, f"HTTP {r.status_code}"
    return OK, "sayfa geliyor"

@check("Giriş: yonetici@anka.com")
def _():
    S["tok"], S["me"] = login("yonetici@anka.com")
    return OK, f"{S['me']['fullName']} ({S['me']['role']}) · {S['me'].get('tenantName')}"

@check("Oturum olmadan erişim engelleniyor")
def _():
    r = c.get(f"{API}/api/tickets"); assert r.status_code == 401, f"HTTP {r.status_code} (401 bekleniyordu)"
    return OK, "401"

# ------------------------------------------------------------------ demo verisi + özellikler
@check("Demo verisi yüklü")
def _():
    t = c.get(f"{API}/api/tickets", headers=H(S["tok"])).json()
    a = c.get(f"{API}/api/kb/articles", headers=H(S["tok"])).json()
    S["tickets"] = t
    assert len(t) >= 100, f"sadece {len(t)} ticket var; 'docker compose down -v' ile sıfırlayıp tekrar kurun"
    return OK, f"{len(t)} ticket, {len(a)} makale"

@check("SLA bilgisi ticket'larda")
def _():
    with_sla = [t for t in S["tickets"] if (t.get("sla") or {}).get("resolution") not in (None, "none")]
    assert with_sla, "hiçbir ticket'ta SLA yok (migration/seed eski olabilir)"
    br = sum(1 for t in with_sla if t["sla"]["resolution"] == "breached")
    return OK, f"{len(with_sla)} ticket'ta hedef var · {br} tanesi aşılmış"

@check("Performans: hizmet kalitesi")
def _():
    j = c.get(f"{API}/api/performance/quality", headers=H(S["tok"])).json()
    return OK, f"SLA %{j['sla']['resolutionPct']} · memnuniyet {j['csat']['average']}/5 ({j['csat']['count']} puan)"

@check("Performans: tasarruf")
def _():
    j = c.get(f"{API}/api/performance/savings", headers=H(S["tok"])).json()
    assert j["deflected"] > 0, "ticket açılmadan çözülen kayıt yok"
    return OK, f"{j['deflected']} sorun ticket'sız çözüldü ≈ {int(j['moneySaved']):,} TL".replace(",", ".")

@check("Büyük olay önerisi (VPN seli)")
def _():
    j = c.get(f"{API}/api/incidents/suggestions", headers=H(S["tok"])).json()
    if not j:
        return WARN, "öneri yok (ticket seli 'son 3 gün' içinde kuruldu; veritabanı eskiyse down -v ile sıfırlayın)"
    return OK, f"{j[0]['count']} benzer ticket: \"{j[0]['title']}\""

@check("Bilgi boşluğu radarı")
def _():
    j = c.get(f"{API}/api/insights/knowledge-gaps", headers=H(S["tok"]), timeout=90).json()
    assert j["gaps"], "boşluk bulunamadı (demo verisinde en az 3 olmalı)"
    mode = "anlamsal" if j.get("mode") == "semantic" else "güvenli mod (Ollama kapalı)"
    return OK, f"{len(j['gaps'])} boşluk · {mode} · ilk: \"{j['gaps'][0]['topic']}\""

@check("Sprint risk tahmini")
def _():
    sprints = c.get(f"{API}/api/projects/ANK/sprints", headers=H(S["tok"])).json()
    act = next((s for s in sprints if s["status"] == "active"), None)
    assert act, "ANK projesinde aktif sprint yok"
    j = c.get(f"{API}/api/sprints/{act['id']}/risk", headers=H(S["tok"])).json()
    assert j.get("available"), j.get("message", "tahmin yok")
    return OK, f"%{j['completion']} tamamlanacak · risk: {j['level']} · {len(j['risks'])} riskli iş"

@check("Akıllı atama önerisi")
def _():
    t = next(t for t in S["tickets"] if t["status"] in ("open", "assigned"))
    j = c.get(f"{API}/api/tickets/{t['id']}/assign-suggestions", headers=H(S["tok"])).json()
    assert j, "öneri dönmedi"
    return OK, f"\"{t['title'][:30]}\" → {j[0]['fullName']} (%{j[0]['match']})"

@check("Ticket yazışması + cevap taslağı")
def _():
    t = next((t for t in S["tickets"] if t["status"] == "in_progress"), S["tickets"][0])
    m = c.get(f"{API}/api/tickets/{t['id']}/messages", headers=H(S["tok"])).json()
    d = c.post(f"{API}/api/tickets/{t['id']}/reply-draft", headers=H(S["tok"]), timeout=150).json()
    assert d.get("draft"), "taslak boş"
    how = "yapay zekâ yazdı" if d.get("aiGenerated") else "şablonla (Ollama kapalı/yavaş)"
    return (OK if d.get("aiGenerated") else WARN), f"{len(m)} mesaj · taslak {how} · {len(d.get('sources', []))} kaynak"

@check("Rozetler")
def _():
    j = c.get(f"{API}/api/performance/badges", headers=H(S["tok"])).json()
    return (OK if j else WARN), f"{len(j)} rozet" + (": " + ", ".join(f"{b['emoji']} {b['name']}" for b in j[:3]) if j else "")

# ------------------------------------------------------------------ yapay zekâ ve OCR
@check("RAG servisi + Ollama")
def _():
    j = c.get(f"{RAG}/health").json()
    S["rag"] = j
    if j.get("ollama") != "ok":
        return WARN, "RAG çalışıyor ama Ollama'ya ulaşamıyor → 'ollama serve' açık mı? (asistan güvenli modda)"
    return OK, f"{j['embed_model']} + {j['llm_model']} · eşik {j['threshold']}"

@check("Asistan araması (RAG, VPN sorusu)")
def _():
    r = c.post(f"{RAG}/search", json={"tenant_id": S["me"]["tenantId"], "query": "VPN bağlanmıyor ne yapmalıyım"}, timeout=120).json()
    top = r["results"][0] if r["results"] else None
    assert top and "VPN" in top["title"], f"beklenen VPN makalesi gelmedi: {top and top['title']}"
    return (OK if r["mode"] == "hybrid" else WARN), f"mod: {r['mode']} · ilk sonuç: \"{top['title']}\" (güvenilir: {top['confident']})"

@check("Ekran görüntüsü okuma (OCR)")
def _():
    if S.get("rag", {}).get("ocr") != "ok":
        return WARN, "Tesseract kurulu değil (rag imajını --build ile yeniden oluşturun)"
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (900, 160), "white")
    try:
        font = ImageFont.load_default(size=40)
    except TypeError:
        font = ImageFont.load_default()
    ImageDraw.Draw(img).text((30, 50), "Hata 809: Uzak sunucu yanit vermiyor", fill="black", font=font)
    buf = io.BytesIO(); img.save(buf, "PNG")
    r = c.post(f"{API}/api/ocr", headers=H(S["tok"]), files={"file": ("test.png", buf.getvalue(), "image/png")}, timeout=60)
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text[:120]}"
    j = r.json()
    assert "809" in (j.get("title", "") + " ".join(j.get("codes", []))), f"okunan: {j.get('title')!r}"
    return OK, f"okunan: \"{j['title']}\""

@check("Doküman içe aktarma (önizleme)")
def _():
    md = "# Test el kitabı\n\nBu bölüm otomatik kontrol için oluşturuldu ve kaydedilmez.\n\n## Yazıcı kurulumu\n\nAyarlar > Yazıcılar bölümünden Kat2-Yazıcı'yı ekleyin.\n"
    r = c.post(f"{API}/api/kb/import/preview", headers=H(S["tok"]), files={"file": ("test.md", md.encode(), "text/markdown")}, timeout=60)
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text[:120]}"
    secs = r.json()["sections"]
    assert len(secs) == 2, f"{len(secs)} bölüm (2 bekleniyordu)"
    return OK, "2 bölüm bulundu: " + ", ".join(f'"{x["title"]}"' for x in secs) + " (kaydedilmedi)"

# ------------------------------------------------------------------ e-posta, canlı, güvenlik
@check("E-posta (şifre sıfırlama → Mailpit)")
def _():
    before = time.time()
    r = c.post(f"{API}/api/auth/forgot-password", json={"email": "ayse@anka.com"})
    assert r.status_code == 200, f"HTTP {r.status_code}"
    for _ in range(10):
        time.sleep(0.5)
        try:
            j = c.get(f"{MAIL}/api/v1/search", params={"query": "to:ayse@anka.com"}).json()
        except httpx.HTTPError:
            return WARN, "Mailpit'e ulaşılamadı (gerçek SMTP ayarlıysa normal; gelen kutusuna bakın)"
        if any(time.mktime(time.strptime(m["Created"][:19], "%Y-%m-%dT%H:%M:%S")) >= before - 120 for m in j.get("messages", [])):
            return OK, "e-posta Mailpit'te (http://localhost:8025)"
    return FAIL, "e-posta 5 sn içinde Mailpit'e düşmedi (docker logs platform-api)"

@check("Canlı güncelleme (SignalR)")
def _():
    r = c.post(f"{API}/hubs/live/negotiate", params={"negotiateVersion": 1}, headers=H(S["tok"]))
    assert r.status_code == 200 and "connectionId" in r.text, f"HTTP {r.status_code}"
    return OK, "bağlantı kurulabiliyor"

@check("Firma izolasyonu (Mavi ↔ Anka)")
def _():
    tok, me = login("yonetici@mavi.com")
    mavi_tickets = c.get(f"{API}/api/tickets", headers=H(tok)).json()
    anka_ids = {t["id"] for t in S["tickets"]}
    assert not any(t["id"] in anka_ids for t in mavi_tickets), "Mavi, Anka'nın ticket'larını görüyor!"
    one = S["tickets"][0]["id"]
    r = c.get(f"{API}/api/tickets/{one}/messages", headers=H(tok))
    assert r.status_code in (403, 404), f"Mavi, Anka ticket'ının mesajlarına erişebildi (HTTP {r.status_code})"
    s = c.post(f"{RAG}/search", json={"tenant_id": me["tenantId"], "query": "Anka Connect VPN bağlanmıyor"}, timeout=120).json()
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
    j = c.get(f"{API}/api/audit", params={"onlySecurity": True, "days": 1}, headers=H(S["tok"])).json()
    assert any("Giriş" in a["action"] for a in j), "giriş kayıtları görünmüyor"
    return OK, f"son 24 saatte {len(j)} güvenlik kaydı"

@check("Sistem durumu")
def _():
    j = c.get(f"{API}/api/system/status", headers=H(S["tok"]), timeout=30).json()
    bad = [f"{x['name']}: {x['detail']}" for x in j["checks"] if x["status"] != "ok"]
    return (OK if j["overall"] == "ok" else WARN), ("her şey yolunda" if not bad else " | ".join(bad)[:150])

# ------------------------------------------------------------------ özet
print("-" * 78)
fails = [r for r in results if r[0] == FAIL]
warns = [r for r in results if r[0] == WARN]
skips = [r for r in results if r[0] == SKIP]
print(f"Sonuç: {len(results) - len(fails) - len(warns) - len(skips)} başarılı, {len(warns)} uyarı, {len(fails)} hata, {len(skips)} atlandı\n")
names = {n for _, n, _ in fails}
if names & {"API ayakta (/health)", "Giriş: yonetici@anka.com"}:
    print("İpucu: API çalışmıyor ya da giriş yapılamıyor. Sırayla bakın:")
    print("  docker compose ps                      → platform-api 'Up' mu?")
    print("  docker logs platform-api --tail 60     → kırmızı hata satırını bana iletin")
    print("  Migration oluşturuldu mu? (dotnet ef migrations add …) ve 'docker compose down -v' yapıldı mı?\n")
if fails:
    print("Hatalar (bunları bana iletin):")
    for _, n, d in fails:
        print(f"  ✗ {n}: {d}")
    print()
sys.exit(1 if fails else 0)
