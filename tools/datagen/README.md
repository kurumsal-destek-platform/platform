# Demo verisi üreticisi
Veriyi değiştirmek için `articles.py` (makaleler, ticket şablonları, boşluk konuları) veya `gen.py` (kişiler, projeler) düzenleyin:
```
cd tools/datagen
python gen.py                                              # out/seed.json üretir
python to_cs.py ../../backend/src/Platform.Api/SeedData.cs # backend'e gömer
```
Sonra veritabanını sıfırlayın: `docker compose down -v` ve `docker compose up -d --build`.
