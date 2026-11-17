import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardContent, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  LinearProgress, MenuItem, Snackbar, Stack, TextField, Typography,
} from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import CampaignIcon from "@mui/icons-material/CampaignOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { celebrate } from "../delight";
import { api, errorMessage, PRIORITIES, timeAgo, TICKET_STATUSES, type IncidentSuggestion, type IncidentT } from "../api";

// Büyük olaylar: aynı sorun için açılan onlarca ticket'ı tek yerden yönet
export default function IncidentsPage() {
  const qc = useQueryClient();
  const [toast, setToast] = useState("");
  const [creating, setCreating] = useState<IncidentSuggestion | null>(null);
  const [resolving, setResolving] = useState<IncidentT | null>(null);

  const suggestions = useQuery({
    queryKey: ["incidentSuggestions"],
    queryFn: async () => (await api.get<IncidentSuggestion[]>("/api/incidents/suggestions")).data,
    refetchInterval: 30000,
  });
  const incidents = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => (await api.get<IncidentT[]>("/api/incidents")).data,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["incidentSuggestions"] });
    qc.invalidateQueries({ queryKey: ["incidents"] });
    qc.invalidateQueries({ queryKey: ["allTickets"] });
  };
  const active = incidents.data?.filter((i) => i.status === "active") ?? [];
  const resolved = incidents.data?.filter((i) => i.status === "resolved") ?? [];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Büyük olaylar</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Aynı sorun için açılan ticket'lar yapay zekâ ile fark edilir. Tek olayda birleştirin, çalışanlara "biliniyor" deyin, tek tıkla hepsini çözün.
      </Typography>

      {/* Sistemin fark ettiği ticket selleri */}
      {(suggestions.data?.length ?? 0) > 0 && (
        <Stack spacing={2} sx={{ mb: 4 }}>
          {suggestions.data!.map((s) => (
            <Card key={s.ticketIds.join()} variant="outlined" sx={{ borderColor: "warning.main", borderWidth: 2 }}>
              <CardContent>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
                  <BoltIcon color="warning" sx={{ fontSize: 40 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="overline" color="warning.main">Olası büyük olay tespit edildi</Typography>
                    <Typography variant="h6">{s.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {timeAgo(s.firstAt)} başladı · <b>{s.count} benzer ticket</b> · {s.affectedUsers} kişi etkilendi · saatte ~{s.perHour} yeni ticket · {s.category}
                    </Typography>
                  </Box>
                  <Button variant="contained" color="warning" onClick={() => setCreating(s)}>Tek olayda birleştir</Button>
                </Stack>
                <Stack sx={{ mt: 1.5, pl: { sm: 7 } }} spacing={0.5}>
                  {s.tickets.map((t) => (
                    <Typography key={t.id} variant="body2">
                      • {t.title} <Typography component="span" variant="caption" color="text.secondary">— {t.reporterName}, {timeAgo(t.createdAt)}</Typography>
                    </Typography>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      {suggestions.data?.length === 0 && (
        <Alert severity="success" sx={{ mb: 3 }}>Şu an bir ticket seli görünmüyor. Benzer ticket'lar art arda gelirse burada uyarı çıkar.</Alert>
      )}

      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Aktif olaylar ({active.length})</Typography>
      {active.length === 0 && <Typography color="text.secondary" sx={{ mb: 3 }}>Aktif olay yok.</Typography>}
      <Stack spacing={2} sx={{ mb: 4 }}>
        {active.map((i) => <IncidentCard key={i.id} i={i} onResolve={() => setResolving(i)} />)}
      </Stack>

      {resolved.length > 0 && (
        <>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Çözülen olaylar</Typography>
          <Stack spacing={1}>{resolved.map((i) => <IncidentCard key={i.id} i={i} />)}</Stack>
        </>
      )}

      <CreateDialog s={creating} onClose={() => setCreating(null)}
        onDone={(n) => { setCreating(null); refresh(); setToast(`Olay oluşturuldu: ${n} ticket bağlandı, etkilenenlere "sorun biliniyor" bildirimi gitti.`); }} />
      <ResolveDialog i={resolving} onClose={() => setResolving(null)}
        onDone={(r) => { setResolving(null); refresh(); celebrate("big"); setToast(`✔ ${r.resolvedTickets} ticket tek seferde çözüldü, ${r.notifiedUsers} kişiye bildirim gitti.`); }} />
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function IncidentCard({ i, onResolve }: { i: IncidentT; onResolve?: () => void }) {
  const [open, setOpen] = useState(false);
  const isActive = i.status === "active";
  const pct = i.ticketCount ? Math.round(100 * (i.ticketCount - i.openCount) / i.ticketCount) : 0;
  return (
    <Card variant="outlined" sx={{ borderLeft: 4, borderLeftColor: isActive ? "error.main" : "success.main" }}>
      <CardContent sx={{ pb: "12px !important" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          {isActive ? <CampaignIcon color="error" /> : <DoneAllIcon color="success" />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{i.title}</Typography>
              <Chip size="small" color={isActive ? "error" : "success"} label={isActive ? "Aktif" : "Çözüldü"} />
              <Chip size="small" variant="outlined" label={PRIORITIES[i.severity] ?? i.severity} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {i.ticketCount} ticket · {i.affectedUsers} kişi etkilendi · sorumlu: {i.ownerName ?? "—"} · {timeAgo(i.createdAt)} açıldı
            </Typography>
            {!isActive && i.resolutionNote && <Typography variant="body2" sx={{ mt: 0.5 }}>Çözüm: {i.resolutionNote}</Typography>}
          </Box>
          <Button size="small" onClick={() => setOpen((o) => !o)}>{open ? "Gizle" : "Ticket'lar"}</Button>
          {isActive && onResolve && (
            <Button variant="contained" color="success" startIcon={<DoneAllIcon />} onClick={onResolve}>Tek tıkla çöz</Button>
          )}
        </Stack>
        {isActive && <LinearProgress variant="determinate" value={pct} sx={{ mt: 1.5, height: 4, borderRadius: 2 }} />}
        <Collapse in={open}>
          <Stack sx={{ mt: 1.5 }} spacing={0.5}>
            {i.tickets.map((t) => (
              <Stack key={t.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Chip size="small" variant="outlined" label={TICKET_STATUSES[t.status] ?? t.status} sx={{ minWidth: 80 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>{t.title}</Typography>
                <Typography variant="caption" color="text.secondary">{t.reporterName} · {timeAgo(t.createdAt)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  );
}

function CreateDialog({ s, onClose, onDone }: { s: IncidentSuggestion | null; onClose: () => void; onDone: (n: number) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("High");
  const [error, setError] = useState("");
  const [lastKey, setLastKey] = useState("");
  const key = s?.ticketIds.join() ?? "";
  if (s && key !== lastKey) { setLastKey(key); setTitle(s.title); setDescription(""); setError(""); }

  const m = useMutation({
    mutationFn: async () => (await api.post<IncidentT>("/api/incidents", { title, description, severity, ticketIds: s!.ticketIds })).data,
    onSuccess: (r) => onDone(r.ticketCount),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open={!!s} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Büyük olay oluştur</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Olay başlığı" value={title} onChange={(e) => setTitle(e.target.value)}
            helperText="Çalışanlar ticket açarken bu başlığı 'Bu sorun biliniyor' uyarısında görür." />
          <TextField label="Açıklama (isteğe bağlı)" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2}
            placeholder="Ör. VPN sunucusunda kesinti var, ekip inceliyor." />
          <TextField select label="Önem" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {Object.entries(PRIORITIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <Alert severity="info">{s?.count} ticket bu olaya bağlanacak, "işlemde" durumuna geçecek ve açanlara bildirim gidecek.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" color="warning" disabled={!title.trim() || m.isPending} onClick={() => m.mutate()}>Olayı oluştur</Button>
      </DialogActions>
    </Dialog>
  );
}

function ResolveDialog({ i, onClose, onDone }: {
  i: IncidentT | null; onClose: () => void; onDone: (r: { resolvedTickets: number; notifiedUsers: number }) => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: async () => (await api.post(`/api/incidents/${i!.id}/resolve`, { resolutionNote: note })).data,
    onSuccess: (r) => { setNote(""); onDone(r); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open={!!i} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Olayı çöz: {i?.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Çözüm notu" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={3} autoFocus
            placeholder="Ör. VPN sunucusu yeniden başlatıldı, bağlantılar normale döndü. İstemciyi kapatıp açmanız yeterli." />
          <Alert severity="success">
            Bağlı {i?.openCount} açık ticket bu notla "çözüldü" olacak ve {i?.affectedUsers} kişiye otomatik bildirim gidecek.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" color="success" disabled={!note.trim() || m.isPending} onClick={() => m.mutate()}>Hepsini çöz</Button>
      </DialogActions>
    </Dialog>
  );
}
