from conversation import clean_rewrite, fallback_rewrite, is_followup, normalize_history

H = [{"question": "VPN istemcisini nasıl kurarım", "answer": "Windows: portal'dan indirin."}]


def test_gecmis_yoksa_takip_sorusu_sayilmaz():
    assert is_followup("peki Mac'te?", []) is False


def test_takip_sorusu_tanınır():
    assert is_followup("peki Mac'te?", H)
    assert is_followup("Bunu telefonda nasıl yaparım", H)
    assert is_followup("olmadı", H)


def test_kendi_konusu_olan_soru_takip_degildir():
    assert not is_followup("Yazıcı kağıt sıkıştırıyor ne yapmalıyım", H)


def test_llm_yokken_onceki_konu_eklenir_baglac_atilir():
    q = fallback_rewrite("peki Mac'te?", H)
    assert q.startswith("VPN istemcisini nasıl kurarım") and "Mac'te" in q and "peki" not in q


def test_gecmis_son_3_kayitla_sinirlanir():
    h = [{"question": f"soru {i}", "answer": "x"} for i in range(6)] + [{"question": "  ", "answer": "boş"}]
    out = normalize_history(h)
    assert [x["question"] for x in out] == ["soru 3", "soru 4", "soru 5"]


def test_llm_yeniden_yazimi_dogrulanir():
    assert clean_rewrite('Soru: "VPN istemcisi Mac\'te nasıl kurulur?"', "peki Mac'te?") == "VPN istemcisi Mac'te nasıl kurulur?"
    assert clean_rewrite("", "peki Mac'te?") is None
    assert clean_rewrite("Bu konuda bilgim yok", "peki Mac'te?") is None
    assert clean_rewrite("x" * 300, "peki Mac'te?") is None
    # LLM soruyu tamamen başka konuya kaydırırsa reddedilir
    assert clean_rewrite("Yıllık izin nasıl alınır?", "Outlook şifre soruyor telefonda") is None
