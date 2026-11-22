import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Chip, Dialog, InputBase, List, ListItemButton, Stack, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/AddCircleOutlined";
import GoIcon from "@mui/icons-material/SubdirectoryArrowRight";
import TicketIcon from "@mui/icons-material/ConfirmationNumberOutlined";
import ArticleIcon from "@mui/icons-material/ArticleOutlined";
import ThemeIcon from "@mui/icons-material/DarkModeOutlined";
import AiIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { api, statusLabel, type SearchResult } from "../api";
import { useAuth } from "../auth";
import { useThemeMode } from "../theme";
import { TypeIcon } from "./common";

interface Cmd { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void; keywords?: string }

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const shortcutLabel = isMac ? "⌘K" : "Ctrl K";

// Ctrl/⌘+K: her şeye klavyeden ulaşın. Sayfalar, işlemler ve canlı arama sonuçları tek listede.
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const { toggle } = useThemeMode();
  const isManager = user?.role === "Manager" || user?.role === "Admin";
  const isSupport = isManager || user?.role === "Agent";
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { if (open) { setText(""); setQ(""); setSel(0); } }, [open]);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 200); return () => clearTimeout(t); }, [text]);

  const res = useQuery({
    queryKey: ["search", q],
    queryFn: async () => (await api.get<SearchResult>("/api/search", { params: { q } })).data,
    enabled: open && q.length >= 2,
  });

  const go = (to: string) => () => { onClose(); nav(to); };
  const base: Cmd[] = useMemo(() => {
    const pages: [string, string, string?][] = [
      ["/", "Sizin için", "ana sayfa"], ["/projects", "Projeler"], ["/tickets", "Ticketlar"], ["/kb", "Bilgi bankası", "makale"],
      ["/assistant", "Asistan", "yapay zeka soru"], ["/profile", "Profil", "şifre"],
      ...(isSupport ? [
        ["/tickets?tab=all", "Tüm talepler", "kuyruk destek"], ["/incidents", "Büyük olaylar", "incident"], ["/insights/gaps", "Bilgi boşlukları", "radar"],
        ["/tickets?sla=breached", "SLA'sı aşılan ticketlar"],
      ] as [string, string, string?][] : []),
      ...(isManager ? [
        ["/dashboard", "Gösterge paneli"], ["/performance", "Performans", "sla memnuniyet csat"], ["/performance?tab=savings", "Tasarruf paneli", "roi tl saat"],
        ["/users", "Kullanıcılar", "davet"],
        ["/settings", "Hedefler ve varsayımlar", "sla mesai ayar"], ["/system", "Sistem durumu", "sağlık health"], ["/system?tab=audit", "Denetim kaydı", "audit log kvkk"]
      ] as [string, string, string?][] : []),
    ];
    return [
      { id: "new-ticket", group: "İşlemler", label: "Yeni talep oluştur", hint: "sorun bildir", icon: <AddIcon fontSize="small" />, run: go("/tickets/new"), keywords: "yeni talep" },
      { id: "ask", group: "İşlemler", label: "Asistana sor", icon: <AiIcon fontSize="small" />, run: go("/assistant") },
      { id: "theme", group: "İşlemler", label: "Temayı değiştir", hint: "aydınlık / karanlık", icon: <ThemeIcon fontSize="small" />, run: () => { toggle(); onClose(); }, keywords: "dark light" },
      { id: "logout", group: "İşlemler", label: "Çıkış yap", icon: <GoIcon fontSize="small" />, run: () => { onClose(); logout(); nav("/login"); } },
      ...pages.map(([to, label, kw]) => ({ id: to, group: "Git", label, icon: <GoIcon fontSize="small" />, run: go(to), keywords: kw })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, isSupport]);

  const items: Cmd[] = useMemo(() => {
    const t = text.toLocaleLowerCase("tr");
    const local = base.filter((c) => !t || `${c.label} ${c.keywords ?? ""} ${c.hint ?? ""}`.toLocaleLowerCase("tr").includes(t));
    const r = res.data;
    const found: Cmd[] = q.length >= 2 && r ? [
      ...r.items.map((i) => ({ id: `i-${i.key}`, group: "İş öğeleri", label: `${i.key} ${i.title}`, hint: statusLabel(i.status), icon: <TypeIcon type={i.type} />, run: go(`/projects/${i.projectKey}?item=${i.key}`) })),
      ...r.tickets.map((x) => ({ id: `t-${x.id}`, group: "Ticketlar", label: x.title, hint: x.status, icon: <TicketIcon fontSize="small" />, run: go("/tickets") })),
      ...r.articles.map((a) => ({ id: `a-${a.id}`, group: "Makaleler", label: a.title, hint: a.category, icon: <ArticleIcon fontSize="small" />, run: go(`/kb?article=${a.id}`) })),
    ] : [];
    return [...local.slice(0, t ? 8 : 12), ...found];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, q, res.data, base]);

  useEffect(() => { setSel(0); }, [text]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[sel]?.run(); }
  };

  let lastGroup = "";
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { position: "absolute", top: "12vh", m: 2 } } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <SearchIcon color="action" />
        <InputBase autoFocus fullWidth placeholder="Ne yapmak istiyorsunuz? Sayfa, işlem, ticket, makale ya da ANK-3…"
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} sx={{ fontSize: 16 }}
          inputProps={{ "aria-label": "Komut ara" }} />
        <Chip size="small" label="Esc" variant="outlined" />
      </Stack>
      <List ref={listRef} dense sx={{ maxHeight: 420, overflowY: "auto", py: 1 }}>
        {items.length === 0 && <Typography sx={{ p: 2 }} color="text.secondary">{res.isFetching ? "Aranıyor…" : "Sonuç yok."}</Typography>}
        {items.map((c, i) => {
          const header = c.group !== lastGroup ? (lastGroup = c.group) : null;
          return (
            <Box key={c.id}>
              {header && <Typography variant="overline" color="text.secondary" sx={{ px: 2, display: "block", lineHeight: 2.2 }}>{header}</Typography>}
              <ListItemButton data-idx={i} selected={i === sel} onMouseEnter={() => setSel(i)} onClick={c.run} sx={{ mx: 1, borderRadius: 1 }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", width: "100%" }}>
                  <Box sx={{ display: "flex", color: "text.secondary" }}>{c.icon}</Box>
                  <Typography variant="body2" noWrap sx={{ flex: 1 }}>{c.label}</Typography>
                  {c.hint && <Typography variant="caption" color="text.secondary" noWrap>{c.hint}</Typography>}
                </Stack>
              </ListItemButton>
            </Box>
          );
        })}
      </List>
      <Stack direction="row" spacing={2} sx={{ px: 2, py: 1, borderTop: 1, borderColor: "divider", color: "text.secondary" }}>
        <Typography variant="caption">↑↓ seç</Typography>
        <Typography variant="caption">↵ aç</Typography>
        <Typography variant="caption">{shortcutLabel} her yerden aç</Typography>
      </Stack>
    </Dialog>
  );
}
