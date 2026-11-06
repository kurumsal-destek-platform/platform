import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardContent, Collapse, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import LightbulbIcon from "@mui/icons-material/LightbulbOutlined";
import { api, CATEGORIES, errorMessage, PRIORITIES, type Article, type ArticleLite } from "../api";

function useDebounce<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Ticket formu + "Önce şunlara bakın" self-servis paneli
export default function NewTicketPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Diğer");
  const [priority, setPriority] = useState("Medium");
  const [error, setError] = useState("");
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  const q = useDebounce(`${title} ${description}`.trim(), 500);
  const suggestions = useQuery({
    queryKey: ["suggest", q],
    queryFn: async () => (await api.get<ArticleLite[]>("/api/kb/suggest", { params: { q } })).data,
    enabled: q.length >= 5,
  });
  const article = useQuery({
    queryKey: ["article", openArticle],
    queryFn: async () => (await api.get<Article>(`/api/kb/articles/${openArticle}`)).data,
    enabled: !!openArticle,
  });

  const create = useMutation({
    mutationFn: () => api.post("/api/tickets", { title, description, category, priority }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["myTickets"] }); nav("/tickets"); },
    onError: (e) => setError(errorMessage(e)),
  });

  const markSolved = async (articleId: string) => {
    await api.post("/api/kb/feedback", { articleId, solved: true });
    setSolved(true);
  };

  if (solved)
    return (
      <Box sx={{ maxWidth: 600 }}>
        <Alert severity="success" sx={{ mb: 2 }}>
          Harika! Sorununuz bilgi bankası ile çözüldü, ticket açılmadı. 🎉
        </Alert>
        <Button variant="contained" onClick={() => nav("/")}>Ana sayfaya dön</Button>
      </Box>
    );

  return (
    <Stack direction={{ xs: "column", lg: "row" }} spacing={3} sx={{ alignItems: "flex-start" }}>
      <Card variant="outlined" sx={{ flex: 1, width: "100%" }}>
        <CardContent>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Yeni ticket</Typography>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Sorununuzu kısaca yazın" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <TextField label="Açıklama" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={4} />
            <Stack direction="row" spacing={2}>
              <TextField select label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ flex: 1 }}>
                {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
              <TextField select label="Öncelik" value={priority} onChange={(e) => setPriority(e.target.value)} sx={{ flex: 1 }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
            </Stack>
            <Box>
              <Button variant="contained" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
                Ticket aç
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ width: { xs: "100%", lg: 380 }, borderColor: "primary.main" }}>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
            <LightbulbIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Önce şunlara bakın</Typography>
          </Stack>
          {q.length < 5 && <Typography variant="body2" color="text.secondary">Sorununuzu yazdıkça benzer çözümler burada görünür.</Typography>}
          {q.length >= 5 && suggestions.data?.length === 0 && (
            <Typography variant="body2" color="text.secondary">Benzer bir çözüm bulunamadı.</Typography>
          )}
          <Stack spacing={1}>
            {suggestions.data?.map((a) => (
              <Box key={a.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, cursor: "pointer" }}
                  onClick={() => setOpenArticle(openArticle === a.id ? null : a.id)}>
                  {a.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">{a.category}</Typography>
                <Collapse in={openArticle === a.id}>
                  <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>{article.data?.body}</Typography>
                  <Button size="small" variant="contained" color="success" sx={{ mt: 1 }} onClick={() => markSolved(a.id)}>
                    Bu çözdü
                  </Button>
                </Collapse>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
