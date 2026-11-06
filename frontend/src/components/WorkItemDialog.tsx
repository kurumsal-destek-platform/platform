import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import LockIcon from "@mui/icons-material/LockOutlined";
import {
  api, errorMessage, PRIORITIES, STATUSES, type CommentT, type ProjectDetail, type WorkItemDetail,
} from "../api";
import { Person, PriorityText, StatusChip, TypeIcon } from "./common";

// Görev detayı. Atanan kişi düzenler, diğer üyeler salt okunur görür ve yorum yazar,
// proje yöneticisi atama yapar. Asıl kural backend'de; burada sadece arayüz uyarlanır.
export default function WorkItemDialog({ itemKey, project, onClose }: {
  itemKey: string | null; project: ProjectDetail; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

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

  const item = detail.data?.item;
  const perms = detail.data?.permissions;

  useEffect(() => {
    if (item) { setTitle(item.title); setDescription(item.description); }
    setError("");
  }, [item?.id]); // eslint-disable-line

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["item", itemKey] });
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
    onSuccess: () => { setComment(""); qc.invalidateQueries({ queryKey: ["comments", itemKey] }); },
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

              {detail.data!.children.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Alt öğeler</Typography>
                  {detail.data!.children.map((c) => (
                    <Stack key={c.id} direction="row" spacing={1} sx={{ alignItems: "center", py: 0.5 }}>
                      <TypeIcon type={c.type} /><Typography variant="body2" color="primary">{c.key}</Typography>
                      <Typography variant="body2" sx={{ flex: 1 }}>{c.title}</Typography>
                      <StatusChip status={c.status} />
                    </Stack>
                  ))}
                </Box>
              )}

              <Divider />
              <Typography variant="subtitle2">Yorumlar</Typography>
              {comments.data?.map((c) => (
                <Box key={c.id} sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {c.authorName} · {new Date(c.createdAt).toLocaleString("tr-TR")}
                  </Typography>
                  <Typography variant="body2">{c.body}</Typography>
                </Box>
              ))}
              <Stack direction="row" spacing={1}>
                <TextField size="small" placeholder="Yorum ekle…" value={comment}
                  onChange={(e) => setComment(e.target.value)} fullWidth />
                <Button variant="outlined" disabled={!comment.trim() || addComment.isPending}
                  onClick={() => addComment.mutate()}>Gönder</Button>
              </Stack>
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
              <Box>
                <Typography variant="caption" color="text.secondary">Bitiş tarihi</Typography>
                <Typography variant="body2">{item.dueDate ? new Date(item.dueDate).toLocaleDateString("tr-TR") : "—"}</Typography>
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
