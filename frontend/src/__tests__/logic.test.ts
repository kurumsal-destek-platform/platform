import { describe, expect, it } from "vitest";
import { parseSteps } from "../components/SolveWizard";
import { formatDuration, PASSWORD_RULES } from "../api";

describe("Çözüm sihirbazı: makaleyi adımlara böler", () => {
  const body = "VPN bağlanmıyorsa şunları deneyin:\n1) İnterneti kontrol edin.\n2) Anka Connect'i kapatıp açın.\n3) Sunucu adresini kontrol edin.\n4) Hâlâ bağlanmıyorsa ticket açın.";

  it("numaralı satırlar adım, öncesi giriş olur", () => {
    const r = parseSteps(body);
    expect(r.intro).toBe("VPN bağlanmıyorsa şunları deneyin:");
    expect(r.steps).toEqual(["İnterneti kontrol edin.", "Anka Connect'i kapatıp açın.", "Sunucu adresini kontrol edin."]);
  });

  it("'ticket açın' satırı adım sayılmaz, nota taşınır", () => {
    expect(parseSteps(body).outro).toContain("ticket açın");
  });

  it("numara yoksa cümle cümle böler", () => {
    expect(parseSteps("Yazıcıyı açın. Kağıdı kontrol edin. Kuyruğu temizleyin.").steps).toHaveLength(3);
  });
});

describe("Süre biçimi", () => {
  it.each([[45, "45 dk"], [60, "1 sa"], [135, "2 sa 15 dk"], [60 * 26, "1 gün 2 sa"], [-90, "1 sa 30 dk"]])("%d dk → %s", (m, s) => {
    expect(formatDuration(m)).toBe(s);
  });
});

describe("Şifre kuralları (backend PasswordPolicy ile aynı olmalı)", () => {
  const ok = (p: string) => PASSWORD_RULES.every((r) => r.test(p));
  it("zayıf şifreleri reddeder", () => {
    for (const p of ["kisa1A", "hepsikucuk1", "HEPSIBUYUK1", "RakamYokSifre"]) expect(ok(p)).toBe(false);
  });
  it("Türkçe harfli güçlü şifreyi kabul eder", () => {
    expect(ok("Güçlü2026Şifre")).toBe(true);
    expect(ok("Demo123!")).toBe(true);
  });
});
