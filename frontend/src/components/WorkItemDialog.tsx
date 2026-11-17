import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import LockIcon from "@mui/icons-material/LockOutlined";
import {
  api, describeActivity, errorMessage, PRIORITIES, STATUSES, timeAgo,
  type Activity, type CommentT, type ProjectDetail, type WorkItemDetail,
} from "../api";
import { DueDate, LabelChips, Person, PriorityText, TypeIcon } from "./common";
import MentionInput, { MentionText } from "./MentionInput";
import Attachments from "./Attachments";
import { LabelsField, LinksSection, SubtasksSection } from "./ItemSections";

// Görev detayı. Atanan kişi düzenler, diğer üyeler salt okunur görür ve yorum yazar,
// proje yöneticisi atama yapar. Asıl kural backend'de; burada sadece arayüz uyarlanır.
export default function WorkItemDialog({ itemKey, project, onClose, onOpenItem }: {
  itemKey: string | null; project: ProjectDetail; onClose: () => void; onOpenItem?: (key: string) => void;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState(0);

  const detail = useQuery({
    queryKey: ["item", itemKey],
    queryFn: async () => (await api.get<WorkItemDetail>(`/api/items/${itemKey}`)).data,
    enabled: !!itemKey,
  });
  const comments = useQuery({
    queryKey: ["comments", itemKey],
    queryFn: async () => (await api.get<CommentT[]>(`/api/items/${itemKey}/comments`)).data,
    enabled: !!itemKey,
  });

  const activity = useQuery({
    queryKey: ["activity", itemKey],
    queryFn: async () => (await api.get<Activity[]>(`/api/items/${itemKey}/activity`)).data,
    enabled: !!itemKey && tab === 1,
  });

  const item = detail.data?.item;
  const perms = detail.data?.permissions;

  useEffect(() => {
    if (item) { setTitle(item.title); setDescription(item.description); }
    setError("");
    setTab(0);
  }, [item?.id]); // eslint-disable-line

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["labels", project.key] });
    qc.invalidateQueries({ queryKey: ["item", itemKey] });
    qc.invalidateQueries({ queryKey: ["activity", itemKey] });
    qc.invalidateQueries({ queryKey: ["sprints", project.key] });
    qc.invalidateQueries({ queryKey: ["items", project.key] });
    qc.invalidateQueries({ queryKey: ["myItems"] });
  };
  const onErr = (e: unknown) => setError(errorMessage(e));

  const save = useMutation({
    mutationFn: (body: object) => api.patch(`/api/items/${itemKey}`, body),
    onSuccess: refresh, onError: onErr,
  });
  const status = useMutation({
    mutationFn: (s: string) => api.patch(`/api/items/${itemKey}/status`, { status: s }),
    onSuccess: refresh, onError: onErr,
  });
  const assign = useMutation({
    mutationFn: (id: string) => api.put(`/api/items/${itemKey}/assignee`, { assigneeId: id || null }),
    onSuccess: refresh, onError: onErr,
  });
  const addComment = useMutation({
    mutationFn: () => api.post(`/api/items/${itemKey}/comments`, { body: comment }),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["comments", itemKey] });
      qc.invalidateQueries({ queryKey: ["activity", itemKey] });
    },
    onError: onErr,
  });

  return (
    <Dialog open={!!itemKey} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {item && <TypeIcon type={item.type} />}
        <Typography color="text.secondary">{itemKey}</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {!item ? <Typography>Yükleniyor…</Typography> : (
          <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
            {/* Sol: içerik */}
            <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
              {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
              {!perms?.canEdit && (
                <Alert icon={<LockIcon />} severity="info">
                  Bu görevi sadece atanan kişi düzenleyebilir. Yorum yazabilirsiniz.
                </Alert>
              )}
              {perms?.canEdit ? (
                <>
                  <TextField label="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
                  <TextField label="Açıklama" value={description} onChange={(e) => setDescription(e.target.value)}
                    fullWidth multiline minRows={3} />
                  <Box>
                    <Button variant="contained" disabled={save.isPending}
                      onClick={() => save.mutate({ title, description })}>Kaydet</Button>
                  </Box>
                </>
              ) : (
                <>
                  <Typography variant="h6">{item.title}</Typography>
                  <Typography color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                    {item.description || "Açıklama yok."}
                  </Typography>
                </>
              )}

              <SubtasksSection itemKey={item.key} children={detail.data!.children} project={project}
                canAdd={!!(perms?.canEdit || perms?.canAssign)} onOpenItem={onOpenItem} onChanged={refresh} />
              <LinksSection itemKey={item.key} projectKey={project.key}
                canEdit={!!(perms?.canEdit || perms?.canAssign)} onOpenItem={onOpenItem} />
              <Attachments basePath={`/api/items/${item.key}`} />

              <Divider />
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36 }}>
                <Tab label="Yorumlar" sx={{ minHeight: 36 }} />
                <Tab label="Geçmiş" sx={{ minHeight: 36 }} />
              </Tabs>
              {tab === 0 && (
                <>
                  {comments.data?.length === 0 && <Typography variant="body2" color="text.secondary">Henüz yorum yok.</Typography>}
                  {comments.data?.map((c) => (
                    <Box key={c.id} sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {c.authorName} · {timeAgo(c.createdAt)}
                      </Typography>
                      <MentionText text={c.body} />
                    </Box>
                  ))}
                  <Stack direction="row" spacing={1}>
                    <MentionInput value={comment} onChange={setComment} users={project.members}
                      placeholder="Yorum ekle… (birinden bahsetmek için @ yazın)"
                      onSubmit={() => { if (!addComment.isPending) addComment.mutate(); }} />
                    <Button variant="outlined" disabled={!comment.trim() || addComment.isPending}
                      onClick={() => addComment.mutate()}>Gönder</Button>
                  </Stack>
                </>
              )}
              {tab === 1 && (
                <Stack spacing={1}>
                  {activity.data?.length === 0 && <Typography variant="body2" color="text.secondary">Kayıt yok.</Typography>}
                  {activity.data?.map((a) => (
                    <Box key={a.id}>
                      <Typography variant="body2"><b>{a.userName}</b> {describeActivity(a)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(a.at).toLocaleString("tr-TR")} · {timeAgo(a.at)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Stack>

            {/* Sağ: alanlar */}
            <Stack spacing={2} sx={{ width: { md: 260 } }}>
              <TextField select size="small" label="Durum" value={item.status} disabled={!perms?.canEdit}
                onChange={(e) => status.mutate(e.target.value)}>
                {STATUSES.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
              </TextField>
              {perms?.canAssign ? (
                <TextField select size="small" label="Atanan" value={item.assigneeId ?? ""}
                  onChange={(e) => assign.mutate(e.target.value)}>
                  <MenuItem value="">Atanmadı</MenuItem>
                  {project.members.map((m) => <MenuItem key={m.userId} value={m.userId}>{m.fullName}</MenuItem>)}
                </TextField>
              ) : (
                <Box><Typography variant="caption" color="text.secondary">Atanan</Typography><Person name={item.assigneeName} /></Box>
              )}
              {perms?.canEdit ? (
                <TextField select size="small" label="Öncelik" value={item.priority}
                  onChange={(e) => save.mutate({ priority: e.target.value })}>
                  {Object.entries(PRIORITIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                </TextField>
              ) : (
                <Box><Typography variant="caption" color="text.secondary">Öncelik</Typography><PriorityText p={item.priority} /></Box>
              )}
              <Box><Typography variant="caption" color="text.secondary">Raporlayan</Typography><Person name={item.reporterName} /></Box>
              {perms?.canEdit ? (
                <LabelsField projectKey={project.key} value={item.labels ?? []}
                  onChange={(labels) => save.mutate({ labels })} />
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary">Etiketler</Typography>
                  {item.labels?.length ? <LabelChips labels={item.labels} max={10} /> : <Typography variant="body2">—</Typography>}
                </Box>
              )}
              {perms?.canEdit ? (
                <>
                  <TextField type="date" size="small" label="Başlangıç tarihi" value={item.startDate?.slice(0, 10) ?? ""}
                    onChange={(e) => e.target.value && save.mutate({ startDate: new Date(e.target.value).toISOString() })}
                    slotProps={{ inputLabel: { shrink: true } }} />
                  <TextField type="date" size="small" label="Bitiş tarihi" value={item.dueDate?.slice(0, 10) ?? ""}
                    onChange={(e) => e.target.value && save.mutate({ dueDate: new Date(e.target.value).toISOString() })}
                    slotProps={{ inputLabel: { shrink: true } }} />
                </>
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary">Bitiş tarihi</Typography>
                  <DueDate item={item} />
                </Box>
              )}
              {perms?.canEdit ? (
                <TextField select size="small" label="Story point" value={item.storyPoints ?? ""}
                  onChange={(e) => save.mutate({ storyPoints: Number(e.target.value) })}>
                  {[1, 2, 3, 5, 8, 13].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                </TextField>
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary">Story point</Typography>
                  <Typography variant="body2">{item.storyPoints ?? "—"}</Typography>
                </Box>
              )}
              <Box>
                <Typography variant="caption" color="text.secondary">Sprint</Typography>
                <Typography variant="body2">{detail.data?.sprint?.name ?? "Backlog"}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Tür</Typography>
                <Typography variant="body2">{item.type}</Typography>
              </Box>
            </Stack>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
