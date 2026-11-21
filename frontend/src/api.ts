import axios from "axios";
import { filenameFromDisposition } from "./helpers";

// Backend adresi .env dosyasından gelir (VITE_API_URL).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:5235",
});

const TOKEN_KEY = "kdp_token";
// "Beni hatırla" seçilirse tarayıcı kapansa da kalır (localStorage), seçilmezse sekme kapanınca silinir (sessionStorage)
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };
export const tokenStore = {
  get: () => safe(() => localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY), null),
  set: (t: string, remember = true) => safe(() => {
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    (remember ? sessionStorage : localStorage).removeItem(TOKEN_KEY);
  }, undefined),
  clear: () => safe(() => { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); }, undefined),
};

// Her isteğe JWT'yi ekle.
api.interceptors.request.use((config) => {
  const t = tokenStore.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// Token süresi dolarsa giriş sayfasına dön.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url: string = err.config?.url ?? "";
    const publicAuth = ["/auth/login", "/auth/register", "/auth/forgot-password", "/auth/set-password",
      "/auth/check-token", "/auth/verify-email", "/auth/resend-verification", "/auth/change-password"];
    if (err.response?.status === 401 && !publicAuth.some((p) => url.includes(p))) {
      tokenStore.clear();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export function errorMessage(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
  if (e.response?.data?.message) return e.response.data.message;
  if (e.response?.status === 429) return "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.";
  if (!e.response) return "Sunucuya ulaşılamıyor. Backend çalışıyor mu?";
  return e.message ?? "Bir hata oluştu";
}
export function errorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { code?: string } } }).response?.data?.code;
}

// Şifre kuralları (backend'deki PasswordPolicy ile aynı)
export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "En az 8 karakter", test: (p) => p.length >= 8 },
  { label: "Bir büyük harf", test: (p) => /\p{Lu}/u.test(p) },
  { label: "Bir küçük harf", test: (p) => /\p{Ll}/u.test(p) },
  { label: "Bir rakam", test: (p) => /\d/.test(p) },
];

// ---- Tipler (backend DTO'ları ile aynı) ----
export interface Me {
  id: string; email: string; fullName: string; role: string; tenantId: string; tenantName?: string;
}
export interface UserLite {
  id: string; fullName: string; email: string; role: string;
  isActive?: boolean; invited?: boolean; locked?: boolean; lastLoginAt?: string | null; createdAt?: string;
}
// İlerleme: Epic'ler sayılmaz. mine = bana atanan işler, team = projenin tamamı (liste uçunda gelir)
export interface ProgressStats { total: number; done: number; inProgress: number; overdue: number; percent: number }
export interface Project { id: string; key: string; name: string; description: string; myRole: string; mine?: ProgressStats; team?: ProgressStats }
export interface ProjectDetail extends Project {
  members: { userId: string; fullName: string; role: string }[];
}
export interface WorkItem {
  id: string; key: string; type: string; title: string; description: string;
  status: string; priority: string; dueDate?: string | null; createdAt: string;
  parentId?: string | null; parentKey?: string | null; startDate?: string | null;
  assigneeId?: string | null; assigneeName?: string | null;
  reporterId: string; reporterName?: string | null;
  storyPoints?: number | null; sprintId?: string | null; rank?: number; labels?: string[];
}
export interface LinkT {
  id: string; type: string; outgoing: boolean; label: string;
  other: { key: string; title: string; status: string; type: string };
}
export interface AttachmentT {
  id: string; fileName: string; contentType: string; size: number; createdAt: string; isImage: boolean; uploadedBy?: string;
}
export interface SavedFilterT { id: string; name: string; query: string; shared: boolean; mine: boolean; ownerName?: string }
export interface Sprint {
  id: string; name: string; goal: string; status: "planned" | "active" | "closed";
  startDate?: string | null; endDate?: string | null; itemCount?: number; points?: number; donePoints?: number;
}
export interface Activity {
  id: string; action: string; field?: string | null; oldValue?: string | null; newValue?: string | null;
  at: string; userName?: string | null; itemKey?: string | null;
}
export interface NotificationT { id: string; title: string; body: string; link?: string | null; isRead: boolean; createdAt: string }
export interface SearchResult {
  items: { key: string; title: string; type: string; status: string; projectKey: string }[];
  tickets: { id: string; title: string; status: string }[];
  articles: { id: string; title: string; category: string }[];
}
export interface Dashboard {
  workItems: {
    total: number; overdue: number; unassigned: number;
    byStatus: { status: string; count: number }[];
    byAssignee: { name: string; open: number; points: number }[];
  };
  tickets: {
    total: number; open: number; avgResolutionHours: number | null;
    byStatus: { status: string; count: number }[];
    byCategory: { category: string; count: number }[];
  };
  selfService: { solvedWithoutTicket: number; ticketsCreated: number; deflectionRate: number };
  projects: {
    key: string; name: string; total: number; done: number;
    activeSprint: { name: string; endDate: string; points: number; donePoints: number } | null;
  }[];
}
export interface WorkItemDetail {
  item: WorkItem; children: WorkItem[];
  sprint?: { id: string; name: string; status: string } | null;
  permissions: { canEdit: boolean; canAssign: boolean; canComment: boolean };
}
export interface CommentT { id: string; body: string; createdAt: string; authorId: string; authorName?: string }
export interface Ticket {
  id: string; title: string; description: string; category: string; priority: string; status: string;
  createdAt: string; reporterId: string; reporterName?: string; assigneeId?: string | null; assigneeName?: string | null;
  workItemId?: string | null; workItemKey?: string | null; resolutionNote?: string | null; incidentId?: string | null;
  resolvedAt?: string | null;
  sla?: SlaInfo;
  csat?: { rating: number; comment?: string | null; at: string } | null;
}
export type SlaState = "met" | "breached" | "running" | "at_risk" | "none";
export interface SlaInfo {
  responseDueAt?: string | null; resolutionDueAt?: string | null; firstResponseAt?: string | null;
  response: SlaState; resolution: SlaState;
}
export interface QualityT {
  days: number;
  sla: {
    responsePct: number; resolutionPct: number; openBreached: number; openAtRisk: number;
    byPriority: { priority: string; total: number; pct: number }[];
    watch: { id: string; title: string; priority: string; status: string; createdAt: string; resolutionDueAt: string; responseDueAt: string;
      assigneeName?: string | null; response: SlaState; resolution: SlaState }[];
  };
  csat: {
    average: number; count: number; responseRate: number;
    distribution: { rating: number; count: number }[];
    comments: { title: string; rating: number; comment: string; csatAt: string; reporterName?: string; assigneeName?: string | null }[];
  };
  trend: { week: string; slaPct: number | null; csat: number | null }[];
  agents: { name?: string; resolved: number; slaPct: number; csat: number | null; medianHours: number }[];
}
export interface SavingsT {
  days: number;
  assumptions: { minutesPerTicket: number; hourlyCost: number; medianWaitHours: number };
  deflected: number; bySource: { wizard: number; article: number; assistant: number };
  ticketsCreated: number; deflectionRate: number; supportHoursSaved: number; moneySaved: number; employeeHoursSaved: number;
  assistantAnswered: number;
  wizard: { solved: number; escalated: number; avgSteps: number };
  weekly: { week: string; deflected: number; tickets: number }[];
  topArticles: { id: string; title: string; solved: number }[];
}
export interface SettingsT {
  workStartHour: number; workEndHour: number; workDays: number[]; hourlyCost: number; minutesPerTicket: number;
  policies: { priority: string; responseHours: number; resolutionHours: number }[];
}

export interface ArticleLite { id: string; title: string; category: string; snippet: string; published?: boolean; fromTicket?: boolean }
export interface Article { id: string; title: string; body: string; category: string; published?: boolean }
export interface AskResponse {
  answered: boolean; answer?: string; message?: string; reason?: string; mode?: string;
  // snippet/text: RAG servisi cevabın dayandığı parçayı gönderirse "Kaynağı göster" onu vurgular
  sources?: { source_id: string; title: string; snippet?: string; text?: string }[];
}

// ---- Akıllı özellikler ----
export interface IncidentT {
  id: string; title: string; description: string; severity: string; status: "active" | "resolved";
  resolutionNote?: string | null; createdAt: string; resolvedAt?: string | null;
  ownerId?: string | null; ownerName?: string | null; createdByName?: string | null;
  ticketCount: number; openCount: number; affectedUsers: number;
  tickets: { id: string; title: string; status: string; createdAt: string; reporterName?: string }[];
}
export interface IncidentSuggestion {
  title: string; category: string; count: number; affectedUsers: number; firstAt: string; perHour: number;
  ticketIds: string[]; tickets: { id: string; title: string; createdAt: string; reporterName?: string }[];
}
export interface IncidentMatch {
  incident: { id: string; title: string; description: string; createdAt: string; affected: number; score: number } | null;
  similarOpen: number;
}
export interface AssignSuggestion {
  userId: string; fullName: string; role: string; load: number; similarCount: number; avgHours: number | null;
  reasons: string[]; examples: { id: string; title: string; sim: number }[]; match: number; best: boolean;
}
export interface KnowledgeGap {
  topic: string; questionCount: number; ticketCount: number; affectedUsers: number; lastAt: string; score: number;
  supportHours: number; hasKnownFix: boolean; questionIds: string[]; ticketIds: string[];
  samples: { kind: "question" | "ticket"; id: string; text: string; userName?: string; at: string; resolution?: string | null }[];
}
export interface KnowledgeGapsResponse {
  mode: "semantic" | "keyword";
  stats: { totalQuestions: number; unanswered: number; answerRate: number };
  gaps: KnowledgeGap[];
}
export interface SprintRiskT {
  available: boolean; message?: string;
  sprint?: { id: string; name: string; startDate: string; endDate: string; projectKey: string };
  unit: string; total: number; done: number; projected: number; completion: number; timePct: number; workPct: number;
  daysLeft: number; ratePerDay: number; usedHistory: number; level: "low" | "medium" | "high";
  risks: { key: string; title: string; status: string; points?: number | null; assigneeName?: string | null; reasons: string[]; severity: "high" | "medium" }[];
  recommendations: string[];
  burndown: { date: string; ideal: number; actual: number | null; forecast: number | null }[];
}

export const STATUSES: { key: string; label: string }[] = [
  { key: "todo", label: "Yapılacak" },
  { key: "in_progress", label: "Devam ediyor" },
  { key: "in_review", label: "İncelemede" },
  { key: "done", label: "Tamamlandı" },
];
export const statusLabel = (s: string) => STATUSES.find((x) => x.key === s)?.label ?? s;

export const TICKET_STATUSES: Record<string, string> = {
  open: "Açık", assigned: "Atandı", in_progress: "İşlemde", resolved: "Çözüldü", closed: "Kapandı",
};
export const CATEGORIES = ["Donanım", "Yazılım/Lisans", "Ağ/VPN", "Erişim/Hesap", "E-posta", "Diğer"];
export const PRIORITIES: Record<string, string> = { Low: "Düşük", Medium: "Orta", High: "Yüksek", Critical: "Kritik" };
export const TYPES = ["Epic", "Story", "Task", "Bug", "Subtask"];

// Geçmiş satırını Türkçe cümleye çevirir
export function describeActivity(a: Activity): string {
  const v = (x?: string | null) => (x ? (STATUSES.find((s) => s.key === x)?.label ?? x) : "—");
  switch (a.action) {
    case "created": return "oluşturdu";
    case "comment": return "yorum yazdı";
    case "status": return `durumu değiştirdi: ${v(a.oldValue)} → ${v(a.newValue)}`;
    case "assignee": return `atananı değiştirdi: ${v(a.oldValue)} → ${v(a.newValue)}`;
    case "sprint": return `sprinte taşıdı: ${v(a.oldValue)} → ${v(a.newValue)}`;
    case "updated": return a.oldValue || a.newValue
      ? `${a.field} alanını değiştirdi: ${v(a.oldValue)} → ${v(a.newValue)}`
      : `${a.field} alanını güncelledi`;
    default: return a.action;
  }
}

// "2 sa 15 dk" gibi kısa süre
export function formatDuration(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return `${m} dk`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} sa${m % 60 ? ` ${m % 60} dk` : ""}`;
  return `${Math.floor(m / 1440)} gün${Math.floor((m % 1440) / 60) ? ` ${Math.floor((m % 1440) / 60)} sa` : ""}`;
}
export const formatTL = (n: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "az önce";
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  return `${Math.floor(s / 86400)} gün önce`;
}

export const isOverdue = (w: { dueDate?: string | null; status: string }) =>
  !!w.dueDate && w.status !== "done" && new Date(w.dueDate).getTime() < Date.now();

export const formatSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

// Ekler yetki gerektirdiği için <img src> ile değil, token'lı istekle blob olarak alınır
export async function fetchAttachmentUrl(id: string): Promise<string> {
  const r = await api.get(`/api/attachments/${id}`, { responseType: "blob" });
  return URL.createObjectURL(r.data as Blob);
}

// Dosya indirme (token gerektiren uçlar için): blob olarak alır, tarayıcıya kaydettirir
export async function downloadFile(path: string, fallbackName: string): Promise<string> {
  const r = await api.get(path, { responseType: "blob", timeout: 120000 });
  const name = filenameFromDisposition(r.headers["content-disposition"] as string | undefined, fallbackName);
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
}

export interface TicketPage {
  items: Ticket[]; total: number; page: number; pageSize: number; pages: number;
  counts: { breached: number; atRisk: number };
}

export interface AutomationRuleT {
  id: string; name: string; enabled: boolean; sortOrder: number;
  whenCategory?: string | null; whenPriority?: string | null; whenKeywords?: string | null; whenSenderDomain?: string | null;
  setAssigneeId?: string | null; assigneeName?: string | null; setPriority?: string | null; setCategory?: string | null;
  notifyManagers: boolean; stopProcessing: boolean; runCount: number; lastRunAt?: string | null; createdAt: string;
}
export interface DigestPreview {
  enabled: boolean; lastSentAt?: string | null; from: string; to: string;
  opened: number; resolved: number; openNow: number; breachedOpen: number; slaPercent: number | null; csat: number | null; csatCount: number;
  deflected: number; moneySaved: number; topUnanswered: { question: string; count: number }[]; html: string;
}
export interface MailChannelT { supportAddress: string; mailpitInbox: boolean; webhook: boolean; lastCheckAt?: string | null }
