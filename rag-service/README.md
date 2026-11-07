# RAG servisi

Kendi sunucumuzda çalışan soru-cevap servisi. Dış AI API'si yok.

## Kurulum (bir kez)
1. https://ollama.com → Windows için indir, kur.
2. Modelleri indir:
   ollama pull bge-m3
   ollama pull qwen2.5:3b
3. Python paketleri:
   cd rag-service
   python -m venv .venv
   source .venv/Scripts/activate      # Git Bash (Windows)
   pip install -r requirements.txt

## Çalıştırma
Veritabanı (docker compose up -d) ve backend en az bir kez çalışmış olmalı (makaleler oradan okunur).
   uvicorn main:app --port 8000
Test: http://localhost:8000/docs

Backend'e bağlamak: backend/src/Platform.Api/appsettings.Development.json → "Rag": { "Url": "http://localhost:8000" }

## Ayarlar (ortam değişkeni)
EMBED_MODEL (bge-m3), LLM_MODEL (qwen2.5:3b), SCORE_THRESHOLD (0.45), DATABASE_URL, OLLAMA_URL
