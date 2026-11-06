import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Box, Button, Card, Chip, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AiIcon from "@mui/icons-material/AutoAwesome";
import { api, errorMessage, type AskResponse } from "../api";

interface Msg { role: "user" | "bot"; text: string; res?: AskResponse; question?: string }

// RAG asistanı: firmanın bilgi bankasından kaynaklı cevap verir, alan dışı soruyu reddeder.
export default function AssistantPage() {
  const nav = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Merhaba! Şirket içi destek sorularınızı yanıtlayabilirim. Örneğin: \"VPN bağlanmıyor ne yapmalıyım?\"" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
    useEffect(() => {
        end.current?.scrollIntoView({ behavior: "smooth" });
    }, [msgs]);

  const send = async () => {
    const question = input.trim();
    if (!question) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const r = (await api.post<AskResponse>("/api/assistant/ask", { question })).data;
      setMsgs((m) => [...m, {
        role: "bot", res: r, question,
        text: r.answered ? r.answer ?? "" : r.message ?? "Bu konuda bilgim yok, ticket açabilirsiniz.",
      }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "bot", text: `Hata: ${errorMessage(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 820, display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Asistan</Typography>
      <Card variant="outlined" sx={{ flex: 1, overflowY: "auto", p: 2 }}>
        <Stack spacing={2}>
          {msgs.map((m, i) => (
            <Stack key={i} direction="row" spacing={1.5} sx={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              {m.role === "bot" && <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32 }}><AiIcon fontSize="small" /></Avatar>}
              <Box sx={{
                maxWidth: "75%", p: 1.5, borderRadius: 2,
                bgcolor: m.role === "user" ? "primary.dark" : "action.hover",
              }}>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{m.text}</Typography>
                {m.res?.answered && m.res.sources && m.res.sources.length > 0 && (
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ width: "100%" }}>Kaynaklar:</Typography>
                    {m.res.sources.map((s) => <Chip key={s.source_id} size="small" label={s.title} onClick={() => nav("/kb")} />)}
                  </Stack>
                )}
                {m.res && !m.res.answered && (
                  <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => nav("/tickets/new")}>
                    Ticket aç
                  </Button>
                )}
              </Box>
            </Stack>
          ))}
          {busy && <CircularProgress size={22} />}
          <div ref={end} />
        </Stack>
      </Card>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <TextField fullWidth placeholder="Sorunuzu yazın…" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }} disabled={busy} />
        <Button variant="contained" onClick={send} disabled={busy || !input.trim()}><SendIcon /></Button>
      </Stack>
    </Box>
  );
}
