// Ekrandan bağımsız küçük yardımcılar (birim testleri: __tests__/helpers.test.ts)
import { PRIORITIES, type AutomationRuleT } from "./api";

// "attachment; filename=verilerim-20261121.json" → "verilerim-20261121.json"
export function filenameFromDisposition(header: string | undefined | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")); } catch { /* düz ada düş */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : fallback;
}

// ---- Asistan sohbeti ----
export interface ChatMsg { role: "user" | "bot"; text: string; question?: string; answered?: boolean }

// Takip sorusu için son N soru-cevap çifti (sadece asistanın gerçekten cevapladıkları)
export function buildHistory(msgs: ChatMsg[], n = 3): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  for (const m of msgs) {
    if (m.role === "bot" && m.question && m.answered) out.push({ question: m.question, answer: m.text.slice(0, 1500) });
  }
  return out.slice(-n);
}

// Sohbetten ticket'a geçerken açıklamaya eklenecek özet
export function transcript(msgs: ChatMsg[]): string {
  const lines = msgs
    .filter((m) => m.role === "user" || m.question)
    .map((m) => (m.role === "user" ? `Soru: ${m.text}` : `Asistan: ${m.answered ? m.text.slice(0, 600) : "(cevap bulunamadı)"}`));
  return lines.length ? `Asistanla yazışma:\n${lines.join("\n")}` : "";
}

// Makale gövdesinde kaynak parçayı bul (boşluk/büyük-küçük harf farkını yok say) → vurgulamak için 3 parça
export function highlightParts(body: string, snippet?: string | null): [string, string, string] {
  if (!snippet) return [body, "", ""];
  const norm = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
  // RAG parçası başlıkla başlar; makale gövdesinde başlık olmadığı için ilk satırı atıp deneriz
  const candidates = [snippet, snippet.split("\n").slice(1).join("\n")].filter((c) => c.trim().length > 15);
  for (const full of candidates) {
    const c = full.slice(0, 160);
    const target = norm(c);
    // gövdeyi normalize ederken orijinal indeksleri koru
    let flat = "", map: number[] = [];
    for (let i = 0; i < body.length; i++) {
      const ch = /\s/.test(body[i]) ? " " : body[i].toLocaleLowerCase("tr-TR");
      if (ch === " " && flat.endsWith(" ")) continue;
      flat += ch; map.push(i);
    }
    const at = flat.indexOf(target);
    if (at >= 0) {
      const start = map[at], endFlat = Math.min(at + target.length, map.length) - 1;
      // aranan kısım 160 karakterde kesildiyse vurguyu parçanın tam uzunluğuna kadar uzat
      const end = full.length > c.length ? Math.min(body.length, start + full.length) : map[endFlat] + 1;
      return [body.slice(0, start), body.slice(start, end), body.slice(end)];
    }
  }
  return [body, "", ""];
}

// Ticket listesi filtreleri adres çubuğunda durur (yenileyince kaybolmaz, bağlantı paylaşılabilir)
export interface TicketFilters { tab: "mine" | "all"; q: string; sla: "all" | "at_risk" | "breached"; open: boolean; page: number }

export function readTicketFilters(p: URLSearchParams, isManager: boolean): TicketFilters {
  const sla = p.get("sla");
  return {
    // Destek ekibi için varsayılan sekme "Tüm ticketlar" (kuyruk); çalışan sadece kendi ticketlarını görür
    tab: !isManager ? "mine" : p.get("tab") === "mine" && !sla ? "mine" : "all",
    q: p.get("q") ?? "",
    sla: sla === "at_risk" || sla === "breached" ? sla : "all",
    open: p.get("acik") === "1" || !!sla,
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

export function writeTicketFilters(f: TicketFilters, keep?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams();
  // ?open=<ticketId> ve ?rate=<id> diyalog parametreleri korunur ("sadece açıklar" filtresi ?acik=1)
  for (const k of ["open", "rate"]) { const v = keep?.get(k); if (v) p.set(k, v); }
  if (f.tab === "mine") p.set("tab", "mine");
  if (f.q) p.set("q", f.q);
  if (f.sla !== "all") p.set("sla", f.sla);
  if (f.open && f.sla === "all") p.set("acik", "1");
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}

// Kuralın Türkçe cümlesi: "Başlıkta 'vpn' geçerse → Ali Çelik'e ata, öncelik Yüksek"
export function describeRule(r: Partial<AutomationRuleT>, names?: Record<string, string>): { when: string; then: string } {
  const when: string[] = [];
  if (r.whenKeywords) when.push(`başlık/açıklamada "${r.whenKeywords.split(",").map((k) => k.trim()).filter(Boolean).join('" veya "')}" geçerse`);
  if (r.whenCategory) when.push(`kategori ${r.whenCategory} ise`);
  if (r.whenPriority) when.push(`öncelik ${PRIORITIES[r.whenPriority] ?? r.whenPriority} ise`);
  if (r.whenSenderDomain) when.push(`gönderen @${r.whenSenderDomain.replace(/^@/, "")} ise`);
  const then: string[] = [];
  const who = r.assigneeName ?? (r.setAssigneeId ? names?.[r.setAssigneeId] : undefined);
  if (r.setAssigneeId) then.push(`${who ?? "seçilen kişiye"} ata`);
  if (r.setPriority) then.push(`öncelik ${PRIORITIES[r.setPriority] ?? r.setPriority}`);
  if (r.setCategory) then.push(`kategori ${r.setCategory}`);
  if (r.notifyManagers) then.push("yöneticilere bildir");
  return { when: when.length ? when.join(" ve ") : "her yeni ticket'ta", then: then.join(", ") || "—" };
}

