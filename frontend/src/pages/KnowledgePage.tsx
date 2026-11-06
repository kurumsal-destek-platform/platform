import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Card, CardActionArea, CardContent, Chip, Stack, TextField, Typography } from "@mui/material";
import { api, type Article, type ArticleLite } from "../api";

export default function KnowledgePage() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["articles", q],
    queryFn: async () => (await api.get<ArticleLite[]>("/api/kb/articles", { params: { q: q || undefined } })).data,
  });
  const article = useQuery({
    queryKey: ["article", selected],
    queryFn: async () => (await api.get<Article>(`/api/kb/articles/${selected}`)).data,
    enabled: !!selected,
  });

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Bilgi bankası</Typography>
      <TextField placeholder="Makalelerde ara…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 2, width: 420, maxWidth: "100%" }} />
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: "flex-start" }}>
        <Stack spacing={1} sx={{ width: { md: 380 } }}>
          {list.data?.map((a) => (
            <Card key={a.id} variant="outlined" sx={{ borderColor: selected === a.id ? "primary.main" : undefined }}>
              <CardActionArea onClick={() => setSelected(a.id)}>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.title}</Typography>
                  <Chip size="small" label={a.category} sx={{ my: 0.5 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{a.snippet}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
        {article.data && (
          <Card variant="outlined" sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6">{article.data.title}</Typography>
              <Chip size="small" label={article.data.category} sx={{ my: 1 }} />
              <Typography sx={{ whiteSpace: "pre-wrap" }}>{article.data.body}</Typography>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
}
