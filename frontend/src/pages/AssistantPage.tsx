import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Box, Button, Card, Chip, CircularProgress, Stack, TextField, Tooltip, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AiIcon from "@mui/icons-material/AutoAwesome";
import RestartIcon from "@mui/icons-material/RestartAltOutlined";
import ArticleIcon from "@mui/icons-material/ArticleOutlined";
import { celebrate } from "../delight";
import { api, errorMessage, type AskResponse } from "../api";
import { useAuth } from "../auth";
import { buildHistory, transcript, type ChatMsg } from "../helpers";
import SourceDialog from "../components/SourceDialog";

interface Msg extends ChatMsg { res?: AskResponse; rated?: "yes" | "no" }

const WELCOME: Msg = {
  role: "bot",
  text: "Merhaba! Şirket içi destek sorularınızı firmanızın bilgi bankasından yanıtlarım. Cevabı beğenmezseniz takip sorusu sorabilirsiniz, örneğin önce \"VPN bağlanmıyor\", sonra \"peki Mac'te?\"",
};
const EXAMPLES = ["VPN bağlanmıyor ne yapmalıyım?", "Şifremi unuttum", "Yazıcı çıktı vermiyor"];

// Sohbet, sayfadan çıkıp dönünce kaybolmasın (sekme kapanınca silinir)
const storeKey = (uid?: string) => `kdp_chat_${uid ?? "anon"}`;
const load = (uid?: string): Msg[] => {
  try { const s = sessionStorage.getItem(storeKey(uid)); return s ? JSON.parse(s) : [WELCOME]; } catch { return [WELCOME]; }
};
const save = (uid: string | undefined, msgs: Msg[]) => { try { sessionStorage.setItem(storeKey(uid), JSON.stringify(msgs.slice(-40))); } catch { /* yer yok */ } };

// RAG asistanı: firmanın bilgi bankasından kaynaklı cevap verir, bilmediğini söyler; sohbet bağlamını korur.
export default function AssistantPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>(() => load(user?.id));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<{ id: string; title: string; snippet?: string | null } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); save(user?.id, msgs); }, [msgs, user?.id]);

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput("");
    const history = buildHistory(msgs);
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const r = (await api.post<AskResponse>("/api/assistant/ask", { question, history }, { timeout: 60000 })).data;
      setMsgs((m) => [...m, {
        role: "bot", res: r, question, answered: r.answered,
        text: r.answered ? r.answer ?? "" : r.message ?? "Bu konuda bilgim yok, ticket açabilirsiniz.",
      }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "bot", text: `Hata: ${errorMessage(e)}` }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const rate = (i: number, solved: boolean) => {
    const m = msgs[i];
    api.post("/api/kb/feedback", {
      articleId: m.res?.sources?.[0]?.source_id ?? null, solved, source: "assistant", question: m.question,
    }).catch(() => {});
    setMsgs((all) => all.map((x, j) => (j === i ? { ...x, rated: solved ? "yes" : "no" } : x)));
    if (solved) celebrate();
  };

  // Ticket'a geçerken sohbet açıklamaya eklenir: destek ekibi aynı soruları tekrar sormaz
  const openTicket = (question?: string) => nav("/tickets/new", {
    state: { title: question ?? msgs.filter((m) => m.role === "user").at(-1)?.text ?? "", description: transcript(msgs) },
  });

  const reset = () => { setMsgs([WELCOME]); setInput(""); inputRef.current?.focus(); };
  const started = msgs.length > 1;

  return (
    <Box sx={{ maxWidth: 820, display: "flex", flexDirection: "column", height: { xs: "calc(100dvh - 104px)", md: "calc(100vh - 120px)" } }}>
      <Stack direction="row" sx={{ alignItems: "center", mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Asistan</Typography>
        {started && <Button size="small" startIcon={<RestartIcon />} onClick={reset} disabled={busy}>Yeni sohbet</Button>}
      </Stack>
      <Card variant="outlined" sx={{ flex: 1, overflowY: "auto", p: { xs: 1.5, sm: 2 } }} aria-live="polite">
        <Stack spacing={2}>
          {msgs.map((m, i) => (
            <Stack key={i} direction="row" spacing={1.5} sx={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              {m.role === "bot" && <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32, display: { xs: "none", sm: "flex" } }}><AiIcon fontSize="small" /></Avatar>}
              <Box sx={{
                maxWidth: { xs: "88%", sm: "75%" }, p: 1.5, borderRadius: 2,
                bgcolor: m.role === "user" ? "primary.dark" : "action.hover",
                color: m.role === "user" ? "primary.contrastText" : "text.primary",
              }}>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{m.text}</Typography>

                {m.res?.answered && m.res.sources && m.res.sources.length > 0 && (
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ width: "100%" }}>Kaynaklar (görmek için tıklayın):</Typography>
                    {m.res.sources.map((s) => (
                      <Tooltip key={s.source_id} title="Kaynağı göster">
                        <Chip size="small" icon={<ArticleIcon />} label={s.title} variant="outlined"
                          onClick={() => setSource({ id: s.source_id, title: s.title, snippet: s.snippet ?? s.text })} />
                      </Tooltip>
                    ))}
                  </Stack>
                )}

                {m.res?.answered && !m.rated && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">İşe yaradı mı?</Typography>
                    <Button size="small" variant="outlined" color="success" onClick={() => rate(i, true)}>👍 Evet, çözüldü</Button>
                    <Button size="small" onClick={() => rate(i, false)}>👎 Olmadı</Button>
                  </Stack>
                )}
                {m.rated === "yes" && <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 1 }}>Harika, ticket açmanıza gerek kalmadı. 🎉</Typography>}
                {m.rated === "no" && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                      Geri bildiriminiz kaydedildi. Sorunuzu biraz daha açabilir ya da ticket açabilirsiniz.
                    </Typography>
                    <Button size="small" variant="outlined" onClick={() => openTicket(m.question)}>Ticket aç (sohbet eklenir)</Button>
                  </Box>
                )}
                {m.res && !m.res.answered && (
                  <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => openTicket(m.question)}>Ticket aç (sohbet eklenir)</Button>
                )}
              </Box>
            </Stack>
          ))}
          {!started && (
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, pl: { sm: 6 } }}>
              {EXAMPLES.map((e) => <Chip key={e} label={e} variant="outlined" onClick={() => send(e)} />)}
            </Stack>
          )}
          {busy && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", pl: { sm: 6 } }}>
              <CircularProgress size={18} />
              <Typography variant="caption" color="text.secondary">Bilgi bankasında arıyor…</Typography>
            </Stack>
          )}
          <div ref={end} />
        </Stack>
      </Card>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <TextField fullWidth placeholder={started ? "Takip sorusu ya da yeni bir soru yazın…" : "Sorunuzu yazın…"} value={input}
          inputRef={inputRef} autoFocus onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={busy}
          slotProps={{ htmlInput: { "aria-label": "Asistana soru" } }} />
        <Button variant="contained" onClick={() => send()} disabled={busy || !input.trim()} aria-label="Gönder"><SendIcon /></Button>
      </Stack>
      <SourceDialog source={source} onClose={() => setSource(null)} />
    </Box>
  );
}
