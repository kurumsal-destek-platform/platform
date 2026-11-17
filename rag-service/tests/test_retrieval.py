from retrieval import KeywordIndex, chunk_article, fuse, tokens


def test_turkce_ekler_ayni_koke_iner():
    assert tokens("bağlanmıyor")[0] == tokens("bağlantı")[0] == "bağla"
    assert "yazıc" in tokens("Yazıcıdan çıktı alamıyorum")


def test_eskisozluk_parola_sifreye_esitlenir():
    assert "şifre" in tokens("parolamı unuttum", expand=True)


def test_parcalama_basligi_ekler_ve_ortusur():
    body = "\n".join(f"{i}) " + "adım açıklaması " * 12 for i in range(1, 12))
    parts = chunk_article("Uzun makale", body, max_chars=400)
    assert len(parts) > 1
    assert all(p.startswith("Uzun makale\n") for p in parts)
    # bir sonraki parça, öncekinin son satırıyla başlar (bağlam kopmasın)
    assert parts[0].split("\n")[-1] == parts[1].split("\n")[1]


def test_kelime_aramasi_dogru_makaleyi_one_alir():
    idx = KeywordIndex.build([("vpn", "VPN bağlanmıyor. Anka Connect'i kapatıp açın."), ("yaz", "Yazıcı çıktı vermiyor, kuyruğu temizleyin.")])
    res = idx.search("VPN bağlantısı kurulamıyor")
    assert max(res, key=lambda k: res[k][0]) == "vpn"


def test_hibrit_karar_vektor_esigine_uyar():
    kw = {"a": (5.0, 0.5)}
    assert fuse({"a": 0.60}, kw, 0.45)[0]["confident"] is True
    assert fuse({"a": 0.30}, kw, 0.45)[0]["confident"] is False


def test_guclu_kelime_eslesmesi_esigi_biraz_gevsetir():
    # hata kodu gibi birebir eşleşmede (kapsama ≥ %75) eşik 0.08 gevşer
    assert fuse({"a": 0.40}, {"a": (5.0, 0.9)}, 0.45)[0]["confident"] is True
    assert fuse({"a": 0.30}, {"a": (5.0, 0.9)}, 0.45)[0]["confident"] is False


def test_guvenli_mod_bilinmeyen_kelimede_cevap_vermez():
    idx = KeywordIndex.build([("izin", "Yıllık izin talebi İK portalından yapılır. Şirket çalışanları ...")])
    r = fuse(None, idx.search("Şirketin yıllık cirosu ne kadar"), 0.45)
    assert not r or not r[0]["confident"]
