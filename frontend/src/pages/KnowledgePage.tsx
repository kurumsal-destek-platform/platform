import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Autocomplete, Box, Button, Card, CardActionArea, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, InputAdornment, LinearProgress, List, ListItemButton, ListItemText, MenuItem, Stack, Switch, TextField,
  Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import UploadIcon from "@mui/icons-material/UploadFileOutlined";
import EyeIcon from "@mui/icons-material/VisibilityOutlined";
import ThumbUpIcon from "@mui/icons-material/ThumbUpOutlined";
import ThumbDownIcon from "@mui/icons-material/ThumbDownOutlined";
import HistoryIcon from "@mui/icons-material/HistoryOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import ArchiveIcon from "@mui/icons-material/Inventory2Outlined";
import { useAuth } from "../auth";
import ImportDialog from "../components/ImportDialog";
import { api, CATEGORIES, errorMessage, timeAgo, type Article, type ArticleLite, type ArticleRevisionT } from "../api";

const SORTS: Record<string, string> = { title: "A → Z", recent: "Son güncellenen", popular: "En çok okunan", helpful: "En faydalı" };
const refreshKb = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["articles"] });
  qc.invalidateQueries({ queryKey: ["article"] });
  qc.invalidateQueries({ queryKey: ["kbTags"] });
  qc.invalidateQueries({ queryKey: ["kbArchive"] });
};

// Bilgi bankası: makaleler kart ızgarasında; kategori, etiket ve sıralama ile süzülür. Tıklanan makale pencerede açılır.
// Destek ekibi yazar/düzenler/yayınlar ve sürüm geçmişini görür; yönetici siler (arşiv) ve arşivden geri alır.
export default function KnowledgePage() {
  const { user } = useAuth();
  const isSupport = user?.role === "Manager" || user?.role === "Admin" || user?.role === "Agent";
  const isManager = user?.role === "Manager" || user?.role === "Admin";
  const phone = useMediaQuery(useTheme().breakpoints.down("sm"));
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState("title");
  const [drafts, setDrafts] = useState(isSupport);
  const [creating, setCreating] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const selected = params.get("article");
  const [importOpen, setImportOpen] = useState(false);
  const [imported, setImported] = useState<{ n: number; published: boolean } | null>(null);
  const select = (id: string | null) => setParams(id ? { article: id } : {}, { replace: true });
  useEffect(() => { if (selected) setDrafts((d) => d || isSupport); }, [selected, isSupport]);

  const list = useQuery({
    queryKey: ["articles", q, drafts, sort, tag],
    queryFn: async () => (await api.get<ArticleLite[]>("/api/kb/articles", {
      params: { q: q || undefined, drafts: drafts || undefined, sort, tag: tag || undefined },
    })).data,
  });
  const tags = useQuery({ queryKey: ["kbTags"], queryFn: async () => (await api.get<{ tag: string; count: number }[]>("/api/kb/tags")).data });
  const all = list.data ?? [];
  const counts = all.reduce<Record<string, number>>((m, a) => { m[a.category] = (m[a.category] ?? 0) + 1; return m; }, {});
  const cats = [...new Set([...CATEGORIES, ...Object.keys(counts)])].filter((c) => counts[c]);
  const shown = cat ? all.filter((a) => a.category === cat) : all;

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 0.5, alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ flex: 1 }}>Bilgi bankası</Typography>
        {isManager && <Button startIcon={<ArchiveIcon />} onClick={() => setArchiveOpen(true)}>Arşiv</Button>}
        {isManager && <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setImportOpen(true)}>Doküman içe aktar</Button>}
        {isSupport && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>Yeni makale</Button>}
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Sık karşılaşılan sorunların çözümleri. Talep açmadan önce buraya göz atın.</Typography>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 2, alignItems: { md: "center" } }}>
        <TextField placeholder="Başlık, içerik veya etiket ara…" value={q} onChange={(e) => setQ(e.target.value)} size="small" sx={{ width: { md: 360 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <Autocomplete size="small" sx={{ width: { md: 200 } }} options={(tags.data ?? []).map((t) => t.tag)} value={tag} onChange={(_, v) => setTag(v)}
          getOptionLabel={(t) => `#${t}`} renderInput={(p) => <TextField {...p} placeholder="Etiket" />} />
        <TextField select size="small" value={sort} onChange={(e) => setSort(e.target.value)} sx={{ width: { md: 190 } }} disabled={!!q}
          label="Sırala">
          {Object.entries(SORTS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        {isSupport && (
          <FormControlLabel control={<Switch checked={drafts} onChange={(e) => setDrafts(e.target.checked)} />} label="Taslakları göster" />
        )}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: "wrap", rowGap: 1 }}>
        <Chip label={`Tümü (${all.length})`} color={cat === "" ? "primary" : "default"} variant={cat === "" ? "filled" : "outlined"} onClick={() => setCat("")} />
        {cats.map((c) => (
          <Chip key={c} label={`${c} (${counts[c]})`} color={cat === c ? "primary" : "default"} variant={cat === c ? "filled" : "outlined"} onClick={() => setCat(c)} />
        ))}
      </Stack>

      {imported && (
        <Alert severity="success" onClose={() => setImported(null)} sx={{ mb: 2 }}>
          {imported.n} makale {imported.published ? "yayınlandı. Asistan birkaç saniye içinde bu bilgilerle cevap vermeye başlar." : "taslak olarak eklendi. \"Taslakları göster\" ile inceleyip yayınlayabilirsiniz."}
        </Alert>
      )}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)}
        onDone={(n, published) => { setImportOpen(false); setImported({ n, published }); if (!published) setDrafts(true); }} />

      {list.isLoading && <LinearProgress />}
      {list.error && <Alert severity="error">{errorMessage(list.error)}</Alert>}
      {!list.isLoading && shown.length === 0 && (
        <Card sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">Aradığınız konuda makale bulunamadı.</Typography>
          {isSupport && <Button sx={{ mt: 1 }} startIcon={<AddIcon />} onClick={() => setCreating(true)}>Bu konuda makale yazın</Button>}
        </Card>
      )}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)", xl: "repeat(4, 1fr)" } }}>
        {shown.map((a) => <ArticleCard key={a.id} a={a} onOpen={() => select(a.id)} onTag={setTag} />)}
      </Box>

      <Dialog open={!!selected} onClose={() => select(null)} fullWidth maxWidth="md" fullScreen={phone}>
        <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
          {params.get("ai") === "1" && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Bu taslağı yerel yapay zekâ, ekibin geçmiş çözümlerinden yazdı. Kontrol edip "Yayınla" dediğinizde çalışanlar ve asistan kullanmaya başlar.
            </Alert>
          )}
          {selected && <ArticleView id={selected} onClosed={() => select(null)} />}
        </DialogContent>
        <DialogActions><Button onClick={() => select(null)}>Kapat</Button></DialogActions>
      </Dialog>
      <ArticleEditor open={creating} onClose={() => setCreating(false)}
        onSaved={(id, published) => { setCreating(false); if (!published) setDrafts(true); select(id); }} />
      {isManager && <ArchiveDialog open={archiveOpen} onClose={() => setArchiveOpen(false)} />}
    </Box>
  );
}

function ArticleCard({ a, onOpen, onTag }: { a: ArticleLite; onOpen: () => void; onTag: (t: string) => void }) {
  return (
    <Card sx={{ display: "flex", "&:hover": { borderColor: "primary.main", boxShadow: "0 6px 18px rgba(20,60,55,0.10)" } }}>
      <CardActionArea onClick={onOpen} sx={{ p: 2.25, display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start" }}>
        <Stack direction="row" spacing={0.75} sx={{ mb: 1.25, flexWrap: "wrap", rowGap: 0.5 }}>
          <Chip size="small" label={a.category} sx={{ bgcolor: "action.selected", color: "primary.main", fontWeight: 600 }} />
          {a.published === false && <Chip size="small" color="warning" label="Taslak" />}
          {a.fromTicket && <Chip size="small" variant="outlined" label="Ticket'tan" />}
        </Stack>
        <Typography sx={{ fontWeight: 700, mb: 0.75, lineHeight: 1.35 }}>{a.title}</Typography>
        <Typography variant="body2" color="text.secondary"
          sx={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.snippet}</Typography>
        {!!a.tags?.length && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.5 }}>
            {a.tags.slice(0, 4).map((t) => (
              <Typography key={t} component="span" variant="caption" color="primary"
                onClick={(e) => { e.stopPropagation(); onTag(t); }} sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>#{t}</Typography>
            ))}
          </Stack>
        )}
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1.5} sx={{ mt: 1.5, alignItems: "center", color: "text.secondary" }}>
          <Tooltip title="Okunma"><Stack direction="row" spacing={0.4} sx={{ alignItems: "center" }}><EyeIcon sx={{ fontSize: 15 }} /><Typography variant="caption">{a.views ?? 0}</Typography></Stack></Tooltip>
          {a.helpful != null && (
            <Tooltip title={`${a.votes} kişi oy verdi`}><Stack direction="row" spacing={0.4} sx={{ alignItems: "center" }}><ThumbUpIcon sx={{ fontSize: 14 }} /><Typography variant="caption">%{a.helpful}</Typography></Stack></Tooltip>
          )}
          {a.updatedAt && <Typography variant="caption">{timeAgo(a.updatedAt)}</Typography>}
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>Oku →</Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

function ArticleView({ id, onClosed }: { id: string; onClosed: () => void }) {
  const qc = useQueryClient();
  const article = useQuery({ queryKey: ["article", id], queryFn: async () => (await api.get<Article>(`/api/kb/articles/${id}`)).data });
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [error, setError] = useState("");
  const a = article.data;
  useEffect(() => { setEditing(false); setError(""); }, [id]);

  const publish = useMutation({
    mutationFn: (p: boolean) => api.post(`/api/kb/articles/${id}/publish`, null, { params: { published: p } }),
    onSuccess: () => refreshKb(qc), onError: (e) => setError(errorMessage(e)),
  });
  const vote = useMutation({
    mutationFn: (solved: boolean) => api.post("/api/kb/feedback", { articleId: id, solved, source: "article" }),
    onSuccess: () => refreshKb(qc),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/kb/articles/${id}`),
    onSuccess: () => { refreshKb(qc); onClosed(); }, onError: (e) => setError(errorMessage(e)),
  });

  if (article.error) return <Alert severity="error">{errorMessage(article.error)}</Alert>;
  if (!a) return <LinearProgress />;
  if (editing) return <ArticleEditor inline article={a} open onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {a.published === false && (
        <Alert severity="warning" sx={{ mb: 2 }}
          action={a.canEdit && <Button color="inherit" size="small" onClick={() => publish.mutate(true)}>Yayınla</Button>}>
          Bu makale taslak. Sadece destek ekibi görür; asistan da henüz kullanmaz.
        </Alert>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ alignItems: { sm: "flex-start" }, gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={0.75} sx={{ mb: 1, flexWrap: "wrap", rowGap: 0.5 }}>
            <Chip size="small" label={a.category} sx={{ bgcolor: "action.selected", color: "primary.main", fontWeight: 600 }} />
            {a.tags?.map((t) => <Chip key={t} size="small" variant="outlined" label={`#${t}`} />)}
          </Stack>
          <Typography variant="h5">{a.title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {a.author ? `${a.author} yazdı · ` : ""}
            {a.updatedBy ? `${a.updatedBy} güncelledi, ` : "Son güncelleme "}{a.updatedAt ? timeAgo(a.updatedAt) : ""}
            {` · sürüm ${a.version ?? 1} · ${a.views ?? 0} okunma`}
          </Typography>
        </Box>
        {a.canEdit && (
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
            <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(true)}>Düzenle</Button>
            <Button size="small" startIcon={<HistoryIcon />} onClick={() => setHistory(true)}>Geçmiş</Button>
            {a.published !== false && <Button size="small" color="warning" onClick={() => publish.mutate(false)}>Yayından kaldır</Button>}
            {a.canDelete && (
              <Tooltip title="Sil (arşive kaldırır, geri alınabilir)">
                <Button size="small" color="error" sx={{ minWidth: 36 }}
                  onClick={() => { if (window.confirm(`"${a.title}" silinsin mi? Arşivden geri alabilirsiniz.`)) remove.mutate(); }}><DeleteIcon fontSize="small" /></Button>
              </Tooltip>
            )}
          </Stack>
        )}
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Typography sx={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>{a.body}</Typography>
      {a.published !== false && (
        <Card sx={{ mt: 3, p: 2, bgcolor: "action.hover", borderStyle: "dashed" }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
            <Typography sx={{ fontWeight: 600, flex: 1 }}>
              {a.myVote == null ? "Bu makale sorununuzu çözdü mü?" : a.myVote ? "Teşekkürler, işinize yaramasına sevindik." : "Teşekkürler. Makaleyi iyileştireceğiz; gerekirse talep açabilirsiniz."}
            </Typography>
            <Button size="small" variant={a.myVote === true ? "contained" : "outlined"} startIcon={<ThumbUpIcon />} onClick={() => vote.mutate(true)}>Evet</Button>
            <Button size="small" variant={a.myVote === false ? "contained" : "outlined"} color="secondary" startIcon={<ThumbDownIcon />} onClick={() => vote.mutate(false)}>Hayır</Button>
          </Stack>
          {a.helpful != null && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {(a.helpfulYes ?? 0) + (a.helpfulNo ?? 0)} kişiden %{a.helpful}'i faydalı buldu.
            </Typography>
          )}
        </Card>
      )}
      {history && <HistoryDialog id={id} onClose={() => setHistory(false)} />}
    </Box>
  );
}

type Form = { title: string; category: string; body: string; tags: string[]; publish: boolean };

// Yeni makale (pencere) veya düzenleme (makale penceresinin içinde, inline)
function ArticleEditor({ open, onClose, onSaved, article, inline }: {
  open: boolean; onClose: () => void; onSaved: (id: string, published: boolean) => void; article?: Article; inline?: boolean;
}) {
  const qc = useQueryClient();
  const tagList = useQuery({ queryKey: ["kbTags"], enabled: open, queryFn: async () => (await api.get<{ tag: string; count: number }[]>("/api/kb/tags")).data });
  const empty: Form = { title: "", category: "Diğer", body: "", tags: [], publish: true };
  const [f, setF] = useState<Form>(empty);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setF(article ? { title: article.title, category: article.category, body: article.body, tags: article.tags ?? [], publish: article.published !== false } : empty);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, article?.id]);
  const save = useMutation({
    mutationFn: async () => {
      const body = { title: f.title.trim(), body: f.body.trim(), category: f.category, tags: f.tags };
      if (article) return (await api.put<Article>(`/api/kb/articles/${article.id}`, { ...body, expectedVersion: article.version })).data;
      return (await api.post<Article>("/api/kb/articles", { ...body, published: f.publish })).data;
    },
    onSuccess: (a) => { refreshKb(qc); onSaved(a.id, a.published !== false); },
    onError: (e) => setError(errorMessage(e)),
  });
  const tooShort = f.title.trim().length < 5 || f.body.trim().length < 20;

  const fields = (
    <Stack spacing={2} sx={{ mt: inline ? 0 : 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Başlık" placeholder="Örn. VPN bağlantısı kopuyor" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus
        helperText={f.title && f.title.trim().length < 5 ? "En az 5 karakter" : " "} slotProps={{ htmlInput: { maxLength: 200 } }} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField select label="Kategori" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} sx={{ minWidth: 200 }}>
          {[...new Set([...CATEGORIES, f.category])].filter(Boolean).map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <Autocomplete multiple freeSolo fullWidth options={(tagList.data ?? []).map((t) => t.tag)} value={f.tags}
          onChange={(_, v) => setF({ ...f, tags: v.map((t) => t.trim().replace(/^#/, "").toLocaleLowerCase("tr-TR")).filter(Boolean).slice(0, 10) })}
          renderInput={(p) => <TextField {...p} label="Etiketler" placeholder={f.tags.length ? "" : "vpn, outlook… (Enter ile ekleyin)"} />} />
      </Stack>
      <TextField label="İçerik" multiline minRows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })}
        placeholder={"Sorunu ve çözüm adımlarını yazın:\n1) …\n2) …\n3) Hâlâ çözülmediyse talep açın."}
        helperText={`${f.body.length} / 20000 karakter${f.body && f.body.trim().length < 20 ? " · en az 20 karakter" : ""}`} />
      {!article && (
        <FormControlLabel control={<Switch checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} />}
          label={f.publish ? "Hemen yayınla (herkes görür, asistan kullanır)" : "Taslak olarak kaydet (sadece destek ekibi görür)"} />
      )}
    </Stack>
  );
  const actions = (
    <>
      <Button onClick={onClose}>Vazgeç</Button>
      <Button variant="contained" disabled={tooShort || save.isPending} onClick={() => save.mutate()}>
        {article ? "Kaydet" : f.publish ? "Yayınla" : "Taslak kaydet"}
      </Button>
    </>
  );

  if (inline) return <Box>{fields}<Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "flex-end" }}>{actions}</Stack></Box>;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Yeni makale</DialogTitle>
      <DialogContent>{fields}</DialogContent>
      <DialogActions>{actions}</DialogActions>
    </Dialog>
  );
}

function HistoryDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const revs = useQuery({ queryKey: ["articleRevs", id], queryFn: async () => (await api.get<ArticleRevisionT[]>(`/api/kb/articles/${id}/revisions`)).data });
  const [sel, setSel] = useState<ArticleRevisionT | null>(null);
  useEffect(() => { if (revs.data && !sel) setSel(revs.data[0]); }, [revs.data, sel]);
  const restore = useMutation({
    mutationFn: (v: number) => api.post(`/api/kb/articles/${id}/revisions/${v}/restore`),
    onSuccess: () => { refreshKb(qc); qc.invalidateQueries({ queryKey: ["articleRevs", id] }); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Sürüm geçmişi</DialogTitle>
      <DialogContent>
        {revs.isLoading && <LinearProgress />}
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <List dense sx={{ width: { md: 280 }, flexShrink: 0, border: 1, borderColor: "divider", borderRadius: 2, maxHeight: 460, overflowY: "auto" }}>
            {revs.data?.map((r) => (
              <ListItemButton key={r.version} selected={sel?.version === r.version} onClick={() => setSel(r)}>
                <ListItemText primary={`Sürüm ${r.version}${r.current ? " (güncel)" : ""}`}
                  secondary={`${r.editedBy ?? "Sistem"} · ${new Date(r.editedAt).toLocaleString("tr-TR")}`} />
              </ListItemButton>
            ))}
            {revs.data?.length === 1 && <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: "block" }}>Henüz düzenlenmemiş; ilk düzenlemeden sonra eski sürümler burada görünür.</Typography>}
          </List>
          {sel && (
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
                <Typography variant="h6" sx={{ flex: 1 }}>{sel.title}</Typography>
                {!sel.current && <Button variant="contained" disabled={restore.isPending} onClick={() => restore.mutate(sel.version)}>Bu sürümü geri yükle</Button>}
              </Stack>
              <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
                <Chip size="small" label={sel.category} />
                {sel.tags.map((t) => <Chip key={t} size="small" variant="outlined" label={`#${t}`} />)}
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.7, maxHeight: 380, overflowY: "auto" }}>{sel.body}</Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions>
    </Dialog>
  );
}

function ArchiveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const list = useQuery({
    queryKey: ["kbArchive"], enabled: open,
    queryFn: async () => (await api.get<{ id: string; title: string; category: string; archivedAt: string; archivedBy?: string }[]>("/api/kb/archive")).data,
  });
  const restore = useMutation({
    mutationFn: (id: string) => api.post(`/api/kb/archive/${id}/restore`),
    onSuccess: () => { setError(""); refreshKb(qc); }, onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Silinen makaleler</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Geri alınan makale taslak olarak döner; kontrol edip yayınlayın.</Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {list.isLoading && <LinearProgress />}
        {list.data?.length === 0 && <Typography color="text.secondary">Arşiv boş.</Typography>}
        <List dense>
          {list.data?.map((a) => (
            <Stack key={a.id} direction="row" sx={{ alignItems: "center", py: 0.5 }}>
              <ListItemText primary={a.title} secondary={`${a.category} · ${a.archivedBy ?? "?"} sildi, ${timeAgo(a.archivedAt)}`} />
              <Button size="small" onClick={() => restore.mutate(a.id)}>Geri al</Button>
            </Stack>
          ))}
        </List>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions>
    </Dialog>
  );
}
