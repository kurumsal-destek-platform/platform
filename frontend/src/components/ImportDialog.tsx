import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import UploadIcon from "@mui/icons-material/UploadFileOutlined";
import ExpandIcon from "@mui/icons-material/ExpandMore";
import { api, CATEGORIES, errorMessage } from "../api";
import { celebrate } from "../delight";

interface Sec { title: string; body: string; suggestedCategory: string; similarArticle?: { id: string; title: string; sim: number } | null }
interface Row extends Sec { on: boolean; category: string; open: boolean }

// PDF / Word / metin dokümanını bölümlere ayırıp bilgi bankasına aktarır. Önce önizleme, sonra onay.
export default function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (n: number, published: boolean) => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState<{ file: string; pages?: number | null } | null>(null);
  const [drag, setDrag] = useState(false);
  const reset = () => { setFile(null); setRows(null); setMeta(null); preview.reset(); save.reset(); };

  const preview = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData(); fd.append("file", f, f.name);
      return (await api.post<{ file: string; pages?: number | null; sections: Sec[] }>("/api/kb/import/preview", fd, { timeout: 120000 })).data;
    },
    onSuccess: (d) => {
      setMeta({ file: d.file, pages: d.pages });
      setRows(d.sections.map((s) => ({ ...s, on: !s.similarArticle, category: CATEGORIES.includes(s.suggestedCategory) ? s.suggestedCategory : "Diğer", open: false })));
    },
  });
  const save = useMutation({
    mutationFn: async (publish: boolean) => (await api.post<{ created: number; published: boolean }>("/api/kb/import", {
      publish, sourceFile: meta?.file, sections: rows!.filter((r) => r.on).map((r) => ({ title: r.title, body: r.body, category: r.category })),
    })).data,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      qc.invalidateQueries({ queryKey: ["knowledgeGaps"] });
      if (d.published) celebrate();
      onDone(d.created, d.published); reset();
    },
  });
  const pick = (f?: File | null) => { if (f) { setFile(f); preview.mutate(f); } };
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosen = rows?.filter((r) => r.on).length ?? 0;

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} fullWidth maxWidth="md">
      <DialogTitle>Doküman içe aktar</DialogTitle>
      <DialogContent>
        {!rows && (
          <Box onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
            sx={{ mt: 1, p: 5, textAlign: "center", border: "2px dashed", borderRadius: 2, borderColor: drag ? "primary.main" : "divider", bgcolor: drag ? "action.hover" : "transparent" }}>
            {preview.isPending ? (
              <Stack sx={{ alignItems: "center" }} spacing={1.5}><CircularProgress /><Typography>"{file?.name}" okunuyor ve bölümlere ayrılıyor…</Typography></Stack>
            ) : (
              <>
                <UploadIcon color="primary" sx={{ fontSize: 48 }} />
                <Typography variant="h6" sx={{ mt: 1 }}>Mevcut dokümanlarınızı yükleyin</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  IT el kitabı, politika, prosedür… Başlıklara göre bölünür, her bölüm bir makale olur ve asistan hemen kullanmaya başlar.
                </Typography>
                <Button variant="contained" component="label">Dosya seç
                  <input hidden type="file" accept=".pdf,.docx,.txt,.md,.html,.htm" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>PDF, Word (.docx), TXT, Markdown, HTML · en fazla 20 MB · dosya şirket dışına çıkmaz</Typography>
              </>
            )}
            {preview.error && <Alert severity="error" sx={{ mt: 2, textAlign: "left" }}>{errorMessage(preview.error)}</Alert>}
          </Box>
        )}

        {rows && (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Alert severity="info">
              <b>{meta?.file}</b>{meta?.pages ? ` · ${meta.pages} sayfa` : ""} → <b>{rows.length} bölüm</b> bulundu. Başlık ve kategorileri kontrol edin;
              işaretli olanlar makale olarak eklenecek.
            </Alert>
            {rows.map((r, i) => (
              <Box key={i} sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 1, opacity: r.on ? 1 : 0.55 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                  <Checkbox checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} />
                  <TextField size="small" value={r.title} onChange={(e) => set(i, { title: e.target.value })} sx={{ flex: 1 }} variant="standard" />
                  <TextField select size="small" value={r.category} onChange={(e) => set(i, { category: e.target.value })} sx={{ width: 160 }} variant="standard">
                    {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </TextField>
                  <Typography variant="caption" color="text.secondary" sx={{ width: 70, textAlign: "right" }}>{r.body.length} kr.</Typography>
                  <IconButton size="small" onClick={() => set(i, { open: !r.open })} sx={{ transform: r.open ? "rotate(180deg)" : "none" }}><ExpandIcon /></IconButton>
                </Stack>
                {r.similarArticle && (
                  <Tooltip title="Benzer bir makale zaten var; tekrar olmasın diye bu bölüm başta seçili gelmedi.">
                    <Chip size="small" color="warning" variant="outlined" sx={{ ml: 6, mt: 0.5 }} label={`Benzer makale var: "${r.similarArticle.title}"`} />
                  </Tooltip>
                )}
                <Collapse in={r.open}>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", ml: 6, mt: 1, p: 1, bgcolor: "action.hover", borderRadius: 1, maxHeight: 220, overflowY: "auto" }}>{r.body}</Typography>
                </Collapse>
              </Box>
            ))}
            {save.error && <Alert severity="error">{errorMessage(save.error)}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {rows ? (
          <>
            <Button onClick={reset}>Başka dosya</Button>
            <Box sx={{ flex: 1 }} />
            <Button disabled={!chosen || save.isPending} onClick={() => save.mutate(false)}>Taslak olarak ekle ({chosen})</Button>
            <Button variant="contained" disabled={!chosen || save.isPending} onClick={() => save.mutate(true)}>Yayınla ({chosen})</Button>
          </>
        ) : <Button onClick={() => { reset(); onClose(); }}>Kapat</Button>}
      </DialogActions>
    </Dialog>
  );
}
