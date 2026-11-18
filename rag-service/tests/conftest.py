import os
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ARTICLES = {
    "anka": [
        (
            "VPN bağlanmıyor",
            "1) İnternet bağlantınızı kontrol edin.\n2) Anka Connect'i kapatıp açın.\n3) Sunucu adresi vpn.anka.com.tr olmalı.\n4) Hâlâ bağlanmıyorsa ticket açın.",
        ),
        (
            "Yazıcı çıktı vermiyor",
            "Yazıcının açık olduğunu kontrol edin. Ayarlar > Yazıcılar'dan Kat2-Yazıcı'yı varsayılan yapın. Kuyruğu temizleyin.",
        ),
        (
            "Şirket şifremi unuttum, nasıl sıfırlarım?",
            "portal.anka.local adresine gidin, 'Şifremi unuttum'a tıklayın. Telefonunuza gelen kodu girin. Yeni şifre en az 12 karakter olmalı.",
        ),
        (
            "Outlook sürekli şifre soruyor",
            "Kimlik Bilgileri Yöneticisi'nden MicrosoftOffice ile başlayan kayıtları silin ve Outlook'a yeniden giriş yapın.",
        ),
    ],
    "mavi": [
        (
            "GitLab erişimi",
            "GitLab hesabınız ilk gün açılır. gitlab.mavi.dev adresinden şirket hesabınızla girin.",
        ),
        (
            "Mavi VPN (WireGuard) kurulumu",
            "WireGuard uygulamasını kurun, .conf dosyasını içe aktarın ve Etkinleştir'e basın.",
        ),
    ],
}


@pytest.fixture
def rag(monkeypatch):
    """RAG servisini veritabanı ve Ollama OLMADAN test etmek için: makaleler bellekte, arama 'güvenli mod' (kelime)."""
    import main
    from retrieval import KeywordIndex, chunk_article

    def fake_sync(tenant_id, force=False):
        st = main.state(tenant_id)
        meta = {}
        for i, (t, b) in enumerate(ARTICLES.get(tenant_id, [])):
            for n, text in enumerate(chunk_article(t, b)):
                meta[f"{tenant_id}-{i}:{n}"] = {
                    "article_id": f"{tenant_id}-{i}",
                    "title": t,
                    "content": text,
                }
        st.meta = meta
        st.kw = KeywordIndex.build([(k, m["content"]) for k, m in meta.items()])
        st.synced_at = time.time()
        return {"chunks": len(meta)}

    monkeypatch.setattr(main, "sync_tenant", fake_sync)
    monkeypatch.setattr(main, "vector_scores", lambda tid, q, limit=20: None)
    main._tenants.clear()
    from fastapi.testclient import TestClient

    return TestClient(main.app)
