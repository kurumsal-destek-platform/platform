import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Autocomplete, Box, Button, IconButton, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { api, errorMessage, type LinkT, type ProjectDetail, type WorkItem } from "../api";
import { Person, StatusChip, TypeIcon } from "./common";

// ---------- Alt görevler ----------
export function SubtasksSection({ itemKey, children, project, canAdd, onOpenItem, onChanged }: {
  itemKey: string; children: WorkItem[]; project: ProjectDetail; canAdd: boolean;
  onOpenItem?: (key: string) => void; onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState("");
  const done = children.filter((c) => c.status === "done").length;

  const add = useMutation({
    mutationFn: () => api.post(`/api/items/${itemKey}/subtasks`, { title, assigneeId: assignee || null }),
    onSuccess: () => { setTitle(""); setAssignee(""); setAdding(false); onChanged(); },
    onError: (e) => setError(errorMessage(e)),
  });

  if (!children.length && !canAdd) return null;
  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Alt görevler {children.length > 0 && `(${done}/${children.length})`}
        </Typography>
        {canAdd && !adding && <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>Alt görev</Button>}
      </Stack>
      {children.length > 0 && (
        <LinearProgress variant="determinate" value={(100 * done) / children.length} sx={{ mb: 1, height: 4, borderRadius: 2 }} />
      )}
      {children.map((c) => (
        <Stack key={c.id} direction="row" spacing={1} onClick={() => onOpenItem?.(c.key)}
          sx={{ alignItems: "center", py: 0.5, px: 0.5, borderRadius: 1, cursor: onOpenItem ? "pointer" : "default", "&:hover": { bgcolor: "action.hover" } }}>
          <TypeIcon type={c.type} />
          <Typography variant="body2" color="primary">{c.key}</Typography>
          <Typography variant="body2" sx={{ flex: 1 }} noWrap>{c.title}</Typography>
          <Person name={c.assigneeName?.split(" ")[0]} />
          <StatusChip status={c.status} />
        </Stack>
      ))}
      {adding && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <TextField size="small" autoFocus placeholder="Alt görev başlığı" value={title} sx={{ flex: 1 }}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) add.mutate(); if (e.key === "Escape") setAdding(false); }} />
          <TextField select size="small" label="Atanan" value={assignee} onChange={(e) => setAssignee(e.target.value)} sx={{ width: 150 }}>
            <MenuItem value="">Ben</MenuItem>
            {project.members.map((m) => <MenuItem key={m.userId} value={m.userId}>{m.fullName}</MenuItem>)}
          </TextField>
          <Button variant="contained" disabled={!title.trim() || add.isPending} onClick={() => add.mutate()}>Ekle</Button>
          <Button onClick={() => setAdding(false)}>Vazgeç</Button>
        </Stack>
      )}
      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
}

// ---------- Bağlantılar (engeller / engellenir / ilişkili / kopyası) ----------
const LINK_TYPES = [
  { value: "blocks", label: "engeller" },
  { value: "relates", label: "ilişkili" },
  { value: "duplicates", label: "şunun kopyası" },
];

export function LinksSection({ itemKey, projectKey, canEdit, onOpenItem }: {
  itemKey: string; projectKey: string; canEdit: boolean; onOpenItem?: (key: string) => void;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("blocks");
  const [target, setTarget] = useState<WorkItem | null>(null);
  const [error, setError] = useState("");

  const links = useQuery({
    queryKey: ["links", itemKey],
    queryFn: async () => (await api.get<LinkT[]>(`/api/items/${itemKey}/links`)).data,
  });
  const candidates = useQuery({
    queryKey: ["items", projectKey],
    queryFn: async () => (await api.get<WorkItem[]>(`/api/projects/${projectKey}/items`)).data,
    enabled: adding,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["links", itemKey] });
    qc.invalidateQueries({ queryKey: ["activity", itemKey] });
  };
  const add = useMutation({
    mutationFn: () => api.post(`/api/items/${itemKey}/links`, { targetKey: target!.key, type }),
    onSuccess: () => { setAdding(false); setTarget(null); refresh(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/links/${id}`),
    onSuccess: refresh, onError: (e) => setError(errorMessage(e)),
  });

  if (!links.data?.length && !canEdit) return null;
  // "tarafından engelleniyor" ve bitmemiş → uyarı
  const blockedBy = links.data?.filter((l) => l.type === "blocks" && !l.outgoing && l.other.status !== "done") ?? [];

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>Bağlantılı işler</Typography>
        {canEdit && !adding && <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>Bağlantı</Button>}
      </Stack>
      {blockedBy.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1, py: 0 }}>
          Bu iş {blockedBy.map((b) => b.other.key).join(", ")} bitmeden tamamlanamaz.
        </Alert>
      )}
      {links.data?.map((l) => (
        <Stack key={l.id} direction="row" spacing={1} sx={{ alignItems: "center", py: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ width: 150 }}>{l.label}</Typography>
          <TypeIcon type={l.other.type} />
          <Typography variant="body2" color="primary" sx={{ cursor: "pointer" }} onClick={() => onOpenItem?.(l.other.key)}>
            {l.other.key}
          </Typography>
          <Typography variant="body2" sx={{ flex: 1 }} noWrap>{l.other.title}</Typography>
          <StatusChip status={l.other.status} />
          {canEdit && (
            <Tooltip title="Bağlantıyı kaldır">
              <IconButton size="small" onClick={() => remove.mutate(l.id)}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
            </Tooltip>
          )}
        </Stack>
      ))}
      {adding && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <TextField select size="small" value={type} onChange={(e) => setType(e.target.value)} sx={{ width: 150 }}>
            {LINK_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          <Autocomplete size="small" sx={{ flex: 1 }} value={target} onChange={(_, v) => setTarget(v)}
            options={(candidates.data ?? []).filter((w) => w.key !== itemKey)}
            getOptionLabel={(w) => `${w.key} · ${w.title}`} loading={candidates.isLoading}
            renderInput={(p) => <TextField {...p} placeholder="Görev ara…" />} />
          <Button variant="contained" disabled={!target || add.isPending} onClick={() => add.mutate()}>Bağla</Button>
          <Button onClick={() => setAdding(false)}>Vazgeç</Button>
        </Stack>
      )}
      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
}

// ---------- Etiket seçici ----------
export function LabelsField({ projectKey, value, onChange, disabled }: {
  projectKey: string; value: string[]; onChange: (v: string[]) => void; disabled?: boolean;
}) {
  const options = useQuery({
    queryKey: ["labels", projectKey],
    queryFn: async () => (await api.get<string[]>(`/api/projects/${projectKey}/labels`)).data,
  });
  return (
    <Autocomplete multiple freeSolo size="small" disabled={disabled} value={value} options={options.data ?? []}
      onChange={(_, v) => onChange((v as string[]).map((x) => x.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, "-")).filter(Boolean))}
      renderInput={(p) => <TextField {...p} label="Etiketler" placeholder={value.length ? "" : "yazıp Enter"} />} />
  );
}
