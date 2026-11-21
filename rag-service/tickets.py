"""Ticket benzerliği: yinelenen ticket uyarısı ve kategori/öncelik önerisi için saf fonksiyonlar.

- Yinelenen ticket: yeni yazılan ticket'a anlamca çok benzeyen AÇIK ticket'lar bulunur.
- Kategori/öncelik önerisi: geçmiş ticket'lardan en benzer olanlar "oy verir"; benzerlik arttıkça oyun ağırlığı artar.
Veritabanı ve Ollama'dan bağımsızdır; tek başına test edilebilir.
"""

import hashlib
import math

from retrieval import KeywordIndex

OPEN_STATUSES = ("open", "assigned", "in_progress")


def ticket_text(title: str, description: str | None) -> str:
    """Embedding'e giden metin: başlık en önemli kısım, açıklama kısaltılır."""
    desc = (description or "").strip()
    return f"{title.strip()}\n{desc[:600]}".strip()


def ticket_hash(model: str, title: str, description: str | None) -> str:
    return hashlib.sha1(f"{model}|{ticket_text(title, description)}".encode()).hexdigest()


def keyword_similarity(
    query: str, items: list[tuple[str, str]], min_cov: float = 0.6
) -> dict[str, float]:
    """Ollama kapalıyken: kelime araması. id → 0-1 arası benzerlik (sorgu kelimelerinin kapsanma oranı,
    BM25 puanıyla hafifçe ağırlıklı). Sorgu kelimelerinin en az min_cov kadarı geçmeli."""
    if not items:
        return {}
    idx = KeywordIndex.build(items)
    res = idx.search(query)
    if not res:
        return {}
    max_bm = max(v[0] for v in res.values()) or 1.0
    out = {}
    for cid, (bm, cov) in res.items():
        if cov >= min_cov:
            out[cid] = round(cov * (0.7 + 0.3 * bm / max_bm), 4)
    return out


def vote(
    neighbors: list[tuple[float, str, str]], min_sim: float, top_n: int = 15
) -> dict | None:
    """neighbors: (benzerlik, kategori, öncelik) listesi.
    En benzer top_n komşu, benzerliğinin karesiyle oy verir (çok benzer olan daha çok sayılır).
    Dönen güven: kazanan değerin oyların ne kadarını aldığı (0-1)."""
    near = sorted((n for n in neighbors if n[0] >= min_sim), key=lambda n: -n[0])[:top_n]
    if not near:
        return None

    def pick(idx: int) -> dict:
        w: dict[str, float] = {}
        for n in near:
            if n[idx]:
                w[n[idx]] = w.get(n[idx], 0.0) + n[0] ** 2
        if not w:
            return {"value": None, "confidence": 0.0}
        best = max(w, key=w.get)
        return {"value": best, "confidence": round(w[best] / sum(w.values()), 2)}

    return {
        "category": pick(1),
        "priority": pick(2),
        "neighbors": len(near),
        "top_similarity": round(near[0][0], 3),
    }


def feedback_boost(solved: int, unsolved: int, max_boost: float = 0.04) -> float:
    """Kullanıcı geri bildiriminden makale için küçük sıralama bonusu (−max_boost … +max_boost).
    'İşe yaradı' artırır, 'Yaramadı' azaltır; tanh ile sınırlı: birkaç oy fark yaratır, yüz oy kontrolü ele geçiremez.
    Güven eşiğini DEĞİŞTİRMEZ, sadece zaten güvenilir sonuçların sırasını etkiler (uydurma riskini artırmaz)."""
    net = solved - unsolved
    if net == 0:
        return 0.0
    return round(max_boost * math.tanh(net / 3), 4)
