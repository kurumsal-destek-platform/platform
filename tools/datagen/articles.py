# Anka Lojistik bilgi bankası: gerçekçi IT/ofis destek makaleleri.
# Her makale için: başlık, kategori, gövde, ve bu makaleyle çözülen tipik ticket şablonları
# (başlık, açıklama, çözüm notu). Ticket'lar ve asistan soruları bu şablonlardan üretilir.

A = []  # (title, category, body, [(ticket_title, ticket_desc, resolution)], [user_questions])

def art(title, cat, body, tickets, questions):
    A.append(dict(title=title, category=cat, body=body.strip(), tickets=tickets, questions=questions))

# ---------------- Ağ/VPN ----------------
art("VPN bağlanmıyor", "Ağ/VPN", """
VPN istemcisi (Anka Connect) bağlanmıyorsa sırayla şunları deneyin:
1) İnternet bağlantınızın çalıştığını bir web sitesi açarak kontrol edin.
2) Anka Connect'i sağ alttaki simgeden tamamen kapatıp yeniden açın.
3) Sunucu adresinin vpn.anka.com.tr olduğundan emin olun.
4) Kullanıcı adınızı 'anka\\kullaniciadi' biçiminde, şirket şifrenizle girin.
5) Telefonunuzdaki Authenticator bildirimini 60 saniye içinde onaylayın.
6) Hâlâ bağlanmıyorsa bilgisayarı yeniden başlatın ve 'Ağ/VPN' kategorisinde ticket açın; ekran görüntüsü ekleyin.
""", [
    ("VPN'e bağlanamıyorum", "Anka Connect 'sunucuya ulaşılamıyor' diyor.", "Sunucu adresi eski kalmıştı, vpn.anka.com.tr olarak düzeltildi."),
    ("VPN bağlantısı kurulmuyor", "Şifremi giriyorum ama bağlanmıyor.", "Kullanıcı adı 'anka\\' ön eki olmadan girilmişti, düzeltildi."),
    ("Evden VPN çalışmıyor", "Evden bağlanamıyorum, ofiste sorun yok.", "Ev modemindeki VPN engelleme ayarı kapatıldı, bağlantı sağlandı."),
], ["VPN bağlanmıyor ne yapmalıyım", "Anka Connect bağlanmıyor", "Evden VPN'e nasıl bağlanırım"])

art("VPN bağlantısı sık sık kopuyor", "Ağ/VPN", """
Bağlantı birkaç dakikada bir kopuyorsa:
1) Wi-Fi yerine mümkünse kablolu bağlantı kullanın.
2) Anka Connect > Ayarlar > 'Bağlantı koptuğunda otomatik yeniden bağlan' seçeneğini açın.
3) Güç ayarlarında 'Ağ bağdaştırıcısının gücünü kapatmasına izin ver' seçeneğini kaldırın (Aygıt Yöneticisi > Ağ bağdaştırıcıları > Özellikler > Güç Yönetimi).
4) Anka Connect sürümünüz 5.2'den eskiyse Yazılım Merkezi'nden güncelleyin.
""", [
    ("VPN sürekli kopuyor", "Her 5 dakikada bir VPN bağlantısı düşüyor.", "Ağ bağdaştırıcısının güç tasarrufu kapatıldı, kopma bitti."),
    ("VPN bağlantısı düşüyor", "Toplantı sırasında VPN kopuyor.", "Anka Connect 5.2 sürümüne güncellendi."),
], ["VPN neden kopuyor", "VPN bağlantım sürekli düşüyor"])

art("VPN istemcisi kurulumu (Anka Connect)", "Ağ/VPN", """
Yeni bilgisayara VPN kurmak için:
1) Başlat menüsünden 'Yazılım Merkezi'ni açın.
2) 'Anka Connect' uygulamasını bulun ve 'Yükle'ye tıklayın.
3) Kurulum bitince bilgisayarı yeniden başlatın.
4) Anka Connect'i açın, sunucu olarak vpn.anka.com.tr yazın ve şirket hesabınızla giriş yapın.
Kişisel bilgisayarlara VPN kurulmaz; sadece şirket cihazları desteklenir.
""", [
    ("VPN programı yüklü değil", "Yeni laptopumda VPN yok.", "Yazılım Merkezi'nden Anka Connect kuruldu."),
    ("VPN istemcisi açılmıyor", "Program açılır açılmaz kapanıyor.", "Anka Connect kaldırılıp güncel sürüm yeniden kuruldu."),
], ["VPN programını nasıl kurarım", "Yeni bilgisayara VPN kurulumu"])

art("Ofis Wi-Fi ağına bağlanma", "Ağ/VPN", """
Şirket cihazları 'Anka-Kurumsal' ağına otomatik bağlanır. Bağlanmıyorsa:
1) Wi-Fi listesinde 'Anka-Kurumsal' ağını seçip 'Unut' deyin.
2) Tekrar seçin; kullanıcı adı olarak şirket e-postanızı, şifre olarak şirket şifrenizi girin.
3) Sertifika uyarısı çıkarsa 'Bağlan'ı seçin.
Misafirler ve kişisel telefonlar için 'Anka-Misafir' ağı kullanılır; şifresi resepsiyondadır ve her pazartesi değişir.
""", [
    ("Wi-Fi'ye bağlanamıyorum", "Anka-Kurumsal şifremi kabul etmiyor.", "Ağ profili silinip yeniden eklendi, cihaz sertifikası yenilendi."),
    ("Misafir Wi-Fi şifresi", "Ziyaretçimiz için internet lazım.", "Anka-Misafir ağının güncel şifresi resepsiyondan iletildi."),
], ["Wi-Fi şifresi nedir", "Misafir internet şifresi", "Telefonumu ofis Wi-Fi'ye nasıl bağlarım"])

art("İnternet çok yavaş", "Ağ/VPN", """
İnternet yavaşsa:
1) speedtest.anka.local adresinden hız testi yapın; 20 Mbps altındaysa not alın.
2) VPN açıksa ve ofisteyseniz VPN'i kapatın; ofiste VPN gerekmez.
3) Arka planda büyük dosya senkronizasyonu (OneDrive) olup olmadığını kontrol edin.
4) Sorun tüm katta varsa 'Ağ/VPN' kategorisinde ticket açın ve kat bilgisini yazın.
""", [
    ("İnternet çok yavaş", "Sayfalar çok geç açılıyor.", "Ofiste gereksiz açık olan VPN kapatıldı, hız normale döndü."),
    ("Dosya indirme çok yavaş", "Paylaşımlı klasörden dosya inmiyor.", "OneDrive senkronizasyonu duraklatıldı, indirme hızlandı."),
], ["İnternetim neden yavaş", "Hız testi nasıl yapılır"])

art("Paylaşımlı klasöre (dosya sunucusu) erişim", "Ağ/VPN", """
Ortak klasörler \\\\dosya.anka.local adresindedir.
1) Dosya Gezgini'nin adres çubuğuna \\\\dosya.anka.local yazın.
2) Evden çalışıyorsanız önce VPN'e bağlanın.
3) 'Erişim reddedildi' hatasında klasör sahibinin onayı gerekir; 'Erişim/Hesap' kategorisinde klasör adını yazarak ticket açın.
""", [
    ("Ortak klasöre giremiyorum", "Muhasebe klasörü erişim reddedildi diyor.", "Klasör sahibi onayıyla kullanıcı Muhasebe-Okuma grubuna eklendi."),
    ("Dosya sunucusu görünmüyor", "Z: sürücüsü kayboldu.", "Ağ sürücüsü \\\\dosya.anka.local olarak yeniden eşlendi."),
], ["Ortak klasöre nasıl erişirim", "Z sürücüsü kayboldu"])

# ---------------- E-posta ----------------
art("Outlook e-postaları senkronize etmiyor", "E-posta", """
Yeni e-postalar gelmiyorsa:
1) Outlook'un sağ altında 'Bağlantı kesildi' yazıyor mu bakın; yazıyorsa internetinizi kontrol edin.
2) Gönder/Al > Tüm Klasörleri Gönder/Al'a tıklayın.
3) Outlook'u kapatın, Denetim Masası > Posta > Profiller > Profili onar adımını uygulayın.
4) Posta kutunuz %95 doluysa eski e-postaları arşivleyin (bkz. 'Posta kutusu dolu' makalesi).
""", [
    ("Outlook mail almıyor", "Dünden beri yeni mail gelmedi.", "Outlook profili onarıldı, senkronizasyon düzeldi."),
    ("E-postalar gelmiyor", "Gelen kutusu güncellenmiyor.", "Çevrimdışı çalış modu açık kalmıştı, kapatıldı."),
], ["Outlook mail gelmiyor", "E-postalarım senkronize olmuyor"])

art("Posta kutusu dolu uyarısı", "E-posta", """
Posta kutusu kotası 50 GB'dır. Dolduğunda e-posta gönderemezsiniz.
1) Outlook > Dosya > Araçlar > Posta Kutusu Temizleme'yi açın.
2) 'Silinmiş Öğeler'i boşaltın.
3) 1 yıldan eski e-postaları Arşiv klasörüne taşıyın (Dosya > Araçlar > Eski Öğeleri Temizle).
4) Büyük ekli e-postaları bulmak için arama kutusuna 'boyut:çok büyük' yazın.
Kota artırımı sadece yönetici onayıyla yapılır.
""", [
    ("Posta kutum dolu", "Mail gönderemiyorum, kutu dolu diyor.", "Silinmiş öğeler boşaltıldı ve eski mailler arşivlendi."),
], ["Posta kutusu dolu ne yapmalıyım", "Mail kotası nasıl artırılır"])

art("Outlook sürekli şifre soruyor", "E-posta", """
Outlook her açılışta şifre istiyorsa:
1) Outlook'u kapatın.
2) Başlat > 'Kimlik Bilgileri Yöneticisi' > Windows Kimlik Bilgileri'ni açın.
3) 'MicrosoftOffice' ve 'outlook' ile başlayan kayıtları silin.
4) Outlook'u açın, şirket e-postanız ve şifrenizle bir kez giriş yapın, 'Beni hatırla'yı işaretleyin.
Şifrenizi yakın zamanda değiştirdiyseniz bu adım mutlaka gereklidir.
""", [
    ("Outlook şifre soruyor", "Outlook sürekli şifre istiyor.", "Kimlik bilgileri yöneticisinden eski kayıtlar silindi."),
    ("Outlook giriş penceresi kapanmıyor", "Şifreyi doğru giriyorum yine soruyor.", "Eski kimlik bilgisi kaydı silindi, yeniden giriş yapıldı."),
], ["Outlook neden sürekli şifre istiyor"])

art("E-posta imzası oluşturma", "E-posta", """
Kurumsal imza şablonu zorunludur.
1) Outlook > Dosya > Seçenekler > Posta > İmzalar'ı açın.
2) 'Yeni'ye tıklayın, adını 'Anka' yapın.
3) intranet.anka.local/imza adresindeki şablonu kopyalayıp yapıştırın, kendi adınızı, unvanınızı ve dahili numaranızı yazın.
4) 'Yeni iletiler' ve 'Yanıtlar' için bu imzayı seçin.
""", [
    ("İmza ekleyemiyorum", "Kurumsal imza nasıl eklenir?", "Kullanıcıya imza şablonu ve ayar adımları iletildi."),
], ["Mail imzası nasıl eklenir", "Kurumsal imza şablonu nerede"])

art("Spam ve oltalama (phishing) e-postaları", "E-posta", """
Şüpheli bir e-posta aldıysanız:
1) Bağlantılara tıklamayın, ekleri açmayın.
2) Outlook'ta 'Oltalama Bildir' düğmesine basın; e-posta güvenlik ekibine iletilir.
3) Yanlışlıkla tıkladıysanız hemen şifrenizi değiştirin ve 'Erişim/Hesap' kategorisinde 'Acil' öncelikli ticket açın.
Anka IT ekibi sizden asla e-postayla şifre istemez.
""", [
    ("Şüpheli mail geldi", "Kargo firması adına link gönderilmiş.", "E-posta oltalama olarak raporlandı ve gönderen engellendi."),
    ("Oltalama linkine tıkladım", "Bir linke tıkladım, şifre istedi girdim.", "Şifre sıfırlandı, oturumlar kapatıldı, hesap 24 saat izlendi."),
], ["Şüpheli mail ne yapmalıyım", "Phishing maili nasıl bildiririm"])

art("E-posta eki açılmıyor", "E-posta", """
PDF veya Office ekleri açılmıyorsa:
1) Eki önce masaüstüne kaydedin, sonra açın.
2) PDF için Adobe Reader'ın yüklü olduğundan emin olun (Yazılım Merkezi).
3) Güvenlik nedeniyle .exe, .bat ve .js uzantılı ekler otomatik engellenir; bu dosyaları paylaşımlı klasör üzerinden isteyin.
""", [
    ("PDF ek açılmıyor", "Mail ekindeki PDF açılmıyor.", "Varsayılan PDF uygulaması Adobe Reader olarak ayarlandı."),
], ["Mail eki açılmıyor", "Ekler neden engelleniyor"])

# ---------------- Donanım ----------------
art("Yazıcı çıktı vermiyor", "Donanım", """
Yazıcıdan çıktı alamıyorsanız:
1) Yazıcının açık olduğunu ve ekranında hata olmadığını kontrol edin.
2) Bilgisayarda Ayarlar > Yazıcılar'dan katınızdaki yazıcıyı (ör. 'Kat2-Yazıcı') varsayılan yapın.
3) Yazdırma kuyruğunu açıp takılı işleri iptal edin.
4) Kuyruk temizlenmiyorsa bilgisayarı yeniden başlatın.
""", [
    ("Yazıcıdan çıktı alamıyorum", "Yazdır diyorum ama çıkmıyor.", "Yazdırma kuyruğu temizlendi, varsayılan yazıcı düzeltildi."),
    ("Yazıcı görünmüyor", "Yazıcı listesinde Kat2 yazıcısı yok.", "Kat2-Yazıcı yeniden eklendi."),
], ["Yazıcı çıktı vermiyor", "Yazıcı listede görünmüyor"])

art("Yazıcı kağıt sıkıştırıyor", "Donanım", """
Kağıt sıkışmasında:
1) Yazıcıyı kapatın, ön kapağı açın.
2) Sıkışan kağıdı iki elinizle yavaşça, kağıt yolunun yönünde çekin; yırtmamaya dikkat edin.
3) Kağıt tepsisindeki kağıtların düzgün ve 250 yaprağı geçmediğinden emin olun.
4) Sık tekrarlıyorsa silindir temizliği gerekir; 'Donanım' kategorisinde ticket açın.
""", [
    ("Yazıcı kağıt sıkıştırıyor", "Kat 3 yazıcısı sürekli kağıt sıkıştırıyor.", "Silindir temizlendi, tepsi ayarı düzeltildi."),
], ["Kağıt sıkıştı ne yapmalıyım"])

art("Toner ve kartuş değişimi", "Donanım", """
Toner bitti uyarısında:
1) Yedek tonerler her katın malzeme dolabındadır (dolap anahtarı kat sorumlusunda).
2) Ön kapağı açın, eski toneri çekip çıkarın, yenisini klik sesi gelene kadar itin.
3) Dolapta toner yoksa 'Donanım' kategorisinde yazıcı adını yazarak ticket açın; 1 iş günü içinde getirilir.
""", [
    ("Toner bitti", "Kat 2 yazıcısında toner bitti, dolapta yok.", "Yeni toner teslim edildi ve takıldı."),
], ["Toner nereden alınır", "Kartuş nasıl değiştirilir"])

art("Laptop çok ısınıyor veya yavaşladı", "Donanım", """
Bilgisayarınız ısınıyor ya da yavaşladıysa:
1) Laptopu yumuşak yüzeylerde (yatak, kucak) değil, düz masada kullanın.
2) Görev Yöneticisi'nde (Ctrl+Shift+Esc) çok işlemci kullanan uygulamaları kapatın.
3) Bilgisayarı en az haftada bir yeniden başlatın; güncellemeler ancak böyle tamamlanır.
4) Fan sesi çok yüksekse veya cihaz kendiliğinden kapanıyorsa 'Donanım' ticketı açın; bakım için cihaz alınır.
""", [
    ("Laptop çok ısınıyor", "Fan sürekli bağırıyor.", "Fan temizliği yapıldı, termal macun yenilendi."),
    ("Bilgisayar çok yavaş", "Açılması 10 dakika sürüyor.", "Bekleyen güncellemeler yüklendi, başlangıç uygulamaları azaltıldı."),
], ["Bilgisayarım çok yavaş", "Laptop neden ısınıyor"])

art("Harici monitör algılanmıyor", "Donanım", """
İkinci ekran görüntü vermiyorsa:
1) Kablonun (HDMI/USB-C) iki ucunu da çıkarıp takın.
2) Windows + P tuşlarına basıp 'Genişlet'i seçin.
3) Docking istasyonu kullanıyorsanız docking'in güç kablosunu çıkarıp 10 saniye bekleyin.
4) Başka kablo ile deneyin; masa kablosu arızalıysa 'Donanım' ticketı açın.
""", [
    ("İkinci monitör çalışmıyor", "Docking istasyonuna takınca ekran gelmiyor.", "Docking istasyonu sürücüsü güncellendi."),
], ["Monitör görüntü vermiyor", "İkinci ekran nasıl açılır"])

art("Yeni ekipman talebi (mouse, klavye, kulaklık)", "Donanım", """
Mouse, klavye, kulaklık gibi küçük ekipmanlar için:
1) 'Donanım' kategorisinde ticket açın, başlığa ekipman adını yazın.
2) Açıklamaya teslim alacağınız katı ve masa numaranızı ekleyin.
3) Stoktaki ekipmanlar 2 iş günü içinde teslim edilir. Monitör ve laptop talepleri yönetici onayı gerektirir.
""", [
    ("Mouse talebi", "Mouseum bozuldu, yenisi lazım.", "Stoktan yeni mouse teslim edildi."),
    ("Kulaklık lazım", "Toplantılar için kulaklık istiyorum.", "Kulaklık stoktan teslim edildi."),
], ["Yeni mouse nasıl isterim", "Kulaklık talebi"])

# ---------------- Yazılım/Lisans ----------------
art("Office lisans hatası", "Yazılım/Lisans", """
Word/Excel 'Lisanssız ürün' diyorsa:
1) Office uygulamasında Dosya > Hesap'a gidin.
2) 'Oturumu kapat'a tıklayın, uygulamayı kapatıp açın.
3) Şirket e-postanızla tekrar giriş yapın.
4) Hâlâ lisanssız görünüyorsa hesabınıza lisans atanmamış olabilir; 'Yazılım/Lisans' ticketı açın.
""", [
    ("Office lisansı süresi doldu", "Word lisans doğrulanamadı diyor.", "Lisans yeniden atandı, kullanıcı çıkış yapıp tekrar girdi."),
    ("Excel lisanssız ürün diyor", "Excel salt okunur açılıyor.", "Office hesabından çıkış yapılıp tekrar giriş yapıldı."),
], ["Office lisans hatası", "Word lisanssız ürün diyor"])

art("Yazılım kurulum talebi", "Yazılım/Lisans", """
Bilgisayarınıza program kurma yetkiniz yoktur.
1) Önce Başlat > 'Yazılım Merkezi'nde aradığınız programın olup olmadığına bakın; varsa kendiniz kurabilirsiniz.
2) Yoksa 'Yazılım/Lisans' kategorisinde ticket açın; program adını, sürümünü ve iş gerekçesini yazın.
3) Ücretli yazılımlar yönetici onayından sonra 3-5 iş günü içinde kurulur.
""", [
    ("Program kurmam lazım", "Notepad++ kurmak istiyorum.", "Yazılım Merkezi'nden kurulum yapıldı."),
    ("Adobe Acrobat Pro talebi", "PDF düzenlemem gerekiyor.", "Yönetici onayıyla Acrobat Pro lisansı atandı ve kuruldu."),
], ["Bilgisayara program nasıl kurarım", "Yazılım Merkezi nedir"])

art("Teams toplantısında ses veya kamera çalışmıyor", "Yazılım/Lisans", """
Teams'te sizi duymuyorlarsa veya kamera açılmıyorsa:
1) Teams > Ayarlar > Cihazlar'dan doğru mikrofon ve kamerayı seçin.
2) Windows Ayarlar > Gizlilik > Kamera/Mikrofon'da Teams'e izin verildiğinden emin olun.
3) Laptopunuzda kamera kapağı veya F8/F10 kamera kapatma tuşu olup olmadığını kontrol edin.
4) Teams'i tamamen kapatıp (sağ alttaki simgeden 'Çık') yeniden açın.
""", [
    ("Teams'te sesim gitmiyor", "Toplantıda beni duymuyorlar.", "Teams cihaz ayarlarında doğru mikrofon seçildi."),
    ("Kamera açılmıyor", "Teams kamera bulunamadı diyor.", "Windows gizlilik ayarlarında kamera izni açıldı."),
], ["Teams mikrofon çalışmıyor", "Teams kamera açılmıyor"])

art("Windows güncellemesi takıldı", "Yazılım/Lisans", """
Güncelleme %0'da veya uzun süre takılı kalıyorsa:
1) Bilgisayarı prize takılı tutun ve 1 saat bekleyin.
2) Değişmezse Ayarlar > Windows Update > 'Sorun gider'i çalıştırın.
3) Güncellemeyi iptal etmek için bilgisayarı zorla kapatmayın; dosyalar bozulabilir.
4) 3 saati geçerse 'Yazılım/Lisans' ticketı açın.
""", [
    ("Güncelleme bitmiyor", "Windows güncellemesi 2 saattir %30'da.", "Windows Update sorun gidericisi çalıştırıldı, güncelleme tamamlandı."),
], ["Windows güncellemesi takıldı"])

art("ERP (Logo) uygulamasına giriş sorunu", "Yazılım/Lisans", """
ERP'ye giremiyorsanız:
1) ERP'ye sadece ofis ağından veya VPN üzerinden erişilebilir.
2) Kullanıcı adınız sicil numaranızdır (ör. 10234), şifreniz şirket şifrenizden ayrıdır.
3) Şifrenizi unuttuysanız ERP giriş ekranındaki 'Şifremi unuttum' bağlantısını kullanın.
4) 'Yetkiniz yok' hatasında departman yöneticinizin onayıyla 'Erişim/Hesap' ticketı açın.
""", [
    ("ERP'ye giremiyorum", "Logo kullanıcı adı veya şifre hatalı diyor.", "Kullanıcı adının sicil numarası olduğu hatırlatıldı, ERP şifresi sıfırlandı."),
    ("ERP yetki hatası", "Satış modülünü açamıyorum.", "Yönetici onayıyla Satış modülü yetkisi verildi."),
], ["ERP giriş yapamıyorum", "Logo kullanıcı adı nedir"])

# ---------------- Erişim/Hesap ----------------
art("Şirket şifremi unuttum, nasıl sıfırlarım?", "Erişim/Hesap", """
Şirket (Windows/e-posta) şifrenizi unuttuysanız:
1) portal.anka.local adresine gidin ve 'Şifremi unuttum'a tıklayın.
2) Şirket e-postanızı yazın; telefonunuza gelen 6 haneli kodu girin.
3) Yeni şifre belirleyin: en az 12 karakter, büyük-küçük harf ve rakam içermeli, son 5 şifrenizle aynı olmamalı.
4) Telefonunuz kayıtlı değilse kimliğinizle IT ofisine (Kat 1) gelin.
""", [
    ("Şifremi unuttum", "Bilgisayara giriş yapamıyorum.", "Kullanıcı portal üzerinden şifresini sıfırladı."),
    ("Şifre sıfırlama kodu gelmiyor", "Telefonuma SMS gelmiyor.", "Kayıtlı telefon numarası güncellendi, kod gönderildi."),
], ["Şifremi unuttum", "Şifre nasıl sıfırlanır", "Şifre kuralları nelerdir"])

art("Hesabım kilitlendi", "Erişim/Hesap", """
5 hatalı şifre denemesinden sonra hesabınız 30 dakika kilitlenir.
1) 30 dakika bekleyin ve doğru şifreyle tekrar deneyin.
2) Telefonunuzda eski şifreyle e-posta kuran uygulamalar sürekli deneme yapıp hesabı tekrar kilitleyebilir; telefondaki şifreyi güncelleyin.
3) Acil durumda portal.anka.local üzerinden şifre sıfırlamak kilidi de kaldırır.
""", [
    ("Hesabım kilitlendi", "Sürekli hesap kilitli diyor.", "Telefondaki eski şifreli mail hesabı güncellendi, kilitlenme bitti."),
], ["Hesabım kilitlendi ne yapmalıyım", "Hesap kilidi nasıl açılır"])

art("İki adımlı doğrulama (Authenticator) kurulumu", "Erişim/Hesap", """
Şirket hesapları için Microsoft Authenticator zorunludur.
1) Telefonunuza 'Microsoft Authenticator' uygulamasını indirin.
2) Bilgisayarda aka.ms/mfasetup adresine gidin ve 'Yöntem ekle' > 'Authenticator uygulaması'nı seçin.
3) Ekrandaki QR kodu uygulamayla okutun.
Telefon değiştirdiyseniz eski telefon elinizdeyse aynı adımları yeni telefonda yapın; değilse IT ofisine kimliğinizle başvurun.
""", [
    ("Authenticator kurulumu", "Yeni telefona Authenticator taşıyamıyorum.", "Eski yöntem silindi, yeni telefonda QR ile kurulum yapıldı."),
    ("Telefonumu kaybettim MFA", "Doğrulama kodu alamıyorum.", "Kimlik kontrolü sonrası MFA sıfırlandı, yeni cihaz kaydedildi."),
], ["Authenticator nasıl kurulur", "Telefon değiştirdim MFA ne olacak"])

art("Yeni çalışan hesabı açma", "Erişim/Hesap", """
Yeni başlayan çalışan için hesap talebi işe başlamadan en az 3 iş günü önce yapılmalıdır.
1) İK, işe giriş formunu doldurduğunda talep otomatik oluşur.
2) Yönetici, 'Erişim/Hesap' kategorisinde ticket açarak gerekli klasör ve uygulama yetkilerini (ERP modülleri, ortak klasörler) yazar.
3) Hesap bilgileri ilk gün IT ofisinde (Kat 1) çalışana teslim edilir.
""", [
    ("Yeni çalışana hesap açılması", "Pazartesi başlayacak çalışan için hesap gerekli.", "Hesap açıldı, ERP ve ortak klasör yetkileri tanımlandı."),
], ["Yeni çalışan için hesap nasıl açılır"])

art("İşten ayrılan çalışanın hesabının kapatılması", "Erişim/Hesap", """
Ayrılan çalışanın hesabı son iş günü 18:00'de otomatik kapatılır.
1) Yönetici, e-postalarının kime yönlendirileceğini 'Erişim/Hesap' ticketıyla bildirir.
2) Kişisel dosyalar 30 gün saklanır; bu sürede yöneticinin talebiyle devredilebilir.
3) Laptop ve ekipmanlar son gün IT ofisine teslim edilir.
""", [
    ("Ayrılan çalışanın mailleri", "Ayrılan arkadaşın mailleri bana yönlensin.", "E-posta yönlendirmesi 90 gün için tanımlandı."),
], ["İşten ayrılan kişinin mailleri ne olur"])

# ---------------- Diğer (İK/Ofis) ----------------
art("Yıllık izin talebi nasıl yapılır", "Diğer", """
İzin talepleri İK portalından yapılır.
1) ik.anka.local adresine şirket hesabınızla giriş yapın.
2) 'İzin Talebi' > 'Yeni' > izin türü ve tarihleri seçin.
3) Talep yöneticinize onaya gider; onaylanınca e-posta alırsınız.
Kalan izin gününüzü aynı ekranın üst kısmında görebilirsiniz.
""", [
    ("İzin talebi giremiyorum", "İK portalında izin butonu yok.", "Kullanıcının İK portal rolü düzeltildi."),
], ["Yıllık izin nasıl alınır", "Kalan izin günümü nereden görürüm", "İzin talebi nereden yapılır"])

art("Bordro (maaş pusulası) görüntüleme", "Diğer", """
Aylık bordronuz her ayın 15'inde İK portalında yayınlanır.
1) ik.anka.local > 'Bordrolarım'a gidin.
2) İlgili ayı seçip PDF olarak indirin.
Bordroda hata olduğunu düşünüyorsanız ik@anka.com.tr adresine yazın; bu konu IT değil İK birimindedir.
""", [], ["Maaş bordromu nereden görürüm", "Bordro ne zaman yayınlanır"])

art("Kartlı giriş ve otopark kartı", "Diğer", """
Bina giriş kartınız çalışmıyorsa veya kaybettiyseniz:
1) Resepsiyona gidin, kimliğinizle geçici kart alın.
2) Kayıp kart güvenlik nedeniyle hemen iptal edilir; yeni kart 1 iş günü içinde hazırlanır.
3) Otopark kartı talepleri idari işler birimine (idari@anka.com.tr) yapılır.
""", [
    ("Giriş kartım çalışmıyor", "Turnikeden geçemiyorum.", "Kartın yetkisi yenilendi."),
], ["Giriş kartımı kaybettim", "Otopark kartı nasıl alınır"])

# ---- Sadece Mavi Yazılım (izolasyon testi) ----
MAVI = [
    dict(title="Ofis Wi-Fi şifresi", category="Ağ/VPN", body="Mavi Yazılım ofis Wi-Fi ağı 'Mavi-Ofis'tir. Şifre her ay İK duyurusunda paylaşılır."),
    dict(title="Monitör algılanmıyor", category="Donanım", body="HDMI kablosunu çıkarıp takın, Windows+P ile 'Genişlet' seçin."),
    dict(title="GitLab erişimi", category="Erişim/Hesap", body="GitLab hesabınız ilk gün otomatik açılır. gitlab.mavi.dev adresinden şirket hesabınızla girin. Proje erişimi için takım liderinize yazın."),
    dict(title="Kod inceleme (code review) kuralları", category="Diğer", body="Her merge request en az bir kişi tarafından onaylanmalıdır. CI testleri geçmeden merge yapılmaz. Büyük değişiklikler 400 satırı geçmemelidir."),
    dict(title="Mavi VPN (WireGuard) kurulumu", category="Ağ/VPN", body="WireGuard uygulamasını kurun, takım liderinizden aldığınız .conf dosyasını içe aktarın ve 'Etkinleştir'e basın."),
]

# ---- Makalesi OLMAYAN konular: bilgi boşluğu radarı bunları bulmalı ----
GAPS = [
    dict(topic="Toplantı odası rezervasyonu", category="Diğer",
         tickets=[("Toplantı odası rezervasyonu yapamıyorum", "Outlook'ta toplantı odasını bulamıyorum.", "Outlook'ta Yeni Toplantı > Oda Bul > 'Kat3-Toplantı' seçildi. Oda listede yoksa takvim izni verildi."),
                  ("Toplantı odası takvimde görünmüyor", "Oda rezervasyonu için takvimde oda listesi boş.", "Kullanıcıya 'Toplantı Odaları' adres listesine erişim izni verildi."),
                  ("Toplantı odası rezervasyonu iptal olmuyor", "Rezervasyonumu iptal edemiyorum.", "Toplantı Outlook takviminden silinerek oda serbest bırakıldı.")],
         questions=["Toplantı odası nasıl rezerve edilir?", "Toplantı odası rezervasyonu nereden yapılıyor?", "Toplantı odası rezerve etmek istiyorum", "Toplantı odası rezervasyonu iptal etme", "Boş toplantı odası nasıl bulunur"]),
    dict(topic="Telefona şirket e-postası kurulumu", category="E-posta",
         tickets=[("Telefonuma şirket mailini kuramıyorum", "Telefonda şirket e-postası eklenmiyor.", "Outlook mobil uygulaması kuruldu, şirket hesabıyla giriş yapıldı ve Authenticator onayı verildi."),
                  ("Telefonda şirket maili açılmıyor", "Yeni telefona şirket maili eklemek istiyorum.", "Outlook mobil uygulaması kuruldu, MFA onaylandı.")],
         questions=["Telefona şirket mailini nasıl kurarım?", "Telefonuma şirket maili ekleme", "iPhone'a şirket maili kurulumu"]),
    dict(topic="Masraf formu", category="Diğer",
         tickets=[("Masraf formu sisteme girmiyor", "Masraf formunu kaydedemiyorum.", "Masraf modülü yetkisi ERP'de tanımlandı.")],
         questions=["Masraf formu nereden doldurulur?", "Masraf formu nasıl onaya gönderilir?", "Taksi masrafını nasıl beyan ederim"]),
    dict(topic="Ekran paylaşımı / uzaktan destek", category="Yazılım/Lisans",
         tickets=[("Uzaktan destek programı açılmıyor", "IT ekibi bağlanamıyor.", "AnyDesk Yazılım Merkezi'nden kuruldu ve kimlik numarası paylaşıldı."),
                  ("Uzaktan bağlantı izni", "Destek ekibi ekranıma bağlanamıyor.", "AnyDesk kurulumu yapıldı, bağlantı onaylandı.")],
         questions=["Uzaktan destek programı nedir", "IT ekibi ekranıma nasıl bağlanır"]),
]
