import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton,
  ListItemText, Menu, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import FilterIcon from "@mui/icons-material/FilterList";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import { api, errorMessage, type SavedFilterT } from "../api";

export interface FilterState { assignee?: string; type?: string; label?: string; text?: string; overdue?: boolean }

const isEmpty = (f: FilterState) => !f.assignee && !f.type && !f.label && !f.text && !f.overdue;

// "Kayıtlı filtreler" menüsü: uygula, mevcut filtreyi kaydet, ekiple paylaş
export default function SavedFilters({ projectKey, current, onApply }: {
  projectKey: string; current: FilterState; onApply: (f: FilterState) => void;
}) {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState("");

  const list = useQuery({
    queryKey: ["filters", projectKey],
    queryFn: async () => (await api.get<SavedFilterT[]>(`/api/projects/${projectKey}/filters`)).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["filters", projectKey] });
  const save = useMutation({
    mutationFn: () => api.post(`/api/projects/${projectKey}/filters`, { name, query: JSON.stringify(current), shared }),
    onSuccess: () => { refresh(); setSaving(false); setName(""); setShared(false); },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/api/filters/${id}`), onSuccess: refresh });

  const apply = (f: SavedFilterT) => {
    try { onApply(JSON.parse(f.query) as FilterState); } catch { /* bozuk kayıt */ }
    setAnchor(null);
  };

  return (
    <>
      <Button size="small" startIcon={<FilterIcon />} onClick={(e) => setAnchor(e.currentTarget)}>Kayıtlı filtreler</Button>
      {!isEmpty(current) && <Button size="small" onClick={() => onApply({})}>Temizle</Button>}
      <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {list.data?.length === 0 && <MenuItem disabled>Kayıtlı filtre yok</MenuItem>}
        {list.data?.map((f) => (
          <MenuItem key={f.id} onClick={() => apply(f)} sx={{ minWidth: 260 }}>
            <ListItemText primary={f.name} secondary={f.mine ? (f.shared ? "Ekiple paylaşıldı" : "Sadece ben") : `Paylaşan: ${f.ownerName}`} />
            {f.mine && (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); remove.mutate(f.id); }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem disabled={isEmpty(current)} onClick={() => { setAnchor(null); setSaving(true); }}>
          Geçerli filtreyi kaydet…
        </MenuItem>
      </Menu>

      <Dialog open={saving} onClose={() => setSaving(false)} fullWidth maxWidth="xs">
        <DialogTitle>Filtreyi kaydet</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <TextField label="Ad (ör. Bana atanan açık buglar)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <FormControlLabel control={<Checkbox checked={shared} onChange={(e) => setShared(e.target.checked)} />} label="Proje ekibiyle paylaş" />
            {error && <Typography color="error" variant="body2">{error}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaving(false)}>Vazgeç</Button>
          <Button variant="contained" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>Kaydet</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
