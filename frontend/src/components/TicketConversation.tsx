import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, FormControlLabel, Stack, Switch, TextField, Tooltip, Typography,
} from "@mui/material";
import AutoIcon from "@mui/icons-material/AutoAwesome";
import SendIcon from "@mui/icons-material/SendRounded";
import LockIcon from "@mui/icons-material/LockOutlined";
import SystemIcon from "@mui/icons-material/SettingsSuggestOutlined";
import { api, errorMessage, timeAgo, type Ticket } from "../api";
import { initials } from "./Layout";

interface Msg { id: string; body: string; internal: boolean; aiAssisted: boolean; createdAt: string; authorId: string; authorName?: string; fromSupport: boolean; system?: boolean }
interface DraftSource { type: "article" | "ticket"; id: string; title: string; resolution?: string; rating?: number | null }

// Ticket yazışması. Destek ekibi: iç not + "✨ Cevap taslağı" (yerel yapay zekâ)
export default function TicketConversation({ ticket, isSupport }: { ticket: Ticket; isSupport: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [draft, setDraft] = useState<{ text: string; ai: boolean; sources: DraftSource[] } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = useQuery({
    queryKey: ["ticketMessages", ticket.id],
    queryFn: async () => (await api.get<Msg[]>(`/api/tickets/${ticket.id}/messages`)).data,
    refetchInterval: 20000,
  });
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs.data?.length]);

  const makeDraft = useMutation({
    mutationFn: async () => (await api.post<{ draft: string; aiGenerated: boolean; sources: DraftSource[] }>(
      `/api/tickets/${ticket.id}/reply-draft`, null, { timeout: 120000 })).data,
    onSuccess: (d) => { setText(d.draft); setInternal(false); setDraft({ text: d.draft, ai: d.aiGenerated, sources: d.sources }); },
  });
  const send = useMutation({
    mutationFn: async () => api.post(`/api/tickets/${ticket.id}/messages`, { body: text, internal, aiAssisted: !!draft }),
    onSuccess: () => {
      setText(""); setDraft(null); setInternal(false);
      qc.invalidateQueries({ queryKey: ["ticketMessages", ticket.id] });
      qc.invalidateQueries({ queryKey: ["allTickets"] }); qc.invalidateQueries({ queryKey: ["myTickets"] });
    },
  });

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Yazışma</Typography>
      <Stack spacing={1.25} sx={{ maxHeight: 340, overflowY: "auto", pr: 0.5, mb: 1.5 }}>
        {msgs.data?.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {isSupport ? "Henüz mesaj yok. ✨ Cevap taslağı ile başlayabilirsiniz." : "Destek ekibi cevap yazdığında burada görünecek."}
          </Typography>
        )}
        {msgs.data?.map((m) => {
          // Sistem notu (otomasyon kuralı, SLA eskalasyonu, e-postadan oluşturuldu): ortada, sade satır
          if (m.system) return (
            <Stack key={m.id} direction="row" spacing={1} sx={{ justifyContent: "center", alignItems: "center", color: "text.secondary", px: 2 }}>
              <SystemIcon sx={{ fontSize: 15 }} />
              <Typography variant="caption" sx={{ textAlign: "center" }}>{m.body} · {timeAgo(m.createdAt)}</Typography>
            </Stack>
          );
          const mine = m.fromSupport === isSupport && !(isSupport && m.authorId === ticket.reporterId);
          return (
            <Stack key={m.id} direction={mine ? "row-reverse" : "row"} spacing={1} sx={{ alignItems: "flex-end" }}>
              <Avatar sx={{ width: 28, height: 28, fontSize: 11, bgcolor: m.fromSupport ? "primary.main" : "#f79233" }}>{initials(m.authorName)}</Avatar>
              <Box sx={{
                maxWidth: "78%", px: 1.5, py: 1, borderRadius: 2,
                bgcolor: m.internal ? "warning.light" : mine ? "primary.main" : "action.hover",
                color: m.internal ? "warning.contrastText" : mine ? "primary.contrastText" : "text.primary",
                border: m.internal ? "1px dashed" : "none", borderColor: "warning.main",
              }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.25, opacity: 0.85 }}>
                  {m.internal && <LockIcon sx={{ fontSize: 13 }} />}
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>{m.authorName}</Typography>
                  <Typography variant="caption">· {timeAgo(m.createdAt)}{m.internal ? " · iç not" : ""}</Typography>
                  {m.aiAssisted && isSupport && <Tooltip title="Yapay zekâ taslağından düzenlenerek yazıldı"><AutoIcon sx={{ fontSize: 13 }} /></Tooltip>}
                </Stack>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{m.body}</Typography>
              </Box>
            </Stack>
          );
        })}
        <div ref={endRef} />
      </Stack>

      {draft && (
        <Alert severity="info" icon={<AutoIcon />} onClose={() => setDraft(null)} sx={{ mb: 1 }}>
          {draft.ai ? "Yerel yapay zekâ taslak yazdı" : "Taslak, bilgi bankası ve geçmiş çözümlerden hazırlandı"} — göndermeden önce kontrol edin.
          {draft.sources.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
              <Typography variant="caption" sx={{ mr: 0.5 }}>Kaynaklar:</Typography>
              {draft.sources.map((s) => (
                <Tooltip key={s.id} title={s.type === "ticket" ? `Çözüm: ${s.resolution}${s.rating ? ` (memnuniyet ${s.rating}/5)` : ""}` : "Bilgi bankası makalesi"}>
                  <Chip size="small" variant="outlined" label={`${s.type === "article" ? "📘" : "🎫"} ${s.title}`} />
                </Tooltip>
              ))}
            </Stack>
          )}
        </Alert>
      )}
      {(makeDraft.error || send.error) && <Alert severity="error" sx={{ mb: 1 }}>{errorMessage(makeDraft.error ?? send.error)}</Alert>}

      <TextField fullWidth multiline minRows={2} maxRows={10} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={internal ? "Ekip içi not (çalışan görmez)…" : isSupport ? "Çalışana cevap yazın…" : "Destek ekibine yazın…"}
        sx={internal ? { "& .MuiOutlinedInput-root": { bgcolor: "action.hover" } } : undefined}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) send.mutate(); }} />
      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
        {isSupport && (
          <Button variant="outlined" startIcon={makeDraft.isPending ? <CircularProgress size={16} /> : <AutoIcon />}
            disabled={makeDraft.isPending} onClick={() => makeDraft.mutate()}
            sx={{ borderImage: "linear-gradient(90deg,#6554c0,#0c66e4) 1" }}>
            {makeDraft.isPending ? "Yazıyor…" : "Cevap taslağı"}
          </Button>
        )}
        {isSupport && (
          <FormControlLabel control={<Switch size="small" checked={internal} onChange={(e) => setInternal(e.target.checked)} />}
            label={<Typography variant="body2">İç not</Typography>} />
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", sm: "block" } }}>Ctrl+Enter</Typography>
        <Button variant="contained" endIcon={<SendIcon />} disabled={!text.trim() || send.isPending} onClick={() => send.mutate()}>
          {internal ? "Notu kaydet" : "Gönder"}
        </Button>
      </Stack>
    </Box>
  );
}
