from retrieval import fuse
from tickets import feedback_boost, keyword_similarity, ticket_hash, vote


def test_oylama_benzerlikle_agirliklidir():
    n = [(0.9, "Ağ", "High"), (0.85, "Ağ", "High"), (0.6, "Donanım", "Low"), (0.3, "Yazılım", "Low")]
    s = vote(n, min_sim=0.55)
    assert s["category"]["value"] == "Ağ" and s["priority"]["value"] == "High"
    assert 0.5 < s["category"]["confidence"] < 1 and s["neighbors"] == 3  # 0.3 eşik altında, oy veremez


def test_yeterince_benzer_ticket_yoksa_oneri_yok():
    assert vote([(0.4, "Ağ", "High")], min_sim=0.55) is None


def test_kelime_benzerligi_yinelenen_ticketi_bulur():
    items = [("a", "VPN bağlanamıyorum\nAnka Connect hata"), ("b", "Yazıcı kağıt sıkıştırıyor")]
    sims = keyword_similarity("VPN'e bağlanamıyorum", items)
    assert "a" in sims and "b" not in sims


def test_hash_metin_ve_modele_baglidir():
    assert ticket_hash("bge-m3", "A", "b") == ticket_hash("bge-m3", "A", "b")
    assert ticket_hash("bge-m3", "A", "b") != ticket_hash("bge-m3", "A", "c")
    assert ticket_hash("bge-m3", "A", "b") != ticket_hash("baska", "A", "b")


def test_geri_bildirim_bonusu_sinirlidir():
    assert feedback_boost(0, 0) == 0
    assert 0 < feedback_boost(2, 0) < 0.04
    assert feedback_boost(0, 2) < 0
    assert feedback_boost(1000, 0) <= 0.04  # yüz oy kontrolü ele geçiremez


def test_bonus_siralamayi_degistirir_guven_kararini_degistirmez():
    vec = {"a": 0.60, "b": 0.61, "c": 0.30}
    kw = {}
    plain = fuse(vec, kw, 0.45)
    assert plain[0]["id"] == "b"
    boosted = fuse(vec, kw, 0.45, boosts={"a": 0.04, "c": 0.04})
    assert boosted[0]["id"] == "a"  # faydalı bulunan kaynak öne çıktı
    c = next(x for x in boosted if x["id"] == "c")
    assert c["confident"] is False  # bonus eşiğin altındakini güvenilir yapamaz
