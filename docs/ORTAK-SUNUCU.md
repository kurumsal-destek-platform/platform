# Ortak takım sunucusu

Her geliştirici kendi bilgisayarında `docker compose up` çalıştırınca **kendi ayrı kopyasını** açar: veritabanı,
ticket'lar ve e-postalar o bilgisayara özeldir. Bu yüzden birinin açtığı ticket'ı diğerleri görmez.

Herkesin **aynı veriyi** görmesi için sistem tek bir bilgisayarda ("sunucu") çalışır, diğerleri ona tarayıcıdan bağlanır.
Kod paylaşımı yine GitHub üzerinden olur; sunucu her zaman `main`'in son halini çalıştırır.

```
  Geliştirici 1 ─┐                       ┌───────── Sunucu bilgisayar ─────────┐
  Geliştirici 2 ─┼── http://SUNUCU:5173 ──▶ web (nginx) ─┬─ /api, /hubs → API │
  Geliştirici 3 ─┘    (Tailscale ile)     │              ├─ /mail/ → Mailpit   │
                                          │              └─ veritabanı, RAG    │
                                          └────────────────────────────────────┘
```

Tek adres yeterli: uygulama, API ve e-posta kutusu aynı `:5173` adresinden açılır.

## 1. Sunucu bilgisayarı seçin (bir kez)
Sunum/demo süresince **açık kalabilecek**, Ollama'nın kurulu olduğu, RAM'i en yüksek bilgisayar (16 GB önerilir).

## 2. Ağ: Tailscale (bir kez, herkes)
Farklı evlerde/ağlarda olsanız da bilgisayarları özel bir ağda birleştirir; kişisel kullanım için ücretsizdir.
1. Herkes https://tailscale.com/download adresinden Tailscale'i kurar ve **aynı hesaba/ağa** girer
   (sunucu sahibi diğerlerini Tailscale yönetim panelinden davet eder).
2. Sunucu bilgisayarda Tailscale simgesi → **My IP** (ör. `100.101.102.103`). Bu takımın adresidir.
3. Sunucu bilgisayarda, **yönetici olarak açılmış** PowerShell'de bir kez:
   ```powershell
   New-NetFirewallRule -DisplayName "Destek Platformu" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
   ```

> Aynı Wi-Fi'deyseniz Tailscale gerekmez: sunucunun yerel IP'sini (`ipconfig` → IPv4, ör. `192.168.1.25`) kullanın.

## 3. Sunucuyu ayarlayın (bir kez)
Proje klasöründeki `.env` dosyasına (yoksa `.env.example`'ı kopyalayın) ekleyin:
```
APP_URL=http://100.101.102.103:5173
```
E-postalardaki "Ticket'ı görüntüle" bağlantıları bu adresi kullanır. Sonra:
```powershell
docker compose up -d --build
```

## 4. Takım arkadaşları
Tarayıcıda: **http://100.101.102.103:5173** · e-postalar: **http://100.101.102.103:5173/mail/**
Kendi bilgisayarınızda Docker çalıştırmanız gerekmez (sadece kod yazarken kendi kopyanızda deneyin).

## 5. Her PR merge edildikten sonra (sunucuda)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\sunucu-guncelle.ps1
```
`main`'i çeker, yeniden derler ve takım adresini yazar. Veritabanı korunur.

## Çalışma düzeni
| Ne | Nerede |
|---|---|
| Kod yazmak, denemek | Kendi bilgisayarınız (`localhost:5173`), kendi dalınız |
| Kodu paylaşmak | GitHub: dal → PR → onay → merge |
| Ortak veriyle test, demo | Ortak sunucu (`http://SUNUCU:5173`) |

## Sorun giderme
- **Sayfa açılmıyor:** Sunucu açık mı, Docker Desktop çalışıyor mu, Tailscale ikinizde de bağlı mı? Güvenlik duvarı kuralı (adım 2.3) eklendi mi?
- **Sayfa açılıyor ama giriş "Network Error":** Sunucuda `docker compose up -d --build web` (arayüz yeni ayarla derlenmeli).
- **Demo verisini sıfırlamak:** sunucuda `docker compose down -v` → `docker compose up -d` (herkesin verisi silinir, haber verin).
