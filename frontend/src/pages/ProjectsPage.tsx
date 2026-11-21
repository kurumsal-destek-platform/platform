import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack,
  TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api, errorMessage, type ProgressStats, type Project } from "../api";
import { useAuth } from "../auth";

export default function ProjectsPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const projects = useQuery({ queryKey: ["projects"], queryFn: async () => (await api.get<Project[]>("/api/projects")).data });
  const canCreate = user?.role === "Manager" || user?.role === "Admin";

  return (
    <>
      <Stack direction="row" sx={{ alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Projeler</Typography>
        {canCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>Proje oluştur</Button>}
      </Stack>
      {projects.data?.length === 0 && <Alert severity="info">Henüz üyesi olduğunuz bir proje yok.</Alert>}
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
        {projects.data?.map((p) => (
          <Card key={p.id} variant="outlined" sx={{ width: { xs: "100%", sm: 320 }, display: "flex" }}>
            <CardActionArea onClick={() => nav(`/projects/${p.key}`)} sx={{ display: "flex", alignItems: "stretch" }}>
              <CardContent sx={{ display: "flex", flexDirection: "column", width: "100%" }}>
                <Typography variant="caption" color="primary">{p.key}</Typography>
                <Typography variant="h6">{p.name}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{p.description}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
                  Rolünüz: {p.myRole === "Manager" ? "Proje yöneticisi" : "Üye"}
                </Typography>
                <Box sx={{ mt: "auto" }}>
                  <MyProgress mine={p.mine} team={p.team} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
      {creating && <CreateProject onClose={() => setCreating(false)} />}
    </>
  );
}

// Proje kartındaki ilerleme: kalın çubuk = bana atanan işler, ince çubuk = tüm ekip
function MyProgress({ mine, team }: { mine?: ProgressStats; team?: ProgressStats }) {
  if (!mine || !team) return null;
  const color = (s: ProgressStats) => (s.percent === 100 ? "success" : s.overdue > 0 ? "warning" : "primary") as "success" | "warning" | "primary";
  return (
    <Stack spacing={1.25}>
      {mine.total > 0 ? (
        <Box>
          <Stack direction="row" sx={{ alignItems: "baseline", mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>Benim işlerim</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>%{mine.percent}</Typography>
          </Stack>
          <Tooltip title={`${mine.done} tamamlandı · ${mine.inProgress} devam ediyor · ${mine.total - mine.done - mine.inProgress} yapılacak`}>
            <LinearProgress variant="determinate" value={mine.percent} color={color(mine)}
              sx={{ height: 8, borderRadius: 4 }} aria-label={`İşlerimin %${mine.percent}'i tamamlandı`} />
          </Tooltip>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>{mine.done}/{mine.total} iş tamamlandı</Typography>
            {mine.inProgress > 0 && <Chip size="small" variant="outlined" label={`${mine.inProgress} devam ediyor`} sx={{ height: 20, fontSize: 11 }} />}
            {mine.overdue > 0 && <Chip size="small" color="error" variant="outlined" label={`${mine.overdue} gecikmiş`} sx={{ height: 20, fontSize: 11 }} />}
            {mine.percent === 100 && <Chip size="small" color="success" label="Hepsi bitti 🎉" sx={{ height: 20, fontSize: 11 }} />}
          </Stack>
        </Box>
      ) : (
        <Typography variant="caption" color="text.secondary">Bu projede size atanmış iş yok.</Typography>
      )}
      {team.total > 0 && (
        <Box>
          <Stack direction="row" sx={{ mb: 0.25 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Ekip · {team.done}/{team.total} iş</Typography>
            <Typography variant="caption" color="text.secondary">%{team.percent}</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={team.percent} color="inherit"
            sx={{ height: 4, borderRadius: 2, color: "text.disabled" }} aria-label={`Ekibin %${team.percent}'i tamamlandı`} />
        </Box>
      )}
    </Stack>
  );
}

function CreateProject({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: () => api.post("/api/projects", { key, name, description }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); onClose(); nav(`/projects/${key.toUpperCase()}`); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Yeni proje</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Ad" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField label="Anahtar (2-5 harf, ör. ANK)" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} />
          <TextField label="Açıklama" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" disabled={!name || key.length < 2 || create.isPending} onClick={() => create.mutate()}>Oluştur</Button>
      </DialogActions>
    </Dialog>
  );
}
