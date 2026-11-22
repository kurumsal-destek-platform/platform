import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, TextField, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import ConvertIcon from "@mui/icons-material/MoveUp";
import ArticleIcon from "@mui/icons-material/ArticleOutlined";
import { api, errorMessage, PRIORITIES, TICKET_STATUSES, TYPES, type Project, type ProjectDetail, type Ticket } from "../api";
import { useAuth } from "../auth";
import Attachments from "./Attachments";
import SmartAssign from "./SmartAssign";
import TicketConversation from "./TicketConversation";
import { CsatStars, SlaPanel } from "./SlaCsat";
import { Person } from "./common";
import { MergeButton, Watchers } from "./TicketExtras";
import { ExpertsButton } from "./ExpertsDialog";

// Ticket detayı: açıklama, ekler, (yönetici için) göreve çevirme
export default function TicketDialog({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const isManager = user?.role === "Manager" || user?.role === "Admin" || user?.role === "Agent";   // destek ekibi
  const [converting, setConverting] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const phone = useMediaQuery(useTheme().breakpoints.down("sm"));
  if (!ticket) return null;
  const workKey = ticket.workItemKey;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={phone}>
      <DialogTitle>
        {ticket.title}
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", rowGap: 1 }}>
          {ticket.mergedIntoId && <Chip size="small" color="secondary" label="Başka ticket ile birleştirildi" onClick={() => { onClose(); nav(`/tickets?open=${ticket.mergedIntoId}`); }} />}
          <Chip size="small" label={ticket.category} />
          <Chip size="small" variant="outlined" label={TICKET_STATUSES[ticket.status] ?? ticket.status} />
          <Chip size="small" variant="outlined" label={PRIORITIES[ticket.priority] ?? ticket.priority} />
          {ticket.incidentId && (
            <Chip size="small" color="error" label="Büyük olaya bağlı" onClick={isManager ? () => { onClose(); nav("/incidents"); } : undefined} />
          )}
          {isManager && <ExpertsButton area={ticket.category} title={ticket.title} description={ticket.description} />}
          {workKey && (
            <Chip size="small" color="primary" label={`Görev: ${workKey}`}
              onClick={() => { onClose(); nav(`/projects/${workKey.split("-")[0]}?item=${workKey}`); }} />
          )}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={4}>
            <Box><Typography variant="caption" color="text.secondary">Açan</Typography><Person name={ticket.reporterName} /></Box>
            <Box><Typography variant="caption" color="text.secondary">Atanan</Typography><Person name={assignedTo || ticket.assigneeName} /></Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Açılış</Typography>
              <Typography variant="body2">{new Date(ticket.createdAt).toLocaleString("tr-TR")}</Typography>
            </Box>
          </Stack>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{ticket.description || "Açıklama yok."}</Typography>
          <SlaPanel ticket={ticket} />
          {ticket.csat && (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: "action.hover" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="subtitle2">Memnuniyet</Typography>
                <CsatStars value={ticket.csat.rating} />
              </Stack>
              {ticket.csat.comment && <Typography variant="body2" sx={{ mt: 0.5 }}>"{ticket.csat.comment}"</Typography>}
            </Box>
          )}
          {isManager && !ticket.incidentId && !["resolved", "closed"].includes(ticket.status) && (
            <>
              <Divider />
              <SmartAssign ticket={ticket} onAssigned={setAssignedTo} />
            </>
          )}
          <Divider />
          <Watchers ticket={ticket} isSupport={isManager} />
          {isManager && <Box><MergeButton ticket={ticket} onMerged={(id) => { onClose(); nav(`/tickets?open=${id}`); }} /></Box>}
          <TicketConversation ticket={ticket} isSupport={isManager || ticket.assigneeId === user?.id} />          <Divider />
          <Attachments basePath={`/api/tickets/${ticket.id}`} />
          <Divider />
          <ResolutionSection ticket={ticket} canResolve={isManager || ticket.assigneeId === user?.id} isManager={isManager} onClose={onClose} />
          {isManager && !workKey && (
            <>
              <Divider />
              {converting ? <ConvertForm ticket={ticket} onDone={() => setConverting(false)} /> : (
                <Box>
                  <Button variant="outlined" startIcon={<ConvertIcon />} onClick={() => setConverting(true)}>Göreve çevir</Button>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    Destek talebi bir geliştirme işi gerektiriyorsa projeye görev olarak aktarın. Ticket ve görev birbirine bağlı kalır.
                  </Typography>
                </Box>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions>
    </Dialog>
  );
}

function ConvertForm({ ticket, onDone }: { ticket: Ticket; onDone: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [projectKey, setProjectKey] = useState("");
  const [type, setType] = useState(ticket.category === "Diğer" ? "Task" : "Bug");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState("");

  const projects = useQuery({ queryKey: ["projects"], queryFn: async () => (await api.get<Project[]>("/api/projects")).data });
  const managed = projects.data?.filter((p) => p.myRole === "Manager") ?? [];
  const detail = useQuery({
    queryKey: ["project", projectKey],
    queryFn: async () => (await api.get<ProjectDetail>(`/api/projects/${projectKey}`)).data,
    enabled: !!projectKey,
  });

  const convert = useMutation({
    mutationFn: async () => (await api.post<{ workItemKey: string; projectKey: string }>(
      `/api/tickets/${ticket.id}/convert`, { projectKey, type, assigneeId: assignee || null })).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["allTickets"] });
      qc.invalidateQueries({ queryKey: ["myTickets"] });
      qc.invalidateQueries({ queryKey: ["items", r.projectKey] });
      onDone();
      nav(`/projects/${r.projectKey}?item=${r.workItemKey}`);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">Göreve çevir</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {projects.data && managed.length === 0 && <Alert severity="info">Yöneticisi olduğunuz bir proje yok.</Alert>}
      <Stack direction="row" spacing={2}>
        <TextField select size="small" label="Proje" value={projectKey} onChange={(e) => { setProjectKey(e.target.value); setAssignee(""); }} sx={{ flex: 1 }}>
          {managed.map((p) => <MenuItem key={p.key} value={p.key}>{p.key} · {p.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Tür" value={type} onChange={(e) => setType(e.target.value)} sx={{ width: 130 }}>
          {TYPES.filter((t) => t !== "Epic").map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Atanan" value={assignee} onChange={(e) => setAssignee(e.target.value)} sx={{ flex: 1 }} disabled={!detail.data}>
          <MenuItem value="">Atanmadı</MenuItem>
          {detail.data?.members.map((m) => <MenuItem key={m.userId} value={m.userId}>{m.fullName}</MenuItem>)}
        </TextField>
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={!projectKey || convert.isPending} onClick={() => convert.mutate()}>Görev oluştur</Button>
        <Button onClick={onDone}>Vazgeç</Button>
      </Stack>
    </Stack>
  );
}

// Çözüm notu + "Çözüldü" + (yönetici) bilgi bankasına makale
function ResolutionSection({ ticket, canResolve, isManager, onClose }: {
  ticket: Ticket; canResolve: boolean; isManager: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [note, setNote] = useState(ticket.resolutionNote ?? "");
  const [status, setStatus] = useState(ticket.status);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const resolved = status === "resolved" || status === "closed";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["allTickets"] });
    qc.invalidateQueries({ queryKey: ["myTickets"] });
  };
  const setSt = useMutation({
    mutationFn: async (s: string) => (await api.patch<Ticket>(`/api/tickets/${ticket.id}/status`, { status: s, resolutionNote: note })).data,
    onSuccess: (t) => { setStatus(t.status); refresh(); setMsg({ ok: true, text: `Durum: ${TICKET_STATUSES[t.status]}` }); },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });
  const toArticle = useMutation({
    mutationFn: async () => (await api.post<{ id: string; alreadyExists: boolean }>(`/api/tickets/${ticket.id}/to-article`)).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      onClose();
      nav(`/kb?article=${r.id}`);
    },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });

  if (!canResolve)
    return ticket.resolutionNote ? (
      <Box>
        <Typography variant="subtitle2">Çözüm</Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{ticket.resolutionNote}</Typography>
      </Box>
    ) : null;

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Çözüm</Typography>
      {msg && <Alert severity={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <TextField multiline minRows={2} size="small" placeholder="Sorun nasıl çözüldü? (Bilgi bankası makalesine dönüşebilir)"
        value={note} onChange={(e) => setNote(e.target.value)} />
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        {!resolved ? (
          <>
            {status !== "in_progress" && <Button size="small" variant="outlined" onClick={() => setSt.mutate("in_progress")}>İşleme al</Button>}
            <Button size="small" variant="contained" color="success" disabled={!note.trim() || setSt.isPending}
              onClick={() => setSt.mutate("resolved")}>Çözüldü olarak işaretle</Button>
          </>
        ) : (
          <>
            <Button size="small" variant="outlined" onClick={() => setSt.mutate(status)}>Notu kaydet</Button>
            {status === "resolved" && <Button size="small" onClick={() => setSt.mutate("closed")}>Kapat</Button>}
            <Button size="small" color="warning" onClick={() => setSt.mutate("in_progress")}>Yeniden aç</Button>
            {isManager && (
              <Button size="small" variant="contained" startIcon={<ArticleIcon />} disabled={!note.trim() || toArticle.isPending}
                onClick={() => toArticle.mutate()}>Makaleye dönüştür</Button>
            )}
          </>
        )}
      </Stack>
      {resolved && isManager && (
        <Typography variant="caption" color="text.secondary">
          Makale taslak olarak oluşur; bilgi bankasında düzenleyip yayınladığınızda çalışanlar ve asistan kullanabilir.
        </Typography>
      )}
    </Stack>
  );
}
