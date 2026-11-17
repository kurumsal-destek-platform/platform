import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, Dialog, IconButton, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import AttachIcon from "@mui/icons-material/AttachFile";
import FileIcon from "@mui/icons-material/InsertDriveFileOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import DownloadIcon from "@mui/icons-material/DownloadOutlined";
import { api, errorMessage, fetchAttachmentUrl, formatSize, timeAgo, type AttachmentT } from "../api";

// Ek listesi + yükleme. basePath: "/api/items/ANK-3" ya da "/api/tickets/{id}"
export default function Attachments({ basePath, canUpload = true }: { basePath: string; canUpload?: boolean }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const key = ["attachments", basePath];
  const list = useQuery({ queryKey: key, queryFn: async () => (await api.get<AttachmentT[]>(`${basePath}/attachments`)).data });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) {
        const form = new FormData();
        form.append("file", f);
        await api.post(`${basePath}/attachments`, form);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/attachments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => setError(errorMessage(e)),
  });

  const download = async (a: AttachmentT) => {
    const url = await fetchAttachmentUrl(a.id);
    const link = document.createElement("a");
    link.href = url; link.download = a.fileName; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>Ekler {list.data?.length ? `(${list.data.length})` : ""}</Typography>
        {canUpload && (
          <>
            <Button size="small" startIcon={<AttachIcon />} onClick={() => input.current?.click()} disabled={upload.isPending}>
              Dosya ekle
            </Button>
            <input ref={input} type="file" multiple hidden
              accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv,.docx,.xlsx,.pptx,.zip"
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) { setError(""); upload.mutate(f); } }} />
          </>
        )}
      </Stack>
      {upload.isPending && <LinearProgress sx={{ mb: 1 }} />}
      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 1 }}>{error}</Alert>}
      {list.data?.length === 0 && <Typography variant="body2" color="text.secondary">Ek yok. En fazla 10 MB; resim, PDF, Office, zip.</Typography>}
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
        {list.data?.map((a) => (
          <Box key={a.id} sx={{ width: 150, border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
            <Box sx={{ height: 90, display: "grid", placeItems: "center", bgcolor: "action.hover", cursor: a.isImage ? "zoom-in" : "default" }}
              onClick={async () => { if (a.isImage) setPreview(await fetchAttachmentUrl(a.id)); }}>
              {a.isImage ? <Thumb id={a.id} /> : <FileIcon sx={{ fontSize: 36, color: "text.secondary" }} />}
            </Box>
            <Box sx={{ p: 0.8 }}>
              <Typography variant="caption" noWrap sx={{ display: "block" }} title={a.fileName}>{a.fileName}</Typography>
              <Stack direction="row" sx={{ alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{formatSize(a.size)} · {timeAgo(a.createdAt)}</Typography>
                <Tooltip title="İndir"><IconButton size="small" onClick={() => download(a)}><DownloadIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                <Tooltip title="Sil"><IconButton size="small" onClick={() => remove.mutate(a.id)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
              </Stack>
            </Box>
          </Box>
        ))}
      </Stack>
      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="lg">
        {preview && <img src={preview} alt="" style={{ maxWidth: "90vw", maxHeight: "85vh", display: "block" }} />}
      </Dialog>
    </Box>
  );
}

function Thumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    fetchAttachmentUrl(id).then((x) => { u = x; setUrl(x); }).catch(() => {});
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: 90, objectFit: "cover" }} /> : null;
}
