import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from "@mui/material";
import { useAuth } from "../auth";
import { api, CATEGORIES, errorMessage, type Article, type ArticleLite } from "../api";

export default function KnowledgePage() {
  const { user } = useAuth();
  const isManager = user?.role === "Manager" || user?.role === "Admin";
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState(isManager);
  const selected = params.get("article");
  const select = (id: string) => setParams({ article: id }, { replace: true });

  const list = useQuery({
    queryKey: ["articles", q, drafts],
    queryFn: async () => (await api.get<ArticleLite[]>("/api/kb/articles", { params: { q: q || undefined, drafts: drafts || undefined } })).data,
  });

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Bilgi bankası</Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: "center" }}>
        <TextField placeholder="Makalelerde ara…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 420, maxWidth: "100%" }} />
        {isManager && (
          <FormControlLabel control={<Switch checked={drafts} onChange={(e) => setDrafts(e.target.checked)} />} label="Taslakları göster" />
        )}
      </Stack>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: "flex-start" }}>
        <Stack spacing={1} sx={{ width: { md: 380 } }}>
          {list.data?.length === 0 && <Typography color="text.secondary">Makale bulunamadı.</Typography>}
          {list.data?.map((a) => (
            <Card key={a.id} variant="outlined" sx={{ borderColor: selected === a.id ? "primary.main" : undefined }}>
              <CardActionArea onClick={() => select(a.id)}>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.title}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ my: 0.5 }}>
                    <Chip size="small" label={a.category} />
                    {a.published === false && <Chip size="small" color="warning" label="Taslak" />}
                    {a.fromTicket && <Chip size="small" variant="outlined" label="Ticket'tan" />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{a.snippet}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
        {selected && <ArticleView id={selected} canEdit={isManager} />}
      </Stack>
    </Box>
  );
}

function ArticleView({ id, canEdit }: { id: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const article = useQuery({
    queryKey: ["article", id],
    queryFn: async () => (await api.get<Article>(`/api/kb/articles/${id}`)).data,
  });
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ title: "", body: "", category: "" });
  const [error, setError] = useState("");
  const a = article.data;
  useEffect(() => { if (a) { setF({ title: a.title, body: a.body, category: a.category }); setEditing(false); setError(""); } }, [a]);

  const done = () => { qc.invalidateQueries({ queryKey: ["articles"] }); qc.invalidateQueries({ queryKey: ["article", id] }); };
  const save = useMutation({
    mutationFn: () => api.put(`/api/kb/articles/${id}`, f),
    onSuccess: () => { setEditing(false); done(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const publish = useMutation({
    mutationFn: (p: boolean) => api.post(`/api/kb/articles/${id}/publish`, null, { params: { published: p } }),
    onSuccess: done,
    onError: (e) => setError(errorMessage(e)),
  });

  if (article.error) return <Alert severity="error" sx={{ flex: 1 }}>{errorMessage(article.error)}</Alert>;
  if (!a) return null;

  return (
    <Card variant="outlined" sx={{ flex: 1, width: "100%" }}>
      <CardContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {a.published === false && (
          <Alert severity="warning" sx={{ mb: 2 }}
            action={canEdit && <Button color="inherit" size="small" onClick={() => publish.mutate(true)}>Yayınla</Button>}>
            Bu makale taslak. Sadece yöneticiler görür; asistan da henüz kullanmaz.
          </Alert>
        )}
        {editing ? (
          <Stack spacing={2}>
            <TextField label="Başlık" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <TextField select label="Kategori" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {[...new Set([...CATEGORIES, f.category])].filter(Boolean).map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <TextField label="İçerik" multiline minRows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={save.isPending || !f.title.trim()} onClick={() => save.mutate()}>Kaydet</Button>
              <Button onClick={() => { setEditing(false); setF({ title: a.title, body: a.body, category: a.category }); }}>Vazgeç</Button>
            </Stack>
          </Stack>
        ) : (
          <>
            <Stack direction="row" sx={{ alignItems: "flex-start" }}>
              <Typography variant="h6" sx={{ flex: 1 }}>{a.title}</Typography>
              {canEdit && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setEditing(true)}>Düzenle</Button>
                  {a.published !== false && <Button size="small" color="warning" onClick={() => publish.mutate(false)}>Yayından kaldır</Button>}
                </Stack>
              )}
            </Stack>
            <Chip size="small" label={a.category} sx={{ my: 1 }} />
            <Typography sx={{ whiteSpace: "pre-wrap" }}>{a.body}</Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
