import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Snackbar, Stack, Tab, Table,
  TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LockIcon from "@mui/icons-material/LockOutlined";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import {
  api, errorMessage, isOverdue, PRIORITIES, STATUSES, TYPES, type ProjectDetail, type Sprint, type WorkItem,
} from "../api";
import TimelineView from "../components/TimelineView";
import BacklogView from "../components/BacklogView";
import { useAuth } from "../auth";
import { DueDate, LabelChips, Person, PriorityText, StatusChip, TypeIcon } from "../components/common";
import SavedFilters, { type FilterState } from "../components/SavedFilters";
import { LabelsField } from "../components/ItemSections";
import WorkItemDialog from "../components/WorkItemDialog";

export default function ProjectPage() {
  const { key = "" } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const TAB_NAMES = ["backlog", "board", "list", "timeline", "members"];
  const [tab, setTab] = useState(Math.max(0, TAB_NAMES.indexOf(params.get("tab") ?? "board")));
  const [open, setOpen] = useState<string | null>(params.get("item"));

  // Bildirim ya da aramadan ?item=ANK-3 ile gelinirse detayı aç
  useEffect(() => {
    const it = params.get("item");
    if (it) setOpen(it);
    const t = params.get("tab");
    if (t && TAB_NAMES.includes(t)) setTab(TAB_NAMES.indexOf(t));
  }, [params]); // eslint-disable-line
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [text, setText] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const filterState: FilterState = { assignee: assigneeFilter, type: typeFilter, label: labelFilter, text, overdue: onlyOverdue };
  const applyFilter = (f: FilterState) => {
    setAssigneeFilter(f.assignee ?? ""); setTypeFilter(f.type ?? ""); setLabelFilter(f.label ?? "");
    setText(f.text ?? ""); setOnlyOverdue(!!f.overdue);
  };
  const labelsQ = useQuery({
    queryKey: ["labels", key],
    queryFn: async () => (await api.get<string[]>(`/api/projects/${key}/labels`)).data,
  });

  const project = useQuery({
    queryKey: ["project", key],
    queryFn: async () => (await api.get<ProjectDetail>(`/api/projects/${key}`)).data,
  });
  const items = useQuery({
    queryKey: ["items", key],
    queryFn: async () => (await api.get<WorkItem[]>(`/api/projects/${key}/items`)).data,
  });

  const sprints = useQuery({
    queryKey: ["sprints", key],
    queryFn: async () => (await api.get<Sprint[]>(`/api/projects/${key}/sprints`)).data,
  });
  const active = sprints.data?.find((s) => s.status === "active");

  const moveStatus = useMutation({
    mutationFn: ({ k, s }: { k: string; s: string }) => api.patch(`/api/items/${k}/status`, { status: s }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["items", key] }); qc.invalidateQueries({ queryKey: ["sprints", key] }); },
    onError: (e) => { setToast(errorMessage(e)); qc.invalidateQueries({ queryKey: ["items", key] }); },
  });

  if (project.isError) return <Alert severity="warning">Proje bulunamadı ya da erişiminiz yok.</Alert>;
  if (!project.data) return <Typography>Yükleniyor…</Typography>;
  const p = project.data;
  const isManager = p.myRole === "Manager";

  const filtered = (items.data ?? []).filter((w) =>
    (!assigneeFilter || (assigneeFilter === "none" ? !w.assigneeId : w.assigneeId === assigneeFilter)) &&
    (!typeFilter || w.type === typeFilter) &&
    (!labelFilter || (w.labels ?? []).includes(labelFilter)) &&
    (!onlyOverdue || isOverdue(w)) &&
    (!text || `${w.key} ${w.title}`.toLocaleLowerCase("tr-TR").includes(text.toLocaleLowerCase("tr-TR"))));
  // Pano, aktif sprint varsa sadece onun işlerini gösterir (Jira'daki gibi)
  const boardItems = active ? filtered.filter((w) => w.sprintId === active.id) : filtered.filter((w) => w.type !== "Epic");
  const daysLeft = active?.endDate ? Math.ceil((new Date(active.endDate).getTime() - Date.now()) / 86400000) : null;

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
      <Tabs value={tab} onChange={(_, v) => { setTab(v); setParams({ tab: TAB_NAMES[v] }, { replace: true }); }}
        sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Backlog" /><Tab label="Pano" /><Tab label="Liste" /><Tab label="Zaman çizelgesi" /><Tab label="Üyeler" />
      </Tabs>

      {tab === 3 && <TimelineView items={items.data ?? []} onOpen={setOpen} />}

      {tab === 0 && (
        <BacklogView project={p} items={items.data ?? []} sprints={sprints.data ?? []}
          onOpen={setOpen} onError={setToast} />
      )}

      {tab === 1 && (
        <Box sx={{ mb: 2 }}>
          {active ? (
            <Typography variant="body2" color="text.secondary">
              <b>{active.name}</b>{active.goal && ` · ${active.goal}`}
              {daysLeft != null && ` · ${daysLeft > 0 ? `${daysLeft} gün kaldı` : "süresi doldu"}`}
              {` · ${active.donePoints ?? 0}/${active.points ?? 0} puan tamamlandı`}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">Aktif sprint yok; tüm işler gösteriliyor. Backlog sekmesinden sprint başlatabilirsiniz.</Typography>
          )}
        </Box>
      )}

      {(tab === 1 || tab === 2) && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
          <TextField size="small" placeholder="Bu projede ara…" value={text} onChange={(e) => setText(e.target.value)} sx={{ width: 200 }} />
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
          <TextField select size="small" label="Etiket" value={labelFilter} sx={{ minWidth: 140 }}
            onChange={(e) => setLabelFilter(e.target.value)}>
            <MenuItem value="">Tümü</MenuItem>
            {labelsQ.data?.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
          </TextField>
          <Chip label="Gecikenler" color={onlyOverdue ? "error" : "default"} variant={onlyOverdue ? "filled" : "outlined"}
            onClick={() => setOnlyOverdue(!onlyOverdue)} />
          <SavedFilters projectKey={key} current={filterState} onApply={applyFilter} />
        </Stack>
      )}

      {tab === 2 && (
        <Card variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Bilet</TableCell><TableCell>Atanan</TableCell><TableCell>Raporlayan</TableCell>
                <TableCell>Öncelik</TableCell><TableCell>Puan</TableCell><TableCell>Durum</TableCell><TableCell>Bitiş</TableCell>
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
                      <LabelChips labels={w.labels} />
                    </Stack>
                  </TableCell>
                  <TableCell><Person name={w.assigneeName} /></TableCell>
                  <TableCell><Person name={w.reporterName} /></TableCell>
                  <TableCell><PriorityText p={w.priority} /></TableCell>
                  <TableCell>{w.storyPoints ?? "—"}</TableCell>
                  <TableCell><StatusChip status={w.status} /></TableCell>
                  <TableCell><DueDate item={w} /></TableCell>
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
                count={boardItems.filter((w) => w.status === s.key).length}>
                {boardItems.filter((w) => w.status === s.key).map((w) => (
                  <BoardCard key={w.id} item={w} canDrag={w.assigneeId === user!.id} onOpen={() => setOpen(w.key)} />
                ))}
              </Column>
            ))}
          </Stack>
        </DndContext>
      )}

      {tab === 4 && (
        <Card variant="outlined" sx={{ p: 2 }}>
          {p.members.map((m) => (
            <Stack key={m.userId} direction="row" sx={{ alignItems: "center", py: 1 }}>
              <Box sx={{ flex: 1 }}><Person name={m.fullName} /></Box>
              <Typography variant="body2" color="text.secondary">{m.role === "Manager" ? "Proje yöneticisi" : "Üye"}</Typography>
            </Stack>
          ))}
        </Card>
      )}

      <WorkItemDialog itemKey={open} project={p} onOpenItem={setOpen} onClose={() => {
        setOpen(null);
        if (params.get("item")) { params.delete("item"); setParams(params, { replace: true }); }
      }} />
      {creating && <CreateDialog project={p} items={items.data ?? []} sprints={sprints.data ?? []} onClose={() => setCreating(false)} />}
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
      sx={{ p: 1.5, cursor: canDrag ? "grab" : "pointer", opacity: isDragging ? 0.7 : 1, "&:hover": { bgcolor: "action.hover" },
        borderLeft: isOverdue(item) ? "3px solid #f87168" : undefined }}>
      <Typography variant="body2" sx={{ mb: 1 }}>{item.title}</Typography>
      {(item.labels?.length ?? 0) > 0 && <Box sx={{ mb: 1 }}><LabelChips labels={item.labels} /></Box>}
      {item.dueDate && <Box sx={{ mb: 1 }}><DueDate item={item} short /></Box>}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <TypeIcon type={item.type} />
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{item.key}</Typography>
        {item.storyPoints != null && (
          <Box sx={{ px: 0.8, borderRadius: 2, bgcolor: "action.selected", fontSize: 11 }}>{item.storyPoints}</Box>
        )}
        {!canDrag && <LockIcon sx={{ fontSize: 14, color: "text.disabled" }} titleAccess="Sadece atanan kişi taşıyabilir" />}
        <Person name={item.assigneeName ? item.assigneeName.split(" ")[0] : null} />
      </Stack>
    </Card>
  );
}

function CreateDialog({ project, items, sprints, onClose }: { project: ProjectDetail; items: WorkItem[]; sprints: Sprint[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", type: "Task", description: "", priority: "Medium", assigneeId: "", parentId: "", startDate: "", dueDate: "", storyPoints: "", sprintId: "" });
  const [labels, setLabels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => api.post(`/api/projects/${project.key}/items`, {
      ...form,
      assigneeId: form.assigneeId || null,
      parentId: form.parentId || null,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      storyPoints: form.storyPoints ? Number(form.storyPoints) : null,
      sprintId: form.sprintId || null,
      labels,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items", project.key] });
      qc.invalidateQueries({ queryKey: ["sprints", project.key] });
      onClose();
    },
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
          <Stack direction="row" spacing={2}>
            <TextField select label="Story point" value={form.storyPoints} onChange={set("storyPoints")} sx={{ flex: 1 }}>
              <MenuItem value="">—</MenuItem>
              {[1, 2, 3, 5, 8, 13].map((n) => <MenuItem key={n} value={String(n)}>{n}</MenuItem>)}
            </TextField>
            <TextField select label="Sprint" value={form.sprintId} onChange={set("sprintId")} sx={{ flex: 1 }}>
              <MenuItem value="">Backlog</MenuItem>
              {sprints.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}{s.status === "active" ? " (aktif)" : ""}</MenuItem>)}
            </TextField>
          </Stack>
          <LabelsField projectKey={project.key} value={labels} onChange={setLabels} />
          <Stack direction="row" spacing={2}>
            <TextField type="date" label="Başlangıç tarihi" value={form.startDate} onChange={set("startDate")} sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="date" label="Bitiş tarihi" value={form.dueDate} onChange={set("dueDate")} sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" disabled={!form.title.trim() || create.isPending} onClick={() => create.mutate()}>Oluştur</Button>
      </DialogActions>
    </Dialog>
  );
}
