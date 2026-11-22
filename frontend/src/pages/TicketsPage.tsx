import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, Chip, InputAdornment, LinearProgress, MenuItem, Pagination, Stack, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import StarIcon from "@mui/icons-material/StarRounded";
import {
  api, errorMessage, isSupportRole, PRIORITIES, TICKET_STATUSES, timeAgo, type Ticket, type TicketPage, type UserLite,
} from "../api";
import { useAuth } from "../auth";
import { readTicketFilters, writeTicketFilters, type TicketFilters } from "../helpers";
import { Person } from "../components/common";
import TicketDialog from "../components/TicketDialog";
import { CsatDialog, CsatStars, SlaChip } from "../components/SlaCsat";

const PAGE_SIZE = 25;
const isOpen = (t: Ticket) => ["open", "assigned", "in_progress", "waiting"].includes(t.status);
const slaOf = (t: Ticket) => (t.sla?.response === "breached" || t.sla?.resolution === "breached") ? "breached"
  : (t.sla?.response === "at_risk" || t.sla?.resolution === "at_risk") ? "at_risk" : "ok";
const matches = (t: Ticket, q: string) => {
  if (!q) return true;
  const s = q.toLocaleLowerCase("tr-TR");
  return t.title.toLocaleLowerCase("tr-TR").includes(s) || t.description.toLocaleLowerCase("tr-TR").includes(s);
};

function useDebounce<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function TicketsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [params, setParams] = useSearchParams();
  const isManager = isSupportRole(user?.role);   // destek ekibi: tüm kuyruk, atama, durum

  // Filtreler adres çubuğunda: yenileyince kaybolmaz, bağlantı paylaşılabilir
  const f = readTicketFilters(params, isManager);
  const setF = (patch: Partial<TicketFilters>) => {
    const next = { ...f, ...patch };
    if (!("page" in patch)) next.page = 1;          // filtre değişince ilk sayfaya dön
    setParams(writeTicketFilters(next, params), { replace: true });
  };
  const [search, setSearch] = useState(f.q);
  const q = useDebounce(search.trim(), 350);
  useEffect(() => { if (q !== f.q) setF({ q }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // "/" tuşu arama kutusuna odaklar (yazı alanındayken değil)
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [error, setError] = useState("");
  const openId = params.get("open");
  const rateId = params.get("rate");
  const dropParam = (k: string) => { params.delete(k); setParams(params, { replace: true }); };

  const mine = useQuery({ queryKey: ["myTickets"], queryFn: async () => (await api.get<Ticket[]>("/api/tickets/mine")).data });
  const all = useQuery({
    queryKey: ["allTickets", f.q, f.sla, f.open, f.page], enabled: isManager && f.tab === "all",
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<TicketPage>("/api/tickets", {
      params: { page: f.page, pageSize: PAGE_SIZE, search: f.q || undefined, open: f.open || undefined, sla: f.sla === "all" ? undefined : f.sla },
    })).data,
  });
  const users = useQuery({ queryKey: ["users"], enabled: isManager, queryFn: async () => (await api.get<UserLite[]>("/api/users")).data });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["myTickets"] }); qc.invalidateQueries({ queryKey: ["allTickets"] }); };
  const assign = useMutation({
    mutationFn: ({ id, uid }: { id: string; uid: string }) => api.put(`/api/tickets/${id}/assignee`, { assigneeId: uid || null }),
    onSuccess: refresh, onError: (e) => setError(errorMessage(e)),
  });
  const status = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => api.patch(`/api/tickets/${id}/status`, { status: s }),
    onSuccess: refresh, onError: (e) => setError(errorMessage(e)),
  });

  // "Benim ticketlarım" küçük bir liste: tarayıcıda süzülür. "Tüm ticketlar" sunucuda sayfalanır.
  const mineRows = useMemo(() => (mine.data ?? []).filter((t) =>
    matches(t, f.q) && (!f.open || isOpen(t)) && (f.sla === "all" || (isOpen(t) && slaOf(t) === f.sla))), [mine.data, f.q, f.open, f.sla]);
  const mineCounts = useMemo(() => {
    const open = (mine.data ?? []).filter((t) => isOpen(t) && matches(t, f.q));
    return { breached: open.filter((t) => slaOf(t) === "breached").length, atRisk: open.filter((t) => slaOf(t) === "at_risk").length };
  }, [mine.data, f.q]);

  const showAll = f.tab === "all" && isManager;
  const rows = showAll ? all.data?.items ?? [] : mineRows;
  const counts = showAll ? all.data?.counts ?? { breached: 0, atRisk: 0 } : mineCounts;
  const loading = showAll ? all.isLoading : mine.isLoading;
  const toRate = (mine.data ?? []).filter((t) => t.reporterId === user?.id && !isOpen(t) && !t.csat);

  // Diyalogda açılacak ticket bu sayfada yoksa (bildirimden gelinmişse) tek başına getir
  const known = [...(all.data?.items ?? []), ...(mine.data ?? [])];
  const single = useQuery({
    queryKey: ["ticket", openId ?? rateId], enabled: !!(openId ?? rateId) && !known.some((t) => t.id === (openId ?? rateId)),
    queryFn: async () => (await api.get<Ticket>(`/api/tickets/${openId ?? rateId}`)).data, retry: false,
  });
  const find = (id: string | null) => (id ? known.find((t) => t.id === id) ?? (single.data?.id === id ? single.data : null) : null);

  const statusCell = (t: Ticket) => {
    const canStatus = t.assigneeId === user?.id || isManager;
    return canStatus ? (
      <TextField select size="small" value={t.status} sx={{ minWidth: 130 }} onClick={(e) => e.stopPropagation()}
        onChange={(e) => status.mutate({ id: t.id, s: e.target.value })} slotProps={{ htmlInput: { "aria-label": "Durum" } }}>
        {Object.entries(TICKET_STATUSES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
      </TextField>
    ) : <Chip size="small" variant="outlined" label={TICKET_STATUSES[t.status] ?? t.status} />;
  };
  const badges = (t: Ticket) => (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{t.category} · {timeAgo(t.createdAt)}</Typography>
      {t.workItemKey && <Chip size="small" color="primary" variant="outlined" label={`→ ${t.workItemKey}`} sx={{ height: 18, fontSize: 11 }} />}
      {t.incidentId && <Chip size="small" color="error" variant="outlined" label="Büyük olay" sx={{ height: 18, fontSize: 11 }} />}
      {t.csat && <CsatStars value={t.csat.rating} />}
      {!t.csat && t.reporterId === user?.id && !isOpen(t) && (
        <Chip size="small" icon={<StarIcon />} label="Değerlendir"
          onClick={(e) => { e.stopPropagation(); setParams((p) => { p.set("rate", t.id); return p; }, { replace: true }); }} sx={{ height: 20 }} />
      )}
    </Stack>
  );
  const openTicket = (id: string) => setParams((p) => { p.set("open", id); return p; }, { replace: true });

  const emptyText = f.q ? `"${f.q}" için sonuç yok. Başka bir kelime deneyin.`
    : f.sla !== "all" ? "Bu filtrede ticket yok. 🎉"
    : f.tab === "all" ? "Firmada henüz ticket yok. Çalışanlar portaldan, asistandan veya e-postayla ticket açabilir."
    : "Henüz talebiniz yok. Bir sorununuz varsa önce \"Soru sor\" ile hızlı cevap deneyin, çözülmezse \"Yeni talep oluştur\"a tıklayın.";

  return (
    <>
      <Stack direction="row" sx={{ alignItems: "center", mb: 2, gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>{isSupportRole(user?.role) ? "Talepler" : "Taleplerim"}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav("/tickets/new")}>Yeni talep</Button>
      </Stack>

      {toRate.length > 0 && f.tab === "mine" && (
        <Alert severity="info" icon={<StarIcon />} sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={() => setParams((p) => { p.set("rate", toRate[0].id); return p; })}>Değerlendir</Button>}>
          {toRate.length === 1 ? `"${toRate[0].title}" çözüldü. Destek nasıldı?` : `${toRate.length} çözülmüş ticket'ınız değerlendirme bekliyor.`}
        </Alert>
      )}

      <Tabs value={f.tab} onChange={(_, v) => setF({ tab: v })} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab value="mine" label="Açtıklarım" />
        {isManager && <Tab value="all" label={all.data && f.tab === "all" ? `Tüm talepler (${all.data.total})` : "Tüm talepler"} />}
      </Tabs>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 2, alignItems: { md: "center" } }}>
        <TextField size="small" placeholder="Ara: başlık veya açıklama  ( / )" value={search} inputRef={searchRef}
          onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: { md: 300 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            htmlInput: { "aria-label": "Ticket ara" } }} />
        <ToggleButtonGroup size="small" exclusive value={f.sla} onChange={(_, v) => v && setF({ sla: v })} sx={{ flexWrap: "wrap" }}>
          <ToggleButton value="all">Tümü</ToggleButton>
          <ToggleButton value="at_risk">Süresi dolmak üzere ({counts.atRisk})</ToggleButton>
          <ToggleButton value="breached">Süresi aşıldı ({counts.breached})</ToggleButton>
        </ToggleButtonGroup>
        <Chip label="Sadece açıklar" color={f.open ? "primary" : "default"} variant={f.open ? "filled" : "outlined"}
          disabled={f.sla !== "all"} onClick={() => setF({ open: !f.open })} sx={{ alignSelf: { xs: "flex-start", md: "center" } }} />
      </Stack>

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}
      {(showAll ? all.error : mine.error) && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage(showAll ? all.error : mine.error)}</Alert>}
      {(loading || (showAll && all.isFetching)) && <LinearProgress sx={{ mb: 1 }} />}

      {phone ? (
        // Telefonda tablo yerine kart listesi
        <Stack spacing={1}>
          {!loading && rows.length === 0 && <Card variant="outlined" sx={{ p: 3, textAlign: "center" }}><Typography color="text.secondary">{emptyText}</Typography></Card>}
          {rows.map((t) => (
            <Card key={t.id} variant="outlined" sx={{ p: 1.5, cursor: "pointer" }} onClick={() => openTicket(t.id)}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>{t.title}</Typography>
                <Chip size="small" variant="outlined" label={TICKET_STATUSES[t.status] ?? t.status} />
              </Stack>
              {badges(t)}
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                <SlaChip sla={t.sla} compact={!isOpen(t)} />
                <Typography variant="caption">{PRIORITIES[t.priority] ?? t.priority}</Typography>
                <Typography variant="caption" color="text.secondary">· {t.assigneeName ?? "Atanmadı"}</Typography>
              </Stack>
            </Card>
          ))}
        </Stack>
      ) : (
        <Card variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>Başlık</TableCell><TableCell>SLA</TableCell><TableCell>Öncelik</TableCell>
                <TableCell>Açan</TableCell><TableCell>Atanan</TableCell><TableCell>Durum</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6}>
                  <Box sx={{ py: 4, textAlign: "center" }}><Typography color="text.secondary">{emptyText}</Typography></Box>
                </TableCell></TableRow>
              )}
              {rows.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell onClick={() => openTicket(t.id)} sx={{ cursor: "pointer", maxWidth: 380 }}
                    tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openTicket(t.id); }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.title}</Typography>
                    {badges(t)}
                  </TableCell>
                  <TableCell>{isOpen(t) ? <SlaChip sla={t.sla} /> : <SlaChip sla={t.sla} compact />}</TableCell>
                  <TableCell>{PRIORITIES[t.priority] ?? t.priority}</TableCell>
                  <TableCell><Person name={t.reporterName} /></TableCell>
                  <TableCell>
                    {isManager ? (
                      <TextField select size="small" value={t.assigneeId ?? ""} sx={{ minWidth: 150 }}
                        onChange={(e) => assign.mutate({ id: t.id, uid: e.target.value })} slotProps={{ htmlInput: { "aria-label": "Atanan" } }}>
                        <MenuItem value="">Atanmadı</MenuItem>
                        {users.data?.map((u) => <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>)}
                      </TextField>
                    ) : <Person name={t.assigneeName} />}
                  </TableCell>
                  <TableCell>{statusCell(t)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {showAll && all.data && all.data.pages > 1 && (
        <Stack direction="row" sx={{ mt: 2, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {(f.page - 1) * PAGE_SIZE + 1}–{Math.min(f.page * PAGE_SIZE, all.data.total)} / {all.data.total} ticket
          </Typography>
          <Pagination count={all.data.pages} page={Math.min(f.page, all.data.pages)} size={phone ? "small" : "medium"}
            onChange={(_, p) => { setF({ page: p }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        </Stack>
      )}

      <TicketDialog ticket={find(openId)} onClose={() => dropParam("open")} />
      <CsatDialog ticket={find(rateId)} onClose={() => { dropParam("rate"); refresh(); }} />
    </>
  );
}
