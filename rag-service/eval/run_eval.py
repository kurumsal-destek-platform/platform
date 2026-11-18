"""
RAG doğrulama testi.  Çalıştırma (proje klasöründe):
    docker compose exec rag python eval/run_eval.py            # hızlı: arama + karar (LLM'siz)
    docker compose exec rag python eval/run_eval.py --llm      # LLM cevaplarıyla birlikte (yavaş)

Ölçtükleri:
  - Doğru kaynak: cevap doğru makaleden mi geldi (ilk sıra / ilk 3)
  - Doğru red: kapsam dışı, güvenlik ve başka firmaya ait sorularda "bilgim yok" diyor mu
  - Uydurma riski: cevap vermemesi gerekirken cevap verdi mi
  - Eşik kalibrasyonu: hangi güven eşiğinde en yüksek doğruluk elde ediliyor
Sorular asistan üzerinden değil doğrudan RAG'e sorulur; bilgi boşluğu radarı kirlenmez.
"""

import argparse
import json
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import main
from retrieval import fuse

HERE = os.path.dirname(__file__)


def tenant_id(name: str) -> str:
    with main.db() as c:
        row = c.execute(
            'SELECT "Id"::text FROM "Tenants" WHERE "Name" = %s', (name,)
        ).fetchone()
    if not row:
        sys.exit(f"'{name}' firması veritabanında yok. Demo verisi yüklendi mi?")
    return row[0]


def run(tenant: str, questions: list[dict], use_llm: bool) -> dict:
    print("İndeks eşitleniyor…", main.sync_tenant(tenant, force=True))
    rows, raw = [], []
    for item in questions:
        q, expect = item["q"], item["expect"]
        t0 = time.time()
        res = main.answer_question(tenant, q, use_llm=use_llm)
        ms = (time.time() - t0) * 1000
        titles = [s["title"] for s in res.get("sources", [])]
        if expect is None:
            ok = not res["answered"]
            verdict = "doğru red" if ok else "UYDURMA RİSKİ"
        else:
            ok = res["answered"] and expect in titles
            verdict = (
                ("doğru (1.)" if titles[:1] == [expect] else "doğru (ilk 3)")
                if ok
                else ("GEREKSİZ RED" if not res["answered"] else "YANLIŞ KAYNAK")
            )
        rows.append(
            {
                "q": q,
                "expect": expect,
                "got": titles[:1],
                "answered": res["answered"],
                "ok": ok,
                "verdict": verdict,
                "ms": round(ms),
                "mode": res.get("mode"),
                "score": res.get("best_score"),
            }
        )

        # Eşik taraması için ham puanları sakla (güvenlik filtresine takılanlar hariç)
        if not main.INJECTION.search(q):
            st = main.state(tenant)
            raw.append(
                {
                    "expect": expect,
                    "vec": main.vector_scores(tenant, q),
                    "kw": st.kw.search(q) if st.kw else {},
                }
            )
    return {"rows": rows, "raw": raw}


def sweep(tenant: str, raw: list[dict]) -> list[tuple[float, float]]:
    meta = main.state(tenant).meta
    out = []
    for i in range(13):
        th = round(0.35 + i * 0.025, 3)
        good = 0
        for r in raw:
            ranked = fuse(r["vec"], r["kw"], th)
            top = ranked[0] if ranked and ranked[0]["confident"] else None
            if r["expect"] is None:
                good += top is None
            else:
                good += top is not None and meta[top["id"]]["title"] == r["expect"]
        out.append((th, good / len(raw)))
    return out


def report(res: dict, tenant: str, use_llm: bool):
    rows = res["rows"]
    ins = [r for r in rows if r["expect"] is not None]
    oos = [r for r in rows if r["expect"] is None]
    top1 = sum(r["verdict"] == "doğru (1.)" for r in ins)
    top3 = sum(r["ok"] for r in ins)
    rej = sum(r["ok"] for r in oos)
    halluc = sum(r["verdict"] == "UYDURMA RİSKİ" for r in oos)
    mode = rows[0]["mode"] if rows else "?"
    sw = sweep(tenant, res["raw"]) if res["raw"] else []
    best = (
        max(sw, key=lambda x: (x[1], -abs(x[0] - main.SCORE_THRESHOLD))) if sw else None
    )

    lines = [
        "# RAG doğrulama raporu",
        "",
        f"- Tarih: {time.strftime('%Y-%m-%d %H:%M')}",
        (
            f"- Arama modu: **{'hibrit (anlam + kelime)' if mode == 'hybrid' else 'sadece kelime (Ollama kapalı)'}**"
            f" · LLM: {'açık' if use_llm else 'kapalı (sadece arama ve karar ölçüldü)'}"
        ),
        f"- Modeller: {main.EMBED_MODEL} / {main.LLM_MODEL} · güven eşiği: {main.SCORE_THRESHOLD}",
        "",
        "| Ölçüt | Sonuç |",
        "|---|---|",
        f"| Doğru makaleyi **ilk sırada** buldu | **%{round(100 * top1 / len(ins))}** ({top1}/{len(ins)}) |",
        f"| Doğru makale **ilk 3** içinde | **%{round(100 * top3 / len(ins))}** ({top3}/{len(ins)}) |",
        f"| Kapsam dışı / güvenlik / başka firma sorusunu **doğru reddetti** | **%{round(100 * rej / len(oos))}** ({rej}/{len(oos)}) |",
        f"| Uydurma riski (cevap vermemesi gerekirken verdi) | {halluc} |",
        f"| Ortalama cevap süresi | {round(statistics.mean(r['ms'] for r in rows))} ms |",
        "",
    ]
    if best:
        lines += ["## Eşik kalibrasyonu", "", "| Eşik | Genel doğruluk |", "|---|---|"]
        lines += [
            f"| {th}{' ← şu an' if abs(th - main.SCORE_THRESHOLD) < 0.001 else ''}{' ← en iyi' if (th, a) == best else ''} | %{round(100 * a)} |"
            for th, a in sw
        ]
        lines += [
            "",
            f"Önerilen eşik: **{best[0]}** (docker-compose.yml → rag → SCORE_THRESHOLD)",
            "",
        ]
    lines += ["## Hatalı sonuçlar", ""]
    bad = [r for r in rows if not r["ok"]]
    lines += [
        f'- {r["verdict"]}: "{r["q"]}" → beklenen: {r["expect"] or "bilgim yok"}, gelen: {r["got"] or "bilgim yok"} (puan {r["score"]})'
        for r in bad
    ] or ["- Yok 🎉"]

    text = "\n".join(lines)
    print("\n" + text)
    with open(os.path.join(HERE, "rapor.md"), "w", encoding="utf-8") as f:
        f.write(text + "\n")
    with open(os.path.join(HERE, "rapor.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print("\nRapor kaydedildi: eval/rapor.md")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant", default="Anka Lojistik")
    ap.add_argument(
        "--llm", action="store_true", help="LLM cevaplarını da üret (yavaş)"
    )
    a = ap.parse_args()
    with open(os.path.join(HERE, "questions.json"), encoding="utf-8") as f:
        qs = json.load(f)
    tid = tenant_id(a.tenant)
    report(run(tid, qs, a.llm), tid, a.llm)
