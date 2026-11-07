import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Stack,
  TextField, Typography,
} from "@mui/material";
import MoreIcon from "@mui/icons-material/MoreHoriz";
import AddIcon from "@mui/icons-material/Add";
import { api, errorMessage, type ProjectDetail, type Sprint, type WorkItem } from "../api";
import { Person, StatusChip, TypeIcon } from "./common";

// Jira'daki Backlog sayfası: sprint blokları + backlog listesi.
// Proje yöneticisi sprint oluşturur, işleri sprintlere taşır, sprint başlatır/tamamlar.
export default function BacklogView({ project, items, sprints, onOpen, onError }: {
  project: ProjectDetail; items: WorkItem[]; sprints: Sprint[];
  onOpen: (key: string) => void; onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const isManager = project.myRole === "Manager";
  const [starting, setStarting] = useState<Sprint | null>(null);
  const [completing, setCompleting] = useState<Sprint | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["items", project.key] });
    qc.invalidateQueries({ queryKey: ["sprints", project.key] });
  };
  const onErr = (e: unknown) => onError(errorMessage(e));

  const createSprint = useMutation({
    mutationFn: () => api.post(`/api/projects/${project.key}/sprints`, {}),
    onSuccess: refresh, onError: onErr,
  });
  const move = useMutation({
    mutationFn: ({ k, sprintId }: { k: string; sprintId: string | null }) => api.put(`/api/items/${k}/sprint`, { sprintId }),
    onSuccess: refresh, onError: onErr,
  });

  const work = items.filter((w) => w.type !== "Epic");
  const backlog = work.filter((w) => !w.sprintId);
  const hasActive = sprints.some((s) => s.status === "active");

  return (
    <Stack spacing={2}>
      {sprints.map((s) => {
        const list = work.filter((w) => w.sprintId === s.id);
        const pts = list.reduce((a, w) => a + (w.storyPoints ?? 0), 0);
        return (
          <Card key={s.id} variant="outlined" sx={{ p: 1.5, borderColor: s.status === "active" ? "primary.main" : undefined }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
              <Typography sx={{ fontWeight: 700 }}>{s.name}</Typography>
              {s.status === "active" && <Chip size="small" color="primary" label="Aktif" />}
              {s.status === "active" && s.endDate && (
                <Typography variant="caption" color="text.secondary">bitiş {new Date(s.endDate).toLocaleDateString("tr-TR")}</Typography>
              )}
              <Typography variant="caption" color="text.secondary">· {list.length} iş · {pts} puan</Typography>
              <Box sx={{ flex: 1 }} />
              {isManager && s.status === "planned" && (
                <Button size="small" variant="outlined" disabled={hasActive || list.length === 0} onClick={() => setStarting(s)}>
                  Sprint başlat
                </Button>
              )}
              {isManager && s.status === "active" && (
                <Button size="small" variant="contained" onClick={() => setCompleting(s)}>Sprinti tamamla</Button>
              )}
            </Stack>
            {s.goal && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{s.goal}</Typography>}
            {list.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center", border: 1, borderStyle: "dashed", borderColor: "divider", borderRadius: 1 }}>
                Sprinti planlamak için backlog'daki işlerin ⋯ menüsünden bu sprinte taşıyın.
              </Typography>
            )}
            {list.map((w) => <Row key={w.id} w={w} sprints={sprints} canMove={isManager} onOpen={onOpen} onMove={(sid) => move.mutate({ k: w.key, sprintId: sid })} />)}
          </Card>
        );
      })}

      <Card variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>Backlog</Typography>
          <Typography variant="caption" color="text.secondary">· {backlog.length} iş</Typography>
          <Box sx={{ flex: 1 }} />
          {isManager && (
            <Button size="small" startIcon={<AddIcon />} onClick={() => createSprint.mutate()} disabled={createSprint.isPending}>
              Sprint oluştur
            </Button>
          )}
        </Stack>
        {backlog.length === 0 && <Typography variant="body2" color="text.secondary">Backlog boş.</Typography>}
        {backlog.map((w) => <Row key={w.id} w={w} sprints={sprints} canMove={isManager} onOpen={onOpen} onMove={(sid) => move.mutate({ k: w.key, sprintId: sid })} />)}
      </Card>

      {starting && <StartDialog sprint={starting} onClose={() => setStarting(null)} onDone={refresh} onError={onErr} />}
      {completing && (
        <CompleteDialog sprint={completing} items={work.filter((w) => w.sprintId === completing.id)}
          next={sprints.filter((s) => s.status === "planned")} onClose={() => setCompleting(null)} onDone={refresh} onError={onErr} />
      )}
    </Stack>
  );
}

function Row({ w, sprints, canMove, onOpen, onMove }: {
  w: WorkItem; sprints: Sprint[]; canMove: boolean; onOpen: (k: string) => void; onMove: (sprintId: string | null) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const targets = sprints.filter((s) => s.id !== w.sprintId);
  return (
    <Stack direction="row" spacing={1.5} onClick={() => onOpen(w.key)}
      sx={{ alignItems: "center", px: 1, py: 0.8, borderRadius: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
      <TypeIcon type={w.type} />
      <Typography variant="body2" color="primary" sx={{ width: 64 }}>{w.key}</Typography>
      <Typography variant="body2" sx={{ flex: 1 }} noWrap>{w.title}</Typography>
      <StatusChip status={w.status} />
      <Box sx={{ width: 28, textAlign: "center", fontSize: 12, bgcolor: "action.selected", borderRadius: 2 }}>{w.storyPoints ?? "–"}</Box>
      <Box sx={{ width: 150 }}><Person name={w.assigneeName} /></Box>
      {canMove && (
        <>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}><MoreIcon fontSize="small" /></IconButton>
          <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} onClick={(e) => e.stopPropagation()}>
            {targets.map((s) => (
              <MenuItem key={s.id} onClick={() => { setAnchor(null); onMove(s.id); }}>{s.name} sprintine taşı</MenuItem>
            ))}
            {w.sprintId && <MenuItem onClick={() => { setAnchor(null); onMove(null); }}>Backlog'a taşı</MenuItem>}
            {targets.length === 0 && !w.sprintId && <MenuItem disabled>Önce bir sprint oluşturun</MenuItem>}
          </Menu>
        </>
      )}
    </Stack>
  );
}

function StartDialog({ sprint, onClose, onDone, onError }: {
  sprint: Sprint; onClose: () => void; onDone: () => void; onError: (e: unknown) => void;
}) {
  const [goal, setGoal] = useState(sprint.goal);
  const [days, setDays] = useState("14");
  const start = useMutation({
    mutationFn: () => api.post(`/api/sprints/${sprint.id}/start`, { goal, durationDays: Number(days) }),
    onSuccess: () => { onDone(); onClose(); }, onError,
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{sprint.name} başlat</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="Süre" value={days} onChange={(e) => setDays(e.target.value)}>
            <MenuItem value="7">1 hafta</MenuItem><MenuItem value="14">2 hafta</MenuItem>
            <MenuItem value="21">3 hafta</MenuItem><MenuItem value="28">4 hafta</MenuItem>
          </TextField>
          <TextField label="Sprint hedefi" value={goal} onChange={(e) => setGoal(e.target.value)} multiline minRows={2} />
          <Typography variant="caption" color="text.secondary">Sprintteki işlerin sahiplerine bildirim gönderilir.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" onClick={() => start.mutate()} disabled={start.isPending}>Başlat</Button>
      </DialogActions>
    </Dialog>
  );
}

function CompleteDialog({ sprint, items, next, onClose, onDone, onError }: {
  sprint: Sprint; items: WorkItem[]; next: Sprint[]; onClose: () => void; onDone: () => void; onError: (e: unknown) => void;
}) {
  const done = items.filter((w) => w.status === "done").length;
  const open = items.length - done;
  const [target, setTarget] = useState("");
  const complete = useMutation({
    mutationFn: () => api.post(`/api/sprints/${sprint.id}/complete`, { moveToSprintId: target || null }),
    onSuccess: () => { onDone(); onClose(); }, onError,
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{sprint.name} tamamla</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography><b>{done}</b> iş tamamlandı, <b>{open}</b> iş açık.</Typography>
          {open > 0 && (
            <TextField select label="Açık işler nereye taşınsın?" value={target} onChange={(e) => setTarget(e.target.value)}>
              <MenuItem value="">Backlog</MenuItem>
              {next.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" onClick={() => complete.mutate()} disabled={complete.isPending}>Sprinti tamamla</Button>
      </DialogActions>
    </Dialog>
  );
}
