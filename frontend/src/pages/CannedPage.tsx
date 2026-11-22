import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  LinearProgress, MenuItem, Stack, Switch, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import { api, CATEGORIES, errorMessage, type CannedT } from "../api";

type Form = { id?: string; title: string; body: string; category: string; shared: boolean };
const EMPTY: Form = { title: "", body: "", category: "", shared: true };

// Hazır yanıtlar: destek ekibinin sık yazdığı cevaplar. Ticket yazışmasında "Hazır yanıt" düğmesiyle eklenir.
export default function CannedPage() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const list = useQuery({ queryKey: ["canned"], queryFn: async () => (await api.get<CannedT[]>("/api/canned-responses")).data });
  const refresh = () => qc.invalidateQueries({ queryKey: ["canned"] });
  const save = useMutation({
    mutationFn: async (f: Form) => {
      const body = { title: f.title, body: f.body, category: f.category || null, shared: f.shared };
      return f.id ? api.put(`/api/canned-responses/${f.id}`, body) : api.post("/api/canned-responses", body);
    },
    onSuccess: () => { setEdit(null); setError(""); refresh(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: async (id: string) => api.delete(`/api/canned-responses/${id}`), onSuccess: refresh });

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Stack direction="row" sx={{ alignItems: "center", mb: 0.5, gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Hazır yanıtlar</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setError(""); setEdit(EMPTY); }}>Yeni hazır yanıt</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Sık yazdığınız cevapları kaydedin; ticket yazışmasında <b>Hazır yanıt</b> düğmesiyle tek tıkla eklenir.
        Yer tutucular otomatik dolar: <code>{"{ad}"}</code> çalışanın adı, <code>{"{ticket}"}</code> başlık, <code>{"{benim_adim}"}</code> sizin adınız.
      </Typography>
      {list.isLoading && <LinearProgress />}
      {list.error && <Alert severity="error">{errorMessage(list.error)}</Alert>}
      {list.data?.length === 0 && <Card variant="outlined" sx={{ p: 3, textAlign: "center" }}><Typography color="text.secondary">Henüz hazır yanıt yok.</Typography></Card>}
      <Stack spacing={1.5}>
        {list.data?.map((c) => (
          <Card key={c.id} variant="outlined">
            <CardContent sx={{ pb: "12px !important" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                <Typography sx={{ fontWeight: 600, flex: 1 }}>{c.title}</Typography>
                {c.category && <Chip size="small" label={c.category} />}
                {!c.shared && <Chip size="small" variant="outlined" label="Sadece ben" />}
                {c.canEdit && (
                  <>
                    <IconButton size="small" aria-label="Düzenle" onClick={() => { setError(""); setEdit({ id: c.id, title: c.title, body: c.body, category: c.category ?? "", shared: c.shared }); }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label="Sil" onClick={() => { if (window.confirm(`"${c.title}" silinsin mi?`)) remove.mutate(c.id); }}><DeleteIcon fontSize="small" /></IconButton>
                  </>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>{c.body}</Typography>
              <Typography variant="caption" color="text.secondary">{c.usageCount} kez kullanıldı · {c.createdBy}</Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Dialog open={!!edit} onClose={() => setEdit(null)} fullWidth maxWidth="sm">
        <DialogTitle>{edit?.id ? "Hazır yanıtı düzenle" : "Yeni hazır yanıt"}</DialogTitle>
        {edit && (
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label="Başlık" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} autoFocus />
              <TextField label="Metin" multiline minRows={6} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                placeholder={"Merhaba {ad},\n\n…\n\n{benim_adim}"} />
              <TextField select label="Kategori (isteğe bağlı)" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                <MenuItem value="">Tümü</MenuItem>
                {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
              <FormControlLabel control={<Switch checked={edit.shared} onChange={(e) => setEdit({ ...edit, shared: e.target.checked })} />}
                label="Tüm destek ekibi kullanabilsin" />
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Vazgeç</Button>
          <Button variant="contained" disabled={!edit?.title.trim() || !edit?.body.trim() || save.isPending} onClick={() => edit && save.mutate(edit)}>Kaydet</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
