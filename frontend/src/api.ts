import axios from "axios";

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
export interface Project { id: string; key: string; name: string; description: string; myRole: string }
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
  workItemId?: string | null; workItemKey?: string | null; resolutionNote?: string | null;
}
export interface ArticleLite { id: string; title: string; category: string; snippet: string; published?: boolean; fromTicket?: boolean }
export interface Article { id: string; title: string; body: string; category: string; published?: boolean }
export interface AskResponse {
  answered: boolean; answer?: string; message?: string; reason?: string;
  sources?: { source_id: string; title: string }[];
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
