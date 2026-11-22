import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircularProgress,
  Alert, Box, Button, Card, CardContent, Chip, Collapse, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import LightbulbIcon from "@mui/icons-material/LightbulbOutlined";
import AttachIcon from "@mui/icons-material/AttachFile";
import CampaignIcon from "@mui/icons-material/CampaignOutlined";
import AutoIcon from "@mui/icons-material/AutoFixHighOutlined";
import SolveWizard from "../components/SolveWizard";
import ScreenshotIcon from "@mui/icons-material/ScreenshotMonitorOutlined";
import { celebrate } from "../delight";
import { api, CATEGORIES, errorMessage, formatSize, PRIORITIES, type Article, type ArticleLite, type IncidentMatch } from "../api";
import MentionField from "../components/MentionField";
import { ExpertsButton } from "../components/ExpertsDialog";

function useDebounce<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Ticket formu + "Önce şunlara bakın" self-servis paneli
export default function NewTicketPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  // Asistandan gelindiyse: son soru başlığa, sohbet açıklamaya
  const fromChat = (useLocation().state ?? null) as { title?: string; description?: string } | null;
  const [title, setTitle] = useState(fromChat?.title?.slice(0, 200) ?? "");
  const [description, setDescription] = useState(fromChat?.description ?? "");
  const [mentions, setMentions] = useState<string[]>([]);
  const [category, setCategory] = useState("Diğer");
  const [priority, setPriority] = useState("Medium");
  const [error, setError] = useState("");
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [wizard, setWizard] = useState<string | null>(null);      // sihirbazdaki makale
  const [tried, setTried] = useState<string | null>(null);        // sihirbaz başarısız: denenen adımlar ticket'a eklendi
  const [solvedSteps, setSolvedSteps] = useState<number | null>(null);
  const [shot, setShot] = useState<{ url: string; status: "reading" | "ok" | "fail"; title?: string; codes?: string[]; text?: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  // 📸 Ekran görüntüsünden ticket: görüntü yerel olarak okunur, hata mesajı başlığa yazılır
  const readScreenshot = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setFiles((f) => [...f, file]);   // görüntü ticket'a da eklensin
    setShot({ url: URL.createObjectURL(file), status: "reading" });
    try {
      const fd = new FormData();
      fd.append("file", file, file.name || "ekran-goruntusu.png");
      const r = (await api.post<{ title: string; codes: string[]; text: string }>("/api/ocr", fd, { timeout: 45000 })).data;
      if (!r.title) { setShot((s) => s && { ...s, status: "fail" }); return; }
      setShot((s) => s && { ...s, status: "ok", title: r.title, codes: r.codes, text: r.text });
      setTitle((t) => t.trim() || r.title);
      setDescription((d) => [d.trim(), `Ekrandaki hata: ${r.title}${r.codes.length ? ` (kod: ${r.codes.join(", ")})` : ""}`].filter(Boolean).join("\n\n"));
    } catch {
      setShot((s) => s && { ...s, status: "fail" });
    }
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); readScreenshot(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = useDebounce(`${title} ${description}`.trim(), 500);
  const suggestions = useQuery({
    queryKey: ["suggest", q],
    queryFn: async () => (await api.get<ArticleLite[]>("/api/kb/suggest", { params: { q } })).data,
    enabled: q.length >= 5,
  });
  // Ekran görüntüsü okunduysa ve kategori seçilmediyse: en uygun makalenin kategorisini öner
  useEffect(() => {
    const top = suggestions.data?.[0];
    if (shot?.status === "ok" && top && category === "Diğer") setCategory(top.category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot?.status, suggestions.data]);

  // Bu sorun zaten biliniyor mu? (aktif büyük olay ya da son 24 saatte benzer ticket'lar)
  const match = useQuery({
    queryKey: ["incidentMatch", q],
    queryFn: async () => (await api.get<IncidentMatch>("/api/incidents/match", { params: { title, description } })).data,
    enabled: q.length >= 5,
  });
  const [joined, setJoined] = useState<string | null>(null);
  const join = useMutation({
    mutationFn: async (incidentId: string) =>
      api.post("/api/tickets", { title: title || "Ben de etkileniyorum", description, category, priority, incidentId }),
    onSuccess: (_, incidentId) => { qc.invalidateQueries({ queryKey: ["myTickets"] }); setJoined(incidentId); },
    onError: (e) => setError(errorMessage(e)),
  });

  const article = useQuery({
    queryKey: ["article", openArticle],
    queryFn: async () => (await api.get<Article>(`/api/kb/articles/${openArticle}`)).data,
    enabled: !!openArticle,
  });

  const create = useMutation({
    mutationFn: async () => {
      const t = (await api.post<{ id: string }>("/api/tickets", { title, description, category, priority, mentionedUserIds: mentions })).data;
      // Seçilen dosyaları ticket'a yükle. Ticket açıldıktan sonra bir dosya yüklenemezse ticket'ı yine de aç
      // (aksi halde kullanıcı tekrar "Ticket aç"a basıp aynı ticket'tan iki tane oluşturur); ekler ticket penceresinden yeniden eklenebilir.
      let failed = 0;
      for (const f of files) {
        const form = new FormData();
        form.append("file", f);
        try { await api.post(`/api/tickets/${t.id}/attachments`, form, { timeout: 600000 }); } catch { failed++; }
      }
      return { id: t.id, failed };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["myTickets"] });
      nav(r.failed ? `/tickets?open=${r.id}` : "/tickets");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const markSolved = async (articleId: string) => {
    await api.post("/api/kb/feedback", { articleId, solved: true, source: "article" });
    setSolved(true);
    celebrate();
  };
  const wizardArticle = useQuery({
    queryKey: ["article", wizard],
    queryFn: async () => (await api.get<Article>(`/api/kb/articles/${wizard}`)).data,
    enabled: !!wizard,
  });
  const wizardSolved = async (steps: number) => {
    await api.post("/api/kb/feedback", { articleId: wizard, solved: true, source: "wizard", stepsTried: steps });
    setSolvedSteps(steps);
    setSolved(true);
    celebrate("big");
  };
  const wizardEscalate = async (steps: string[]) => {
    await api.post("/api/kb/feedback", { articleId: wizard, solved: false, source: "wizard", stepsTried: steps.length });
    const note = `\n\n— Çözüm sihirbazında denenen adımlar (${wizardArticle.data?.title}) —\n${steps.map((s, i) => `✗ ${i + 1}) ${s}`).join("\n")}`;
    setDescription((d) => (d.trim() + note).trim());
    if (!title.trim() && wizardArticle.data) setTitle(wizardArticle.data.title);
    if (wizardArticle.data) setCategory(wizardArticle.data.category);
    setTried(wizardArticle.data?.title ?? "");
    setWizard(null);
  };

  if (joined)
    return (
      <Box sx={{ maxWidth: 600 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Etkilenenler listesine eklendiniz. Ekip bu sorun üzerinde çalışıyor; çözüldüğünde size otomatik bildirim gelecek.
          Ayrıca bir şey yapmanıza gerek yok.
        </Alert>
        <Button variant="contained" onClick={() => nav("/tickets")}>Taleplerime git</Button>
      </Box>
    );

  if (solved)
    return (
      <Box sx={{ maxWidth: 600 }}>
        <Alert severity="success" sx={{ mb: 2 }}>
          Harika! Sorununuz {solvedSteps ? `${solvedSteps}. adımda` : "bilgi bankası ile"} çözüldü, ticket açmanıza gerek kalmadı. 🎉
          <Typography variant="body2" sx={{ mt: 0.5 }}>Destek ekibinin yanıtını beklemek yerine birkaç dakikada işinize döndünüz.</Typography>
        </Alert>
        <Button variant="contained" onClick={() => nav("/")}>Ana sayfaya dön</Button>
      </Box>
    );

  return (
    <Stack direction={{ xs: "column", lg: "row" }} spacing={3} sx={{ alignItems: "flex-start" }}>
      <Card variant="outlined" sx={{ flex: 1, width: "100%" }}>
        <CardContent>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Yeni ticket</Typography>
          {fromChat?.description && (
            <Alert severity="info" sx={{ mb: 2 }}>Asistanla yazışmanız açıklamaya eklendi; destek ekibi aynı şeyleri tekrar sormayacak.</Alert>
          )}
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/")); if (f) readScreenshot(f); }}
              sx={{ p: 1.5, borderRadius: 2, border: "2px dashed", borderColor: dragging ? "primary.main" : "divider",
                bgcolor: dragging ? "action.hover" : "transparent", transition: "all .15s" }}>
              {!shot ? (
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <ScreenshotIcon color="primary" />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Hata ekranının görüntüsünü yapıştırın (Ctrl+V) ya da buraya sürükleyin</Typography>
                    <Typography variant="caption" color="text.secondary">Hata mesajını sizin yerinize okuruz; görüntü şirket dışına çıkmaz.</Typography>
                  </Box>
                  <Button component="label" size="small">Seç
                    <input hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) readScreenshot(f); e.target.value = ""; }} />
                  </Button>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <Box component="img" src={shot.url} alt="Ekran görüntüsü" sx={{ width: 96, height: 60, objectFit: "cover", borderRadius: 1, border: 1, borderColor: "divider" }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {shot.status === "reading" && <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><CircularProgress size={16} /><Typography variant="body2">Ekrandaki yazı okunuyor…</Typography></Stack>}
                    {shot.status === "ok" && (<>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>📸 Okunan hata: "{shot.title}"</Typography>
                      <Typography variant="caption" color="text.secondary">Başlık ve açıklamaya eklendi{shot.codes?.length ? ` · kod: ${shot.codes.join(", ")}` : ""}. Görüntü ticket'a eklenecek.</Typography>
                    </>)}
                    {shot.status === "fail" && <Typography variant="body2" color="text.secondary">Görüntü eklendi ama içindeki yazı okunamadı. Sorunu kısaca yazar mısınız?</Typography>}
                  </Box>
                  <Button size="small" onClick={() => setShot(null)}>Başka görüntü</Button>
                </Stack>
              )}
            </Box>
            {tried !== null && (
              <Alert severity="info" onClose={() => setTried(null)}>
                Denediğiniz adımlar açıklamaya eklendi; destek ekibi bunları size tekrar sormayacak. Ticket'ı açabilirsiniz.
              </Alert>
            )}
            {match.data?.incident && (
              <Alert severity="warning" icon={<CampaignIcon />}
                action={<Button color="inherit" size="small" variant="outlined" disabled={join.isPending}
                  onClick={() => join.mutate(match.data!.incident!.id)}>Ben de etkileniyorum</Button>}>
                <b>Bu sorun biliniyor:</b> {match.data.incident.title}
                <Typography variant="body2">
                  {match.data.incident.affected} kişi bildirdi, ekip üzerinde çalışıyor. Yeni ticket açmak yerine etkilenenler listesine katılın;
                  çözülünce otomatik haber alırsınız.
                </Typography>
              </Alert>
            )}
            {!match.data?.incident && (match.data?.similarOpen ?? 0) >= 2 && (
              <Alert severity="info">Son 24 saatte {match.data!.similarOpen} kişi benzer bir sorun bildirdi. Ekip bilgilendirildi.</Alert>
            )}
            <TextField label="Sorununuzu kısaca yazın" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <MentionField label="Açıklama" value={description} onChange={setDescription} onMentions={setMentions} multiline minRows={4}
              helperText="Birini eklemek için @ yazıp adını yazmaya başlayın; o kişi talebi takip eder ve bildirim alır." />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
              <TextField select label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ flex: 1 }}>
                {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
              <TextField select label="Öncelik" value={priority} onChange={(e) => setPriority(e.target.value)} sx={{ flex: 1 }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
              <ExpertsButton area={category} title={title} description={description} />
            </Stack>
            <Box>
              <Button component="label" size="small" startIcon={<AttachIcon />}>
                Dosya ekle (ekran görüntüsü, log…)
                <input hidden type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv,.docx,.xlsx,.pptx,.zip,.mp4,.webm"
                  onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
              </Button>
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                {files.map((f, i) => (
                  <Chip key={i} size="small" label={`${f.name} (${formatSize(f.size)})`}
                    onDelete={() => setFiles(files.filter((_, j) => j !== i))} />
                ))}
              </Stack>
            </Box>
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
          {wizard && wizardArticle.data ? (
            <SolveWizard title={wizardArticle.data.title} body={wizardArticle.data.body}
              onSolved={wizardSolved} onEscalate={wizardEscalate} onCancel={() => setWizard(null)} />
          ) : (<>
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
                <Button size="small" startIcon={<AutoIcon />} sx={{ mt: 0.5, ml: -0.5 }} onClick={() => setWizard(a.id)}>
                  Adım adım çözelim
                </Button>
              </Box>
            ))}
          </Stack>
          </>)}
        </CardContent>
      </Card>
    </Stack>
  );
}
