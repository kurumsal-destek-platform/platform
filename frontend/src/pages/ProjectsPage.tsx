import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Button, Card, CardActionArea, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api, errorMessage, type Project } from "../api";
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
          <Card key={p.id} variant="outlined" sx={{ width: 300 }}>
            <CardActionArea onClick={() => nav(`/projects/${p.key}`)}>
              <CardContent>
                <Typography variant="caption" color="primary">{p.key}</Typography>
                <Typography variant="h6">{p.name}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{p.description}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Rolünüz: {p.myRole === "Manager" ? "Proje yöneticisi" : "Üye"}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
      {creating && <CreateProject onClose={() => setCreating(false)} />}
    </>
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
