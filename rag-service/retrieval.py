"""Arama çekirdeği: parçalama, Türkçe kelime araması (BM25) ve hibrit puanlama.
Veritabanı ve Ollama'dan bağımsızdır; bu yüzden tek başına test edilebilir."""
import math
import re
from dataclasses import dataclass, field

STOP = set("""
nasıl neden niçin nerede nereden hangi kim ne için ile gibi kadar daha çok bir bu şu var yok olur oldu olan ben benim
bana sen siz biz lütfen acaba gerekiyor istiyorum nedir hala hâlâ yine sonra önce şimdi bugün dün her hiç olarak değil
ama fakat veya ve de da mi mı mu mü ise yapmalıyım yapabilirim yapılır yapmam edilir nasil ediyor oluyor olursa
""".split())


# Kurumsal IT dilinde sık eş anlamlılar (kök → kök). Sadece sorguya uygulanır.
SYNONYMS = {
    "parol": "şifre", "passw": "şifre", "mail": "posta", "maili": "posta", "maill": "posta", "email": "posta",
    "eposta": "posta", "kablo": "wi", "wifi": "wi", "kablos": "wi", "inter": "inter",
    "lapto": "lapto", "dizüs": "lapto", "bilgi": "bilgi", "progr": "yazıl", "uygul": "yazıl",
    "parol": "şifre", "sürüc": "klasö", "sunuc": "sunuc", "yazdı": "yazıc", "çıktı": "çıktı",
    "kilit": "kilit", "hatır": "unutt", "sesim": "ses", "duymu": "ses", "mikro": "ses",
}


def tr_lower(s: str) -> str:
    return s.replace("I", "ı").replace("İ", "i").lower()


def tokens(text: str, expand: bool = False) -> list[str]:
    """Türkçe ekler yüzünden kelimeler ilk 5 harfe kısaltılır: bağlanmıyor/bağlantı → bağla.
    expand=True (sorgular için): eş anlamlı kök de eklenir (parola → şifre)."""
    out = []
    for w in re.sub(r"[^\w]+", " ", tr_lower(text)).split():
        if len(w) >= 3 and w not in STOP:
            out.append(w[:5])
            if expand and SYNONYMS.get(w[:5], w[:5]) != w[:5]:
                out.append(SYNONYMS[w[:5]])
        elif w.isdigit() and len(w) >= 2:  # hata kodları (809, 5.2) aranabilsin
            out.append(w)
    return out


# ---------------- Parçalama ----------------
def chunk_article(title: str, body: str, max_chars: int = 700) -> list[str]:
    """Makaleyi satır/paragraf sınırlarından ~700 karakterlik parçalara böler.
    Her parçanın başına başlık eklenir; bir önceki parçanın son satırı tekrar edilir (bağlam kopmasın)."""
    lines = [l.strip() for l in body.replace("\r", "").split("\n") if l.strip()]
    chunks, cur = [], []
    for line in lines:
        if cur and sum(len(x) + 1 for x in cur) + len(line) > max_chars:
            chunks.append(cur)
            cur = [cur[-1]]  # örtüşme
        cur.append(line)
    if cur:
        chunks.append(cur)
    return [f"{title}\n" + "\n".join(c) for c in chunks] or [title]


# ---------------- BM25 ----------------
@dataclass
class KeywordIndex:
    ids: list[str] = field(default_factory=list)
    docs: list[dict] = field(default_factory=list)   # kelime → sayı
    lens: list[int] = field(default_factory=list)
    df: dict = field(default_factory=dict)
    avg: float = 1.0

    @classmethod
    def build(cls, items: list[tuple[str, str]]):
        idx = cls()
        for cid, text in items:
            toks = tokens(text)
            tf = {}
            for t in toks:
                tf[t] = tf.get(t, 0) + 1
            idx.ids.append(cid); idx.docs.append(tf); idx.lens.append(len(toks))
            for t in tf:
                idx.df[t] = idx.df.get(t, 0) + 1
        idx.avg = (sum(idx.lens) / len(idx.lens)) if idx.lens else 1.0
        return idx

    def search(self, query: str, k1: float = 1.2, b: float = 0.75) -> dict[str, tuple[float, float]]:
        """chunk_id → (bm25 puanı, sorgu kelimelerinin ne kadarı geçiyor 0-1)"""
        raw = tokens(query, expand=True)
        q = list(dict.fromkeys(raw))
        if not q or not self.ids:
            return {}
        n = len(self.ids)
        idf = {t: math.log(1 + (n - self.df.get(t, 0) + 0.5) / (self.df.get(t, 0) + 0.5)) for t in q}
        # Eş anlamlı ekleri kapsama paydasına katma: sorudaki gerçek kelimeler kadar sayılsın
        base = list(dict.fromkeys(tokens(query)))
        syn_of = {SYNONYMS.get(t, t): t for t in base}
        total = sum(idf.get(t, 0) for t in base) or 1.0
        res = {}
        for i, tf in enumerate(self.docs):
            s, got = 0.0, set()
            for t in q:
                f = tf.get(t)
                if not f:
                    continue
                got.add(t if t in base else syn_of.get(t, t))
                s += idf[t] * f * (k1 + 1) / (f + k1 * (1 - b + b * self.lens[i] / self.avg))
            if s > 0:
                # Kapsama nadir kelimelere göre ağırlıklı: bilgi bankasında hiç geçmeyen kelime ("ciro") güveni düşürür
                cov = sum(idf.get(t, 0) for t in got if t in base) / total
                res[self.ids[i]] = (s, min(1.0, cov))
        return res


# ---------------- Hibrit karar ----------------
# Ollama kapalıyken kelime aramasının güven eşiği. Demo verisinde ölçüldü: 0.6'da uydurma 0 (güvenli mod);
# düşürmek daha çok soruya cevap verdirir ama yanlış cevap riskini artırır.
KW_MIN = 0.6
def fuse(vec_scores: dict[str, float] | None, kw: dict[str, tuple[float, float]], threshold: float,
         w_vec: float = 0.7, kw_min: float = KW_MIN) -> list[dict]:
    """Anlam (vektör) ve kelime puanlarını birleştirir, her parça için 'güvenilir mi' kararı verir.
    - Vektör varsa: asıl karar vektör puanıyla verilir (eşik = threshold).
      Kelime eşleşmesi çok güçlüyse (sorgunun %75'i birebir geçiyor) eşik 0.08 gevşetilir: hata kodu, ürün adı gibi.
    - Vektör yoksa (Ollama kapalı): sadece kelime araması; sorgunun en az %60'ı geçmeli."""
    max_bm = max((v[0] for v in kw.values()), default=0) or 1.0
    ids = set(kw) | set(vec_scores or {})
    out = []
    for cid in ids:
        bm, cov = kw.get(cid, (0.0, 0.0))
        kwn = bm / max_bm
        if vec_scores is not None:
            v = vec_scores.get(cid, 0.0)
            score = w_vec * v + (1 - w_vec) * kwn * cov
            ok = v >= threshold or (cov >= 0.75 and v >= threshold - 0.08)
            out.append(dict(id=cid, score=score, vec=v, kw=cov, confident=ok))
        else:
            score = kwn * cov
            out.append(dict(id=cid, score=score, vec=None, kw=cov, confident=cov >= kw_min and bm >= 1.0))
    out.sort(key=lambda x: (x["confident"], x["score"]), reverse=True)
    return out
