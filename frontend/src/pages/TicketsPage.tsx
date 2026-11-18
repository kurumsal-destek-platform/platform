import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, Chip, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import StarIcon from "@mui/icons-material/StarRounded";
import { api, errorMessage, PRIORITIES, TICKET_STATUSES, timeAgo, type Ticket, type UserLite } from "../api";
import { useAuth } from "../auth";
import { Person } from "../components/common";
import TicketDialog from "../components/TicketDialog";
import { CsatDialog, CsatStars, SlaChip } from "../components/SlaCsat";

type SlaFilter = "all" | "at_risk" | "breached";
const isOpen = (t: Ticket) => ["open", "assigned", "in_progress"].includes(t.status);
const slaOf = (t: Ticket) => (t.sla?.response === "breached" || t.sla?.resolution === "breached") ? "breached"
  : (t.sla?.response === "at_risk" || t.sla?.resolution === "at_risk") ? "at_risk" : "ok";

export default function TicketsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const isManager = user?.role === "Manager" || user?.role === "Admin";
  const [tab, setTab] = useState(isManager && params.get("sla") ? 1 : 0);
  const [sla, setSla] = useState<SlaFilter>((params.get("sla") as SlaFilter) ?? "all");
  const [onlyOpen, setOnlyOpen] = useState(!!params.get("sla"));
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [rateId, setRateId] = useState<string | null>(params.get("rate"));

  useEffect(() => {
    if (params.get("open")) setOpenId(params.get("open"));
    if (params.get("rate")) setRateId(params.get("rate"));
    if (params.get("sla")) { setSla(params.get("sla") as SlaFilter); setOnlyOpen(true); if (isManager) setTab(1); }
  }, [params, isManager]);

  const mine = useQuery({ queryKey: ["myTickets"], queryFn: async () => (await api.get<Ticket[]>("/api/tickets/mine")).data });
  const all = useQuery({
    queryKey: ["allTickets"], enabled: isManager,
    queryFn: async () => (await api.get<Ticket[]>("/api/tickets")).data,
  });
  const users = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<UserLite[]>("/api/users")).data });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["myTickets"] }); qc.invalidateQueries({ queryKey: ["allTickets"] }); };
  const assign = useMutation({
    mutationFn: ({ id, uid }: { id: string; uid: string }) => api.put(`/api/tickets/${id}/assignee`, { assigneeId: uid || null }),
    onSuccess: refresh, onError: (e) => setError(errorMessage(e)),
  });
  const status = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => api.patch(`/api/tickets/${id}/status`, { status: s }),
    onSuccess: refresh, onError: (e) => setError(errorMessage(e)),
  });

  const source = tab === 1 && isManager ? all.data : mine.data;
  const rows = useMemo(() => (source ?? []).filter((t) =>
    (!onlyOpen || isOpen(t)) && (sla === "all" || slaOf(t) === sla)), [source, onlyOpen, sla]);
  const counts = useMemo(() => {
    const open = (source ?? []).filter(isOpen);
    return { breached: open.filter((t) => slaOf(t) === "breached").length, atRisk: open.filter((t) => slaOf(t) === "at_risk").length };
  }, [source]);
  const toRate = (mine.data ?? []).filter((t) => t.reporterId === user?.id && !isOpen(t) && !t.csat);
  const rateTicket = [...(mine.data ?? []), ...(all.data ?? [])].find((t) => t.id === rateId) ?? null;
  const closeRate = () => { setRateId(null); if (params.get("rate")) { params.delete("rate"); setParams(params, { replace: true }); } };

  return (
    <>
      <Stack direction="row" sx={{ alignItems: "center", mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Ticketlar</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav("/tickets/new")}>Ticket oluştur</Button>
      </Stack>

      {toRate.length > 0 && tab === 0 && (
        <Alert severity="info" icon={<StarIcon />} sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={() => setRateId(toRate[0].id)}>Değerlendir</Button>}>
          {toRate.length === 1 ? `"${toRate[0].title}" çözüldü. Destek nasıldı?` : `${toRate.length} çözülmüş ticket'ınız değerlendirme bekliyor.`}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Benim ticketlarım" />
        {isManager && <Tab label="Tüm ticketlar" />}
      </Tabs>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
        <ToggleButtonGroup size="small" exclusive value={sla} onChange={(_, v) => v && setSla(v)}>
          <ToggleButton value="all">Tümü</ToggleButton>
          <ToggleButton value="at_risk">⏳ Süresi dolmak üzere ({counts.atRisk})</ToggleButton>
          <ToggleButton value="breached">🔴 SLA aşıldı ({counts.breached})</ToggleButton>
        </ToggleButtonGroup>
        <Chip label="Sadece açıklar" color={onlyOpen ? "primary" : "default"} variant={onlyOpen ? "filled" : "outlined"}
          onClick={() => setOnlyOpen((o) => !o)} />
      </Stack>

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}
      <Card variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell>Başlık</TableCell><TableCell>SLA</TableCell><TableCell>Öncelik</TableCell>
              <TableCell>Açan</TableCell><TableCell>Atanan</TableCell><TableCell>Durum</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6}>
                <Box sx={{ py: 4, textAlign: "center" }}>
                  <Typography color="text.secondary">
                    {sla !== "all" ? "Bu filtrede ticket yok. 🎉" : "Henüz ticket yok. Bir sorununuz varsa \"Ticket oluştur\"a tıklayın."}
                  </Typography>
                </Box>
              </TableCell></TableRow>
            )}
            {rows.map((t) => {
              const canStatus = t.assigneeId === user?.id || isManager;
              return (
                <TableRow key={t.id} hover>
                  <TableCell onClick={() => setOpenId(t.id)} sx={{ cursor: "pointer", maxWidth: 380 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.title}</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                      <Typography variant="caption" color="text.secondary">{t.category} · {timeAgo(t.createdAt)}</Typography>
                      {t.workItemKey && <Chip size="small" color="primary" variant="outlined" label={`→ ${t.workItemKey}`} sx={{ height: 18, fontSize: 11 }} />}
                      {t.incidentId && <Chip size="small" color="error" variant="outlined" label="Büyük olay" sx={{ height: 18, fontSize: 11 }} />}
                      {t.csat && <CsatStars value={t.csat.rating} />}
                      {!t.csat && t.reporterId === user?.id && !isOpen(t) && (
                        <Chip size="small" icon={<StarIcon />} label="Değerlendir" onClick={(e) => { e.stopPropagation(); setRateId(t.id); }} sx={{ height: 20 }} />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>{isOpen(t) ? <SlaChip sla={t.sla} /> : <SlaChip sla={t.sla} compact />}</TableCell>
                  <TableCell>{PRIORITIES[t.priority] ?? t.priority}</TableCell>
                  <TableCell><Person name={t.reporterName} /></TableCell>
                  <TableCell>
                    {isManager ? (
                      <TextField select size="small" value={t.assigneeId ?? ""} sx={{ minWidth: 150 }}
                        onChange={(e) => assign.mutate({ id: t.id, uid: e.target.value })}>
                        <MenuItem value="">Atanmadı</MenuItem>
                        {users.data?.map((u) => <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>)}
                      </TextField>
                    ) : <Person name={t.assigneeName} />}
                  </TableCell>
                  <TableCell>
                    {canStatus ? (
                      <TextField select size="small" value={t.status} sx={{ minWidth: 130 }}
                        onChange={(e) => status.mutate({ id: t.id, s: e.target.value })}>
                        {Object.entries(TICKET_STATUSES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                      </TextField>
                    ) : <Chip size="small" variant="outlined" label={TICKET_STATUSES[t.status] ?? t.status} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <TicketDialog ticket={[...(source ?? []), ...(mine.data ?? []), ...(all.data ?? [])].find((t) => t.id === openId) ?? null}
        onClose={() => { setOpenId(null); if (params.get("open")) { params.delete("open"); setParams(params, { replace: true }); } }} />
      <CsatDialog ticket={rateTicket} onClose={closeRate} />
    </>
  );
}
