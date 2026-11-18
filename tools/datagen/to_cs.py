import json, sys
d = json.load(open(__import__("os").path.join(__import__("os").path.dirname(__file__), "out", "seed.json")))
s = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
assert '"""' not in s
open(sys.argv[1], "w", encoding="utf-8").write(
 "namespace Platform.Api;\n\n// Otomatik üretildi (datagen/gen.py). Elle düzenlemeyin; veriyi değiştirmek için gen.py'yi çalıştırın.\n"
 "public static class SeedData\n{\n    public const string Json = \"\"\"\n" + s + "\n\"\"\";\n}\n")
