import PauseIcon from "@mui/icons-material/HourglassEmptyOutlined";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Rating, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import TimerIcon from "@mui/icons-material/TimerOutlined";
import CheckIcon from "@mui/icons-material/CheckCircleOutlined";
import WarnIcon from "@mui/icons-material/ErrorOutlined";
import { api, errorMessage, formatDuration, type SlaInfo, type SlaState, type Ticket } from "../api";

// Her 30 sn'de bir yeniden çizilsin: geri sayım canlı görünsün
function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const COLOR: Record<SlaState, "success" | "error" | "warning" | "default" | "info"> = {
  met: "success", breached: "error", at_risk: "warning", running: "default", none: "default", paused: "info",
};

// Ticket listesinde tek rozet: en kritik hedef (önce ilk yanıt, sonra çözüm)
export function SlaChip({ sla, compact }: { sla?: SlaInfo; compact?: boolean }) {
  const now = useNow();
  if (!sla || sla.resolution === "none") return <Typography variant="caption" color="text.secondary">—</Typography>;
  const waitingResponse = !sla.firstResponseAt && (sla.response === "running" || sla.response === "at_risk" || sla.response === "breached");
  const kind = waitingResponse ? "response" : "resolution";
  const state = kind === "response" ? sla.response : sla.resolution;
  const due = kind === "response" ? sla.responseDueAt : sla.resolutionDueAt;
  const label = kind === "response" ? "Yanıt" : "Çözüm";

  if (sla.resolution === "paused" || state === "paused")
    return <Chip size="small" color="info" variant="outlined" icon={<PauseIcon />} label={compact ? "Durdu" : "Yanıt bekleniyor · süre durdu"} />;
  if (state === "met") return <Chip size="small" color="success" variant="outlined" icon={<CheckIcon />} label={compact ? "Hedefte" : "SLA hedefinde"} />;
  if (!due) return null;
  const mins = (new Date(due).getTime() - now) / 60000;
  if (state === "breached")
    return (
      <Tooltip title={`${label} hedefi ${new Date(due).toLocaleString("tr-TR")} idi`}>
        <Chip size="small" color="error" icon={<WarnIcon />} label={mins < 0 ? `${label}: ${formatDuration(mins)} gecikti` : `${label} hedefi aşıldı`} />
      </Tooltip>
    );
  return (
    <Tooltip title={`${label} hedefi: ${new Date(due).toLocaleString("tr-TR")} (mesai saatine göre)`}>
      <Chip size="small" color={COLOR[state]} variant={state === "at_risk" ? "filled" : "outlined"} icon={<TimerIcon />}
        label={`${label}: ${formatDuration(mins)} kaldı`} />
    </Tooltip>
  );
}

// Ticket detayında iki hedefin ayrıntısı
export function SlaPanel({ ticket }: { ticket: Ticket }) {
  const now = useNow();
  const sla = ticket.sla;
  if (!sla || sla.resolution === "none") return null;
  const created = new Date(ticket.createdAt).getTime();
  const row = (label: string, state: SlaState, due?: string | null, doneAt?: string | null) => {
    if (!due) return null;
    const end = new Date(due).getTime();
    const at = doneAt ? new Date(doneAt).getTime() : now;
    const pct = Math.min(100, Math.max(0, ((at - created) / Math.max(1, end - created)) * 100));
    const text = state === "met" ? `Hedefte tamamlandı (${new Date(doneAt!).toLocaleString("tr-TR")})`
      : state === "breached" ? (doneAt ? `Hedef aşıldı: ${formatDuration((at - end) / 60000)} geç` : `Hedef ${formatDuration((now - end) / 60000)} önce doldu`)
      : `${formatDuration((end - now) / 60000)} kaldı · hedef ${new Date(due).toLocaleString("tr-TR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`;
    return (
      <Box sx={{ flex: 1, minWidth: 200 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>{label}</Typography>
          <Typography variant="caption" color={state === "breached" ? "error.main" : state === "at_risk" ? "warning.main" : "text.secondary"}>{text}</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={pct} color={COLOR[state] === "default" ? "primary" : COLOR[state] as "success"}
          sx={{ height: 6, borderRadius: 3, mt: 0.5 }} />
      </Box>
    );
  };
  const resolvedAt = ticket.status === "resolved" || ticket.status === "closed" ? ticket.resolvedAt : null;
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>SLA <Typography component="span" variant="caption" color="text.secondary">(mesai saatine göre)</Typography></Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
        {row("İlk yanıt", sla.response, sla.responseDueAt, sla.firstResponseAt ?? resolvedAt)}
        {row("Çözüm", sla.resolution, sla.resolutionDueAt, resolvedAt)}
      </Stack>
    </Box>
  );
}

const LABELS: Record<number, string> = { 1: "Çok kötü", 2: "Kötü", 3: "İdare eder", 4: "İyi", 5: "Mükemmel" };

// Memnuniyet anketi: 1-5 yıldız + isteğe bağlı yorum
export function CsatDialog({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState(-1);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => { setRating(ticket?.csat?.rating ?? null); setComment(ticket?.csat?.comment ?? ""); setDone(false); }, [ticket]);
  const m = useMutation({
    mutationFn: () => api.post(`/api/tickets/${ticket!.id}/csat`, { rating, comment }),
    onSuccess: () => { setDone(true); qc.invalidateQueries({ queryKey: ["myTickets"] }); },
  });
  return (
    <Dialog open={!!ticket} onClose={onClose} fullWidth maxWidth="xs">
      {done ? (
        <>
          <DialogContent sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="h3">🙏</Typography>
            <Typography variant="h6" sx={{ mt: 1 }}>Teşekkürler!</Typography>
            <Typography variant="body2" color="text.secondary">Geri bildiriminiz destek ekibine ulaştı.</Typography>
          </DialogContent>
          <DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions>
        </>
      ) : (
        <>
          <DialogTitle>Destek nasıldı?</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>"{ticket?.title}"</Typography>
            <Stack sx={{ alignItems: "center", mb: 2 }}>
              <Rating size="large" value={rating} onChange={(_, v) => setRating(v)} onChangeActive={(_, v) => setHover(v)} sx={{ fontSize: 44 }} />
              <Typography variant="body2" sx={{ height: 22, mt: 0.5 }}>{LABELS[hover !== -1 ? hover : rating ?? 0] ?? ""}</Typography>
            </Stack>
            <TextField fullWidth multiline minRows={2} label={rating && rating <= 3 ? "Neyi daha iyi yapabilirdik?" : "Yorum (isteğe bağlı)"}
              value={comment} onChange={(e) => setComment(e.target.value)} />
            {m.error && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(m.error)}</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Daha sonra</Button>
            <Button variant="contained" disabled={!rating || m.isPending} onClick={() => m.mutate()}>Gönder</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

export function CsatStars({ value }: { value: number }) {
  return <Rating size="small" value={value} readOnly precision={0.1} />;
}
