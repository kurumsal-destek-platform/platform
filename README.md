# Kurumsal Destek Platformu

Jira benzeri proje yönetimi + ticket + self-servis bilgi bankası + kendi sunucumuzda çalışan RAG asistanı.

| Klasör | İçerik |
| --- | --- |
| backend/ | .NET 8 Web API |
| rag-service/ | Python FastAPI RAG servisi |
| frontend/ | React + TypeScript + Vite |
| ml/ | Model seçimi, fine-tuning, raporlar |
| contracts/ | openapi.yaml, rag-api.yaml |
| data/synthetic/ | Sentetik demo verisi |
| docs/ | Veri modeli, kararlar |

## Başlarken
1. Repoyu kısa bir yola klonlayın (Windows: `C:\dev`).
2. `.env.example` dosyasını `.env` olarak kopyalayın: `cp .env.example .env`
3. `.env` asla commit edilmez.

## Kurallar
- `main`'e doğrudan push yok: dal → PR → 1 onay + CI yeşil.
- Dal adı: `feature/BACK-10-kisa-aciklama`
- Commit: `BACK-10: kısa açıklama`
- Repo public: gerçek firma verisi, şifre, token yok.
