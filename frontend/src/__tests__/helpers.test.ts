import { describe, expect, it } from "vitest";
import {
  buildHistory, describeRule, filenameFromDisposition, highlightParts, readTicketFilters, transcript, writeTicketFilters, type ChatMsg,
} from "../helpers";

describe("İndirilen dosyanın adı", () => {
  it("Content-Disposition başlığından okunur", () => {
    expect(filenameFromDisposition('attachment; filename=verilerim-20261121.json; filename*=UTF-8\'\'verilerim-20261121.json', "x.json"))
      .toBe("verilerim-20261121.json");
    expect(filenameFromDisposition('attachment; filename="firma-verisi.json"', "x.json")).toBe("firma-verisi.json");
  });
  it("başlık yoksa yedek ad kullanılır", () => expect(filenameFromDisposition(undefined, "x.json")).toBe("x.json"));
});

describe("Asistan sohbeti", () => {
  const msgs: ChatMsg[] = [
    { role: "bot", text: "Merhaba" },
    { role: "user", text: "VPN bağlanmıyor" },
    { role: "bot", text: "1) İnterneti kontrol edin…", question: "VPN bağlanmıyor", answered: true },
    { role: "user", text: "ciro raporu nerede" },
    { role: "bot", text: "Bu konuda bilgim yok", question: "ciro raporu nerede", answered: false },
  ];

  it("takip sorusu için sadece cevaplanan çiftler gönderilir", () => {
    expect(buildHistory(msgs)).toEqual([{ question: "VPN bağlanmıyor", answer: "1) İnterneti kontrol edin…" }]);
  });
  it("en fazla son 3 çift", () => {
    const many: ChatMsg[] = Array.from({ length: 5 }, (_, i) => ({ role: "bot", text: `c${i}`, question: `s${i}`, answered: true }));
    expect(buildHistory(many).map((h) => h.question)).toEqual(["s2", "s3", "s4"]);
  });
  it("ticket açıklamasına eklenecek özet", () => {
    const t = transcript(msgs);
    expect(t).toContain("Soru: VPN bağlanmıyor");
    expect(t).toContain("Asistan: (cevap bulunamadı)");
    expect(t).not.toContain("Merhaba");
  });
});

describe("Kaynağı göster: vurgulama", () => {
  const body = "VPN bağlanmıyorsa şunları deneyin:\n1) İnterneti kontrol edin.\n2) Anka Connect'i kapatıp açın.";
  it("parça gövdede bulunur (boşluk ve büyük harf farkına rağmen)", () => {
    const [a, hit, b] = highlightParts(body, "VPN bağlanmıyor\n2) anka connect'i   kapatıp açın.");
    expect(hit).toBe("2) Anka Connect'i kapatıp açın.");
    expect(a + hit + b).toBe(body);
  });
  it("parça yoksa vurgu olmaz", () => expect(highlightParts(body, "tamamen başka bir metin parçası burada")[1]).toBe(""));
});

describe("Ticket filtreleri adres çubuğunda", () => {
  it("okuma ve yazma birbirinin tersi", () => {
    const f = { tab: "all" as const, q: "vpn", sla: "all" as const, open: true, page: 3 };
    expect(readTicketFilters(writeTicketFilters(f), true)).toEqual(f);
  });
  it("destek ekibi varsayılan olarak kuyruğu, çalışan kendi ticketlarını görür", () => {
    expect(readTicketFilters(new URLSearchParams(""), true).tab).toBe("all");
    expect(readTicketFilters(new URLSearchParams("tab=mine"), true).tab).toBe("mine");
    expect(readTicketFilters(new URLSearchParams(""), false).tab).toBe("mine");
  });
  it("SLA filtresi açık ticketları gösterir; yönetici değilse 'Tüm ticketlar' açılmaz", () => {
    const p = new URLSearchParams("sla=breached&tab=all");
    expect(readTicketFilters(p, true)).toMatchObject({ tab: "all", sla: "breached", open: true });
    expect(readTicketFilters(p, false).tab).toBe("mine");
  });
  it("diyalog parametresi korunur", () => {
    const keep = new URLSearchParams("open=abc");
    expect(writeTicketFilters({ tab: "all", q: "", sla: "all", open: false, page: 1 }, keep).toString()).toBe("open=abc");
  });
});

describe("Otomasyon kuralının cümlesi", () => {
  it("koşul ve eylem Türkçe yazılır", () => {
    const d = describeRule({ whenKeywords: "vpn, uzak bağlantı", setPriority: "High", setAssigneeId: "1", notifyManagers: true }, { "1": "Ali Çelik" });
    expect(d.when).toBe('başlık/açıklamada "vpn" veya "uzak bağlantı" geçerse');
    expect(d.then).toBe("Ali Çelik ata, öncelik Yüksek, yöneticilere bildir");
  });
  it("koşulsuz kural her ticket'a uyar", () => expect(describeRule({ notifyManagers: true }).when).toBe("her yeni ticket'ta"));
});
