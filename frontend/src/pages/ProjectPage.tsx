import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Snackbar, Stack, Tab, Table,
  TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LockIcon from "@mui/icons-material/LockOutlined";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import {
  api, errorMessage, PRIORITIES, STATUSES, TYPES, type ProjectDetail, type WorkItem,
} from "../api";
import { useAuth } from "../auth";
import { Person, PriorityText, StatusChip, TypeIcon } from "../components/common";
import WorkItemDialog from "../components/WorkItemDialog";

export default function ProjectPage() {
  const { key = "" } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const project = useQuery({
    queryKey: ["project", key],
    queryFn: async () => (await api.get<ProjectDetail>(`/api/projects/${key}`)).data,
  });
  const items = useQuery({
    queryKey: ["items", key],
    queryFn: async () => (await api.get<WorkItem[]>(`/api/projects/${key}/items`)).data,
  });

  const moveStatus = useMutation({
    mutationFn: ({ k, s }: { k: string; s: string }) => api.patch(`/api/items/${k}/status`, { status: s }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items", key] }),
    onError: (e) => { setToast(errorMessage(e)); qc.invalidateQueries({ queryKey: ["items", key] }); },
  });

  if (project.isError) return <Alert severity="warning">Proje bulunamadı ya da erişiminiz yok.</Alert>;
  if (!project.data) return <Typography>Yükleniyor…</Typography>;
  const p = project.data;
  const isManager = p.myRole === "Manager";

  const filtered = (items.data ?? []).filter((w) =>
    (!assigneeFilter || (assigneeFilter === "none" ? !w.assigneeId : w.assigneeId === assigneeFilter)) &&
    (!typeFilter || w.type === typeFilter));

  const onDragEnd = (e: DragEndEvent) => {
    const item = items.data?.find((w) => w.key === e.active.id);
    const target = e.over?.id as string | undefined;
    if (!item || !target || item.status === target) return;
    // Arayüzde hemen taşı (iyimser güncelleme); backend reddederse geri alınır.
    qc.setQueryData<WorkItem[]>(["items", key], (old) => old?.map((w) => (w.key === item.key ? { ...w, status: target } : w)));
    moveStatus.mutate({ k: item.key, s: target });
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">Projeler</Typography>
      <Stack direction="row" sx={{ alignItems: "center", mb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>{p.name}</Typography>
        {isManager && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>Oluştur</Button>}
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Liste" /><Tab label="Pano" /><Tab label="Üyeler" />
      </Tabs>

      {tab !== 2 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField select size="small" label="Atanan" value={assigneeFilter} sx={{ minWidth: 180 }}
            onChange={(e) => setAssigneeFilter(e.target.value)}>
            <MenuItem value="">Herkes</MenuItem>
            <MenuItem value={user!.id}>Sadece ben</MenuItem>
            <MenuItem value="none">Atanmamış</MenuItem>
            {p.members.map((m) => <MenuItem key={m.userId} value={m.userId}>{m.fullName}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Tür" value={typeFilter} sx={{ minWidth: 140 }}
            onChange={(e) => setTypeFilter(e.target.value)}>
            <MenuItem value="">Tümü</MenuItem>
            {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
        </Stack>
      )}

      {tab === 0 && (
        <Card variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Bilet</TableCell><TableCell>Atanan</TableCell><TableCell>Raporlayan</TableCell>
                <TableCell>Öncelik</TableCell><TableCell>Durum</TableCell><TableCell>Bitiş</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((w) => (
                <TableRow key={w.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpen(w.key)}>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <TypeIcon type={w.type} />
                      <Typography variant="body2" color="primary">{w.key}</Typography>
                      <Typography variant="body2">{w.title}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell><Person name={w.assigneeName} /></TableCell>
                  <TableCell><Person name={w.reporterName} /></TableCell>
                  <TableCell><PriorityText p={w.priority} /></TableCell>
                  <TableCell><StatusChip status={w.status} /></TableCell>
                  <TableCell>{w.dueDate ? new Date(w.dueDate).toLocaleDateString("tr-TR") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {tab === 1 && (
        <DndContext onDragEnd={onDragEnd}>
          <Stack direction="row" spacing={2} sx={{ overflowX: "auto", pb: 2, alignItems: "flex-start" }}>
            {STATUSES.map((s) => (
              <Column key={s.key} id={s.key} title={s.label}
                count={filtered.filter((w) => w.status === s.key).length}>
                {filtered.filter((w) => w.status === s.key).map((w) => (
                  <BoardCard key={w.id} item={w} canDrag={w.assigneeId === user!.id} onOpen={() => setOpen(w.key)} />
                ))}
              </Column>
            ))}
          </Stack>
        </DndContext>
      )}

      {tab === 2 && (
        <Card variant="outlined" sx={{ p: 2 }}>
          {p.members.map((m) => (
            <Stack key={m.userId} direction="row" sx={{ alignItems: "center", py: 1 }}>
              <Box sx={{ flex: 1 }}><Person name={m.fullName} /></Box>
              <Typography variant="body2" color="text.secondary">{m.role === "Manager" ? "Proje yöneticisi" : "Üye"}</Typography>
            </Stack>
          ))}
        </Card>
      )}

      <WorkItemDialog itemKey={open} project={p} onClose={() => setOpen(null)} />
      {creating && <CreateDialog project={p} items={items.data ?? []} onClose={() => setCreating(false)} />}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast("")}>
        <Alert severity="error" variant="filled" onClose={() => setToast("")}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
}

function Column({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <Box ref={setNodeRef} sx={{
      width: 280, flexShrink: 0, bgcolor: isOver ? "action.selected" : "#161a1d", borderRadius: 2, p: 1.5, minHeight: 300,
    }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>
        {title} {count}
      </Typography>
      <Stack spacing={1} sx={{ mt: 1.5 }}>{children}</Stack>
    </Box>
  );
}

function BoardCard({ item, canDrag, onOpen }: { item: WorkItem; canDrag: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.key, disabled: !canDrag });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 10 } : undefined;
  return (
    <Card ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={onOpen}
      sx={{ p: 1.5, cursor: canDrag ? "grab" : "pointer", opacity: isDragging ? 0.7 : 1, "&:hover": { bgcolor: "action.hover" } }}>
      <Typography variant="body2" sx={{ mb: 1 }}>{item.title}</Typography>
      {item.dueDate && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {new Date(item.dueDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <TypeIcon type={item.type} />
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{item.key}</Typography>
        {!canDrag && <LockIcon sx={{ fontSize: 14, color: "text.disabled" }} titleAccess="Sadece atanan kişi taşıyabilir" />}
        <Person name={item.assigneeName ? item.assigneeName.split(" ")[0] : null} />
      </Stack>
    </Card>
  );
}

function CreateDialog({ project, items, onClose }: { project: ProjectDetail; items: WorkItem[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", type: "Task", description: "", priority: "Medium", assigneeId: "", parentId: "", dueDate: "" });
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => api.post(`/api/projects/${project.key}/items`, {
      ...form,
      assigneeId: form.assigneeId || null,
      parentId: form.parentId || null,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["items", project.key] }); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Yeni iş öğesi — {project.key}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select label="Tür" value={form.type} onChange={set("type")}>
            {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField label="Özet" value={form.title} onChange={set("title")} autoFocus />
          <TextField label="Açıklama" value={form.description} onChange={set("description")} multiline minRows={3} />
          <TextField select label="Üst öğe" value={form.parentId} onChange={set("parentId")}>
            <MenuItem value="">Yok</MenuItem>
            {items.filter((i) => i.type === "Epic" || i.type === "Story").map((i) => (
              <MenuItem key={i.id} value={i.id}>{i.key} · {i.title}</MenuItem>
            ))}
          </TextField>
          <TextField select label="Atanan" value={form.assigneeId} onChange={set("assigneeId")}>
            <MenuItem value="">Atanmadı</MenuItem>
            {project.members.map((m) => <MenuItem key={m.userId} value={m.userId}>{m.fullName}</MenuItem>)}
          </TextField>
          <TextField select label="Öncelik" value={form.priority} onChange={set("priority")}>
            {Object.entries(PRIORITIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <TextField type="date" label="Bitiş tarihi" value={form.dueDate} onChange={set("dueDate")}
            slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" disabled={!form.title.trim() || create.isPending} onClick={() => create.mutate()}>Oluştur</Button>
      </DialogActions>
    </Dialog>
  );
}
