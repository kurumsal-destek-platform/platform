import axios from "axios";

// Backend adresi .env dosyasından gelir (VITE_API_URL).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:5235",
});

const TOKEN_KEY = "kdp_token";
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
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
    if (err.response?.status === 401 && !err.config?.url?.includes("/auth/login")) {
      tokenStore.clear();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e.response?.data?.message ?? e.message ?? "Bir hata oluştu";
}

// ---- Tipler (backend DTO'ları ile aynı) ----
export interface Me {
  id: string; email: string; fullName: string; role: string; tenantId: string; tenantName?: string;
}
export interface UserLite { id: string; fullName: string; email: string; role: string }
export interface Project { id: string; key: string; name: string; description: string; myRole: string }
export interface ProjectDetail extends Project {
  members: { userId: string; fullName: string; role: string }[];
}
export interface WorkItem {
  id: string; key: string; type: string; title: string; description: string;
  status: string; priority: string; dueDate?: string | null; createdAt: string;
  parentId?: string | null; parentKey?: string | null;
  assigneeId?: string | null; assigneeName?: string | null;
  reporterId: string; reporterName?: string | null;
}
export interface WorkItemDetail {
  item: WorkItem; children: WorkItem[];
  permissions: { canEdit: boolean; canAssign: boolean; canComment: boolean };
}
export interface CommentT { id: string; body: string; createdAt: string; authorId: string; authorName?: string }
export interface Ticket {
  id: string; title: string; description: string; category: string; priority: string; status: string;
  createdAt: string; reporterId: string; reporterName?: string; assigneeId?: string | null; assigneeName?: string | null;
}
export interface ArticleLite { id: string; title: string; category: string; snippet: string }
export interface Article { id: string; title: string; body: string; category: string }
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
