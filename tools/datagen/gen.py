"""Demo verisi üreticisi. Çıktı: out/seed.json (backend Seeder okur) ve out/eval.json (RAG doğrulama seti).
Zamanlar "kaç saat/gün önce" olarak tutulur; veri her kurulduğunda güncel görünür. Aynı tohumla hep aynı veri çıkar."""
import json, random, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from articles import A, MAVI, GAPS

R = random.Random(42)

# ---------------- Kişiler ----------------
MGR = ("yonetici@anka.com", "Zeynep Kaya", "Manager")
ADMIN = ("admin@anka.com", "Kerem Aydın", "Admin")
IT = {  # destek ekibi: kim hangi konuda uzman, ne hızda çözer (saat aralığı)
    "ali@anka.com": ("Ali Çelik", ["Ağ/VPN", "Erişim/Hesap"], (0.4, 3)),
    "mehmet@anka.com": ("Mehmet Yıldız", ["Yazılım/Lisans", "Ağ/VPN"], (2, 14)),
    "ayse@anka.com": ("Ayşe Demir", ["E-posta", "Erişim/Hesap", "Diğer"], (1, 6)),
    "emre@anka.com": ("Emre Koç", ["Donanım"], (4, 30)),
}
STAFF = [("selin@anka.com", "Selin Arslan"), ("burak@anka.com", "Burak Şahin"), ("can@anka.com", "Can Öztürk"),
         ("gizem@anka.com", "Gizem Yalçın"), ("hakan@anka.com", "Hakan Polat"), ("ozge@anka.com", "Özge Kurt"),
         ("murat@anka.com", "Murat Eren"), ("ece@anka.com", "Ece Tunç"), ("baris@anka.com", "Barış Kaplan"),
         ("sevgi@anka.com", "Sevgi Aksoy"), ("onur@anka.com", "Onur Çakır"), ("pinar@anka.com", "Pınar Güneş")]
DEPT = {"yonetici@anka.com": "IT Destek", "admin@anka.com": "Bilgi İşlem", "ali@anka.com": "IT Destek", "mehmet@anka.com": "IT Destek", "ayse@anka.com": "Muhasebe", "emre@anka.com": "IT Destek", "selin@anka.com": "İnsan Kaynakları", "burak@anka.com": "Satış", "can@anka.com": "Operasyon", "gizem@anka.com": "Muhasebe", "hakan@anka.com": "Lojistik", "ozge@anka.com": "Satış", "murat@anka.com": "Operasyon", "ece@anka.com": "İnsan Kaynakları", "baris@anka.com": "Lojistik", "sevgi@anka.com": "Muhasebe", "onur@anka.com": "Depo", "pinar@anka.com": "Satış", "yonetici@mavi.com": "Yönetim", "deniz@mavi.com": "Yazılım", "tolga@mavi.com": "Yazılım"}  # departmanlar (kullanıcı adının altında görünür)
users = [dict(email=MGR[0], name=MGR[1], role=MGR[2]), dict(email=ADMIN[0], name=ADMIN[1], role=ADMIN[2])]
# Ali ve Mehmet "Destek uzmanı" (tüm kuyruğu görür); Ayşe ve Emre çalışan olup sadece kendilerine atananları çözer
AGENTS = {"ali@anka.com", "mehmet@anka.com"}
users += [dict(email=e, name=v[0], role="Agent" if e in AGENTS else "Employee") for e, v in IT.items()]
users += [dict(email=e, name=n, role="Employee") for e, n in STAFF]
for _u in users:
    _u["department"] = DEPT.get(_u["email"])
reporters = [e for e, _ in STAFF] + list(IT)  # IT ekibi de bazen ticket açar

def solver_for(cat):
    cands = [(e, v) for e, v in IT.items() if cat in v[1]]
    # birincil uzman %75 ihtimalle, diğerleri kalan
    e, v = cands[0] if R.random() < 0.75 or len(cands) == 1 else R.choice(cands[1:])
    h = R.uniform(*v[2])
    if R.random() < 0.18:   # parça/tedarikçi/onay beklenen işler: uzun kuyruk
        h *= R.uniform(3, 8)
    return e, h

VARIANT = ["", "", "", " (acil)", " - tekrar", " - Kat 2", " - Kat 3", ", yardım"]

# ---------------- Ticket'lar ----------------
tickets = []
def ticket(title, desc, cat, rep, hours_ago, status, solver=None, fix=None, solve_h=None, prio=None):
    tickets.append(dict(title=title, description=desc, category=cat, priority=prio or R.choices(["Low", "Medium", "High", "Critical"], [2, 6, 3, 0.4])[0],
                        reporter=rep, assignee=solver, status=status, hoursAgo=round(hours_ago, 2),
                        resolvedAfterHours=None if solve_h is None else round(solve_h, 2), resolution=fix))

# a) Geçmiş: çözülmüş ticket'lar (3-90 gün önce)
for a in A:
    for (tt, td, fix) in a["tickets"]:
        for _ in range(R.randint(3, 6)):
            s, h = solver_for(a["category"])
            hrs = R.uniform(72, 90 * 24)
            ticket(tt + R.choice(VARIANT), td, a["category"], R.choice(reporters), hrs,
                   R.choice(["resolved", "closed", "closed"]), s, fix, h)
for g in GAPS:
    for (tt, td, fix) in g["tickets"]:
        for _ in range(R.randint(1, 3)):
            s, h = solver_for(g["category"])
            ticket(tt + R.choice(VARIANT[:3]), td, g["category"], R.choice(reporters), R.uniform(48, 40 * 24), "resolved", s, fix, h)

# b) Şu an açık işler: farklı konulardan, son 3 gün
open_pool = R.sample([(a, t) for a in A for t in a["tickets"] if a["category"] != "Ağ/VPN"], 16)
for a, (tt, td, _) in open_pool:
    st = R.choice(["open", "open", "assigned", "in_progress"])
    s = solver_for(a["category"])[0] if st != "open" else None
    ticket(tt, td, a["category"], R.choice([e for e, _ in STAFF]), R.uniform(3, 70), st, s)

# c) Ticket seli: son 2 saatte aynı VPN sorunu (olay birleştirme demosu)
FLOOD = [("VPN'e bağlanamıyorum", "Sabahtan beri VPN bağlanmıyor, sunucuya ulaşılamıyor hatası veriyor.", "selin@anka.com", 1.9),
         ("VPN bağlantısı sürekli kopuyor", "Bağlanıyor ama 1 dakika sonra VPN bağlantısı kopuyor.", "burak@anka.com", 1.6),
         ("Evden VPN bağlanmıyor", "Evden çalışıyorum, VPN bağlanmıyor, dosya sunucusuna erişemiyorum.", "can@anka.com", 1.2),
         ("VPN bağlantı hatası", "VPN istemcisi 'sunucuya ulaşılamıyor' diyor.", "gizem@anka.com", 0.8),
         ("VPN bağlanmıyor acil", "Müşteri toplantım var, VPN bağlanmıyor.", "hakan@anka.com", 0.4),
         ("VPN çalışmıyor", "Anka Connect bağlanmıyor, sabah sorun yoktu.", "ozge@anka.com", 0.2)]
for t, d, r, h in FLOOD:
    ticket(t, d, "Ağ/VPN", r, h, "open", prio="High" if "acil" not in t else "Critical")

# ---------------- Asistana sorulan sorular ----------------
questions = []
for a in A:
    for q in a["questions"]:
        for _ in range(R.randint(1, 3)):
            questions.append(dict(user=R.choice(reporters), question=q, answered=True, daysAgo=round(R.uniform(0.5, 60), 2)))
for g in GAPS:
    for q in g["questions"]:
        questions.append(dict(user=R.choice(reporters), question=q, answered=False, daysAgo=round(R.uniform(0.5, 30), 2)))
for q in ["Bugün hava nasıl olacak", "Yemekhanede bugün ne var", "En iyi kahve nerede içilir"]:
    questions.append(dict(user=R.choice(reporters), question=q, answered=False, daysAgo=round(R.uniform(1, 40), 2)))

# ---------------- Projeler ve sprintler ----------------
def I(type, title, status="todo", assignee=None, points=None, sprint=None, parent=None, prio="Medium", labels=(), desc="",
      start=None, due=None, doneDaysAgo=None):
    return dict(type=type, title=title, status=status, assignee=assignee, points=points, sprint=sprint, parent=parent,
                priority=prio, labels=list(labels), description=desc, startDays=start, dueDays=due, doneDaysAgo=doneDaysAgo)

vpn = dict(key="ANK", name="VPN Geçişi", description="Şirket VPN altyapısının Anka Connect'e taşınması",
           manager=MGR[0], members=[MGR[0], "ali@anka.com", "mehmet@anka.com", "ayse@anka.com", "emre@anka.com"],
           sprints=[dict(name="ANK Sprint 1", goal="Altyapı hazırlığı", status="closed", startDays=-40, endDays=-26),
                    dict(name="ANK Sprint 2", goal="Pilot kullanıcı grubu", status="closed", startDays=-26, endDays=-12),
                    dict(name="ANK Sprint 3", goal="Tüm şirkete yaygınlaştırma", status="active", startDays=-10, endDays=4),
                    dict(name="ANK Sprint 4", goal="Eski sistemin kapatılması", status="planned")],
           items=[
    I("Epic", "VPN altyapısı", "done", MGR[0], start=-40, due=-12, doneDaysAgo=12),            # ANK-1
    I("Epic", "Kullanıcı geçişi", "in_progress", MGR[0], start=-26, due=4),                     # ANK-2
    I("Epic", "Eski VPN'in kapatılması", "todo", MGR[0], start=4, due=25),                      # ANK-3
    # Sprint 1 (kapalı) — 18 puan bitti
    I("Task", "Yeni VPN sunucularını kur", "done", "ali@anka.com", 8, 0, "ANK-1", "High", ["altyapı"], doneDaysAgo=30),
    I("Task", "Sertifika altyapısını hazırla", "done", "mehmet@anka.com", 5, 0, "ANK-1", "High", ["güvenlik"], doneDaysAgo=28),
    I("Task", "Güvenlik duvarı kurallarını tanımla", "done", "ali@anka.com", 5, 0, "ANK-1", labels=["altyapı"], doneDaysAgo=27),
    # Sprint 2 (kapalı) — 16 puan bitti
    I("Story", "Pilot grup (IT ekibi) Anka Connect'e geçsin", "done", "ali@anka.com", 5, 1, "ANK-2", doneDaysAgo=19),
    I("Task", "Anka Connect'i Yazılım Merkezi'ne ekle", "done", "mehmet@anka.com", 3, 1, "ANK-2", doneDaysAgo=17),
    I("Task", "Kurulum makalesini bilgi bankasına yaz", "done", "ayse@anka.com", 3, 1, "ANK-2", labels=["doküman"], doneDaysAgo=15),
    I("Bug", "Pilotta MFA bildirimi gecikiyor", "done", "mehmet@anka.com", 5, 1, "ANK-2", "High", ["güvenlik"], doneDaysAgo=13),
    # Sprint 3 (aktif, riskli) — 26 puan
    I("Story", "Tüm çalışanlar Anka Connect'i kurabilmeli", "in_progress", "ayse@anka.com", 8, 2, "ANK-2", "High", ["kullanıcı"], start=-10, due=4),
    I("Task", "Yük dengeleyiciyi yapılandır", "todo", "ali@anka.com", 8, 2, "ANK-2", "High", ["altyapı"], due=-1),
    I("Task", "Geçiş duyurusunu tüm şirkete gönder", "done", "ayse@anka.com", 2, 2, "ANK-2", doneDaysAgo=6),
    I("Bug", "Windows 11'de eski istemci bağlantıyı düşürüyor", "in_review", "mehmet@anka.com", 3, 2, None, "Critical", ["windows"]),
    I("Task", "Evden çalışanlar için SSS hazırla", "todo", "ayse@anka.com", 3, 2, "ANK-2", labels=["doküman"]),
    I("Task", "Kat bazlı kurulum takvimi çıkar", "done", "emre@anka.com", 2, 2, "ANK-2", doneDaysAgo=3),
    I("Task", "VPN izleme panosu kur", "todo", None, 0, 2, None, "Low", ["altyapı"]),
    # Sprint 4 (planlı) ve backlog
    I("Task", "Eski VPN sunucusunu kapat", "todo", "ali@anka.com", 3, 3, "ANK-3", labels=["altyapı"]),
    I("Task", "Eski istemciyi tüm cihazlardan kaldır", "todo", "emre@anka.com", 5, 3, "ANK-3"),
    I("Story", "Yöneticiler VPN kullanım raporunu görebilmeli", "todo", None, 5, None, None, "Low"),
    I("Task", "VPN log saklama süresini KVKK'ya göre ayarla", "todo", None, 3, None, None, "Medium", ["güvenlik"]),
],
           # ANK-12 (yük dengeleyici) → ANK-11 ve ANK-15'i engelliyor
           links=[("ANK-12", "ANK-11", "blocks"), ("ANK-12", "ANK-18", "blocks"), ("ANK-14", "ANK-11", "relates")],
           comments=[("ANK-12", "ali@anka.com", "Lisans anahtarı tedarikçiden henüz gelmedi, bekliyorum."),
                     ("ANK-11", "ayse@anka.com", "Yük dengeleyici hazır olmadan 3. ve 4. katlara kurulum yapamıyoruz."),
                     ("ANK-14", "mehmet@anka.com", "Düzeltme hazır, @Ali Çelik incelemesini bekliyor.")])

erp = dict(key="ERP", name="ERP Entegrasyonu", description="Logo ERP ile destek platformunun entegrasyonu",
           manager=MGR[0], members=[MGR[0], "mehmet@anka.com", "ayse@anka.com"], sprints=[],
           items=[
    I("Epic", "Analiz ve tasarım", "done", MGR[0], start=-30, due=-10, doneDaysAgo=10),
    I("Epic", "Masraf modülü entegrasyonu", "in_progress", "mehmet@anka.com", start=-8, due=14),
    I("Epic", "Raporlama", "todo", "ayse@anka.com", start=12, due=35),
    I("Task", "Mevcut süreçlerin analizi", "done", "ayse@anka.com", 5, None, "ERP-1", start=-30, due=-20, doneDaysAgo=20),
    I("Task", "Veri modeli tasarımı", "done", "mehmet@anka.com", 8, None, "ERP-1", start=-20, due=-10, doneDaysAgo=11),
    I("Story", "Çalışan masraf formunu platformdan gönderebilmeli", "in_progress", "mehmet@anka.com", 8, None, "ERP-2", "High", start=-8, due=6),
    I("Task", "Logo API bağlantısı", "in_review", "mehmet@anka.com", 5, None, "ERP-2", start=-8, due=0),
    I("Task", "Onay akışı (yönetici → muhasebe)", "todo", "ayse@anka.com", 5, None, "ERP-2", start=2, due=14),
    I("Task", "Aylık masraf raporu", "todo", None, 5, None, "ERP-3", start=12, due=30),
], links=[("ERP-7", "ERP-6", "blocks")], comments=[])

anka = dict(name="Anka Lojistik", users=users, projects=[vpn, erp],
            articles=[dict(title=a["title"], category=a["category"], body=a["body"]) for a in A],
            tickets=tickets, questions=questions,
            filters=[dict(project="ANK", owner=MGR[0], name="Açık buglar", query='{"type":"Bug"}', shared=True)])

mavi = dict(name="Mavi Yazılım",
            users=[dict(email="yonetici@mavi.com", name="Can Arslan", role="Manager"),
                   dict(email="deniz@mavi.com", name="Deniz Şahin", role="Employee"),
                   dict(email="tolga@mavi.com", name="Tolga Er", role="Employee")],
            projects=[dict(key="MAV", name="Web Sitesi Yenileme", description="Kurumsal web sitesinin yenilenmesi",
                           manager="yonetici@mavi.com", members=["yonetici@mavi.com", "deniz@mavi.com", "tolga@mavi.com"], sprints=[],
                           items=[I("Epic", "Yeni tasarım", "in_progress", "yonetici@mavi.com", start=-5, due=20),
                                  I("Task", "Ana sayfa taslağı", "in_progress", "deniz@mavi.com", 3, None, "MAV-1"),
                                  I("Task", "İletişim formu", "todo", "tolga@mavi.com", 2, None, "MAV-1")],
                           links=[], comments=[])],
            articles=MAVI,
            tickets=[dict(title="Laptop çok ısınıyor", description="Derleme sırasında fan bağırıyor.", category="Donanım", priority="Medium",
                          reporter="deniz@mavi.com", assignee=None, status="open", hoursAgo=20, resolvedAfterHours=None, resolution=None),
                     dict(title="GitLab'a giremiyorum", description="2FA kodu kabul edilmiyor.", category="Erişim/Hesap", priority="High",
                          reporter="tolga@mavi.com", assignee="yonetici@mavi.com", status="resolved", hoursAgo=200, resolvedAfterHours=3,
                          resolution="Telefon saati senkronize edildi, 2FA kodu kabul edildi.")],
            questions=[dict(user="deniz@mavi.com", question="WireGuard nasıl kurulur", answered=True, daysAgo=3)], filters=[])

os.makedirs(os.path.join(os.path.dirname(__file__), "out"), exist_ok=True)
seed = dict(version=2, password="Demo123!", tenants=[anka, mavi])
with open(os.path.join(os.path.dirname(__file__), "out", "seed.json"), "w", encoding="utf-8") as f:
    json.dump(seed, f, ensure_ascii=False, indent=1)

print(f"Anka: {len(users)} kişi, {len(A)} makale, {len(tickets)} ticket "
      f"({sum(t['status'] in ('resolved','closed') for t in tickets)} çözülmüş), {len(questions)} soru, "
      f"{len(vpn['items']) + len(erp['items'])} iş")
