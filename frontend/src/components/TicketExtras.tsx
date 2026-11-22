import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Autocomplete, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText,
  Menu, MenuItem, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import MergeIcon from "@mui/icons-material/CallMergeOutlined";
import EyeIcon from "@mui/icons-material/VisibilityOutlined";
import QuickReplyIcon from "@mui/icons-material/QuickreplyOutlined";
import { api, errorMessage, TICKET_STATUSES, timeAgo, type CannedT, type Ticket, type TicketPage, type UserLite } from "../api";
import { useAuth } from "../auth";

const refreshTickets = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["allTickets"] });
  qc.invalidateQueries({ queryKey: ["myTickets"] });
  qc.invalidateQueries({ queryKey: ["ticket"] });
};

// Takipçiler: ticket'ı görür ve bildirim alır. Herkes kendini, destek ekibi başkasını ekleyebilir.
export function Watchers({ ticket, isSupport }: { ticket: Ticket; isSupport: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [list, setList] = useState(ticket.watchers ?? []);
  const [adding, setAdding] = useState(false);
  useEffect(() => setList(ticket.watchers ?? []), [ticket.id, ticket.watchers]);
  const users = useQuery({ queryKey: ["users"], enabled: isSupport && adding, queryFn: async () => (await api.get<UserLite[]>("/api/users")).data });
  const watch = useMutation({
    mutationFn: async (v: { userId: string; watch: boolean }) => (await api.post<Ticket>(`/api/tickets/${ticket.id}/watchers`, v)).data,
    onSuccess: (t) => { setList(t.watchers ?? []); setAdding(false); refreshTickets(qc); },
  });
  const iWatch = list.some((w) => w.id === user?.id);
  const isParty = ticket.reporterId === user?.id || ticket.assigneeId === user?.id;
  const candidates = (users.data ?? []).filter((u) => !list.some((w) => w.id === u.id) && u.id !== ticket.reporterId);

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
      <EyeIcon fontSize="small" color="action" />
      <Typography variant="caption" color="text.secondary">Takipçiler:</Typography>
      {list.length === 0 && <Typography variant="caption" color="text.secondary">yok</Typography>}
      {list.map((w) => (
        <Chip key={w.id} size="small" label={w.name ?? "?"}
          onDelete={isSupport || w.id === user?.id ? () => watch.mutate({ userId: w.id, watch: false }) : undefined} />
      ))}
      {!isParty && (
        <Button size="small" onClick={() => watch.mutate({ userId: user!.id, watch: !iWatch })}>{iWatch ? "Takibi bırak" : "Takip et"}</Button>
      )}
      {isSupport && !adding && <Button size="small" onClick={() => setAdding(true)}>+ Kişi ekle</Button>}
      {isSupport && adding && (
        <Autocomplete size="small" sx={{ minWidth: 220 }} options={candidates} loading={users.isLoading} openOnFocus
          getOptionLabel={(u) => u.department ? `${u.fullName} · ${u.department}` : u.fullName}
          onChange={(_, u) => { if (u) watch.mutate({ userId: u.id, watch: true }); }}
          onBlur={() => setAdding(false)}
          renderInput={(p) => <TextField {...p} autoFocus placeholder="Kişi seçin" />} />
      )}
    </Stack>
  );
}

// Birleştirme: aynı sorun için açılmış başka bir ticket'a taşır (yazışma, ekler, açan kişi takipçi olur)
export function MergeButton({ ticket, onMerged }: { ticket: Ticket; onMerged: (targetId: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(ticket.title.split(" ").slice(0, 3).join(" "));
  const [target, setTarget] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const results = useQuery({
    queryKey: ["mergeSearch", q], enabled: open,
    queryFn: async () => (await api.get<TicketPage>("/api/tickets", { params: { page: 1, pageSize: 10, open: true, search: q || undefined } })).data,
  });
  const merge = useMutation({
    mutationFn: async () => api.post(`/api/tickets/${ticket.id}/merge`, { targetId: target!.id }),
    onSuccess: () => { setOpen(false); refreshTickets(qc); onMerged(target!.id); },
    onError: (e) => setError(errorMessage(e)),
  });
  const options = (results.data?.items ?? []).filter((t) => t.id !== ticket.id);
  if (ticket.mergedIntoId || ["resolved", "closed"].includes(ticket.status)) return null;

  return (
    <>
      <Button variant="outlined" startIcon={<MergeIcon />} onClick={() => { setOpen(true); setError(""); setTarget(null); }}>Başka ticket ile birleştir</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Birleştir: "{ticket.title}"</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Aynı sorun için açılmış ana ticket'ı seçin. Bu ticket kapanır; yazışması ve ekleri ana ticket'a taşınır,
            açan kişi ana ticket'ı takip etmeye başlar.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth size="small" label="Açık ticket'larda ara" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <List dense sx={{ mt: 1, maxHeight: 320, overflowY: "auto" }}>
            {options.length === 0 && !results.isLoading && <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>Eşleşen açık ticket yok.</Typography>}
            {options.map((t) => (
              <ListItemButton key={t.id} selected={target?.id === t.id} onClick={() => setTarget(t)}>
                <ListItemText primary={t.title}
                  secondary={`${t.reporterName ?? "?"} · ${TICKET_STATUSES[t.status] ?? t.status} · ${timeAgo(t.createdAt)}`} />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Vazgeç</Button>
          <Button variant="contained" disabled={!target || merge.isPending} onClick={() => merge.mutate()}>Birleştir</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// Yazışma kutusunun yanındaki "Hazır yanıt" menüsü: seçilen metin ticket'a göre doldurulup kutuya eklenir
export function CannedMenu({ ticketId, onInsert }: { ticketId: string; onInsert: (text: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const list = useQuery({ queryKey: ["canned"], enabled: !!anchor, queryFn: async () => (await api.get<CannedT[]>("/api/canned-responses")).data });
  const pick = async (c: CannedT) => {
    setAnchor(null);
    try {
      const r = (await api.post<{ body: string }>(`/api/canned-responses/${c.id}/render`, { ticketId })).data;
      onInsert(r.body);
    } catch { onInsert(c.body); }
  };
  return (
    <>
      <Tooltip title="Hazır yanıt ekle">
        <Button variant="outlined" startIcon={<QuickReplyIcon />} onClick={(e) => setAnchor(e.currentTarget)}>Hazır yanıt</Button>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { maxWidth: 360 } } }}>
        {list.isLoading && <MenuItem disabled>Yükleniyor…</MenuItem>}
        {list.data?.length === 0 && <MenuItem disabled>Henüz hazır yanıt yok (menüden ekleyin)</MenuItem>}
        {list.data?.map((c) => (
          <MenuItem key={c.id} onClick={() => pick(c)} sx={{ display: "block", whiteSpace: "normal" }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.title}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>{c.body.replace(/\s+/g, " ")}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
