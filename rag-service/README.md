# RAG servisi v2

Model **eğitilmez**. Genel bir Türkçe dil modeli (qwen2.5) her firmanın kendi bilgi bankasından bulunan
parçalara dayanarak cevap yazar. Bilgi firmaya özel, model ortaktır.

## Nasıl çalışır
1. **İndeksleme:** Yayınlanmış makaleler ~700 karakterlik parçalara bölünür, `bge-m3` ile vektöre çevrilir ve
   PostgreSQL'de (`rag_chunks` tablosu, pgvector) kalıcı saklanır. Sadece değişen parçalar yeniden hesaplanır.
   Backend makale eklenince/düzenlenince/yayınlanınca `/reindex` çağırır; ayrıca en geç 60 sn'de bir kontrol edilir.
2. **Arama:** Soru vektöre çevrilir; **sadece o firmanın** parçalarında anlam araması (pgvector) + kelime araması (BM25)
   yapılır ve puanlar birleştirilir (hibrit arama).
3. **Karar:** Güven eşiğinin altındaysa "Bu konuda bilgim yok" denir. Değilse LLM, sadece bulunan parçalarla cevap yazar
   ve kaynakları döndürür.

## Dayanıklılık
| Durum | Davranış |
|---|---|
| Ollama kapalı | Kelime aramasıyla "güvenli mod": daha az soruya cevap verir ama uydurmaz |
| LLM hata verdi | En uygun makale parçası olduğu gibi gösterilir |
| RAG servisi kapalı | Backend kendi bilgi bankası aramasına düşer |
| "Önceki talimatları unut", "diğer şirketler" | Güvenlik filtresi reddeder |

## Uçlar
`POST /ask`, `POST /search`, `POST /reindex?tenant_id=`, `POST /coverage` (bilgi boşluğu radarı), `GET /health`

## Doğruluğu ölçmek
```
docker compose exec rag python eval/run_eval.py          # hızlı: arama + karar
docker compose exec rag python eval/run_eval.py --llm    # LLM cevaplarıyla
```
Rapor `eval/rapor.md` dosyasına yazılır; önerilen güven eşiği de raporda çıkar.
Soru seti: `eval/questions.json` (50 soru: 40 bilgi bankası, 10 kapsam dışı/güvenlik/başka firma).
