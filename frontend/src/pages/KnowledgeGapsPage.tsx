import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import RadarIcon from "@mui/icons-material/Radar";
import AutoIcon from "@mui/icons-material/AutoAwesome";
import QuestionIcon from "@mui/icons-material/HelpOutlined";
import TicketIcon from "@mui/icons-material/SupportAgentOutlined";
import { api, errorMessage, timeAgo, type KnowledgeGap, type KnowledgeGapsResponse } from "../api";

// Bilgi boşluğu radarı: asistanın cevaplayamadığı ve makalesi olmayan konular
export default function KnowledgeGapsPage() {
  const q = useQuery({
    queryKey: ["knowledgeGaps"],
    queryFn: async () => (await api.get<KnowledgeGapsResponse>("/api/insights/knowledge-gaps")).data,
  });
  const stats = q.data?.stats;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <RadarIcon color="primary" />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Bilgi boşluğu radarı</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Çalışanların asistana sorup cevap alamadığı konular ve makalesi olmadığı için ticket'a dönüşen sorunlar burada toplanır.
        Bir tıkla yerel yapay zekâ, ekibin geçmiş çözümlerinden makale taslağı yazar.
      </Typography>

      {stats && (
        <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: "wrap", rowGap: 2 }}>
          <Stat label="Asistana sorulan (60 gün)" value={stats.totalQuestions} />
          <Stat label="Cevaplanamayan" value={stats.unanswered} color="error.main" />
          <Stat label="Cevaplama oranı" value={`%${stats.answerRate}`} />
          <Stat label="Tespit edilen boşluk" value={q.data!.gaps.length} color="warning.main" />
        </Stack>
      )}

      {q.data && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          {q.data.mode === "semantic"
            ? "Analiz: anlamsal (yerel yapay zekâ ile ticket'ların bilgi bankasında karşılanıp karşılanmadığı kontrol edildi)"
            : "Analiz: güvenli mod (yapay zekâ servisine ulaşılamadı; sadece asistanın cevaplayamadığı sorulara dayanılıyor)"}
        </Typography>
      )}
      {q.error && <Alert severity="error">{errorMessage(q.error)}</Alert>}
      {q.isLoading && <CircularProgress />}
      {q.data?.gaps.length === 0 && <Alert severity="success">Şu an belirgin bir bilgi boşluğu yok. 🎉</Alert>}

      <Stack spacing={2}>
        {q.data?.gaps.map((g, i) => <GapCard key={g.topic + i} g={g} rank={i + 1} />)}
      </Stack>
    </Box>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <Card variant="outlined" sx={{ minWidth: 170 }}>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </CardContent>
    </Card>
  );
}

function GapCard({ g, rank }: { g: KnowledgeGap; rank: number }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const draft = useMutation({
    mutationFn: async () => (await api.post<{ id: string; aiGenerated: boolean }>("/api/insights/knowledge-gaps/draft",
      { topic: g.topic, questionIds: g.questionIds, ticketIds: g.ticketIds }, { timeout: 120000 })).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["knowledgeGaps"] });
      qc.invalidateQueries({ queryKey: ["articles"] });
      nav(`/kb?article=${r.id}${r.aiGenerated ? "&ai=1" : ""}`);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const heat = g.score >= 8 ? "error" : g.score >= 4 ? "warning" : "info";

  return (
    <Card variant="outlined" sx={{ borderLeft: 4, borderLeftColor: `${heat}.main` }}>
      <CardContent>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
              <Chip size="small" color={heat} label={`#${rank}`} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{g.topic}</Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ my: 1, flexWrap: "wrap", rowGap: 0.5 }}>
              {g.questionCount > 0 && <Chip size="small" icon={<QuestionIcon />} label={`${g.questionCount} cevapsız soru`} />}
              {g.ticketCount > 0 && <Chip size="small" icon={<TicketIcon />} label={`${g.ticketCount} ticket açıldı`} />}
              <Chip size="small" variant="outlined" label={`${g.affectedUsers} kişi`} />
              {g.supportHours > 0 && <Chip size="small" variant="outlined" label={`${g.supportHours} saat destek emeği`} />}
              {g.hasKnownFix && <Chip size="small" color="success" variant="outlined" label="Bilinen çözüm var" />}
              <Chip size="small" variant="outlined" label={`son: ${timeAgo(g.lastAt)}`} />
            </Stack>
            <Stack spacing={0.5}>
              {g.samples.map((s) => (
                <Typography key={s.id} variant="body2" color="text.secondary">
                  {s.kind === "question" ? "❓" : "🎫"} "{s.text}" <Typography component="span" variant="caption">— {s.userName}</Typography>
                  {s.resolution && <Typography component="span" variant="caption" color="success.main"> · çözüm: {s.resolution}</Typography>}
                </Typography>
              ))}
            </Stack>
            {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          </Box>
          <Stack spacing={1} sx={{ justifyContent: "center", minWidth: 220 }}>
            <Button variant="contained" startIcon={draft.isPending ? <CircularProgress size={16} color="inherit" /> : <AutoIcon />}
              disabled={draft.isPending} onClick={() => draft.mutate()}>
              {draft.isPending ? "Yapay zekâ yazıyor…" : "Makale taslağı yaz"}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
              {g.ticketCount > 0 ? `Yayınlanırsa bu konudaki ticket'lar azalır` : "Asistan bu soruları cevaplayabilir hale gelir"}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
