import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import { api, errorMessage, type Article } from "../api";
import { highlightParts } from "../helpers";

// "Kaynağı göster": cevabın dayandığı bilgi bankası makalesi. RAG parçayı gönderirse o kısım vurgulanır ve ekrana kaydırılır.
export default function SourceDialog({ source, onClose }: {
  source: { id: string; title: string; snippet?: string | null } | null; onClose: () => void;
}) {
  const phone = useMediaQuery(useTheme().breakpoints.down("sm"));
  const art = useQuery({
    queryKey: ["article", source?.id], enabled: !!source,
    queryFn: async () => (await api.get<Article>(`/api/kb/articles/${source!.id}`)).data,
  });
  const markRef = useRef<HTMLElement>(null);
  const [before, hit, after] = art.data ? highlightParts(art.data.body, source?.snippet) : ["", "", ""];
  useEffect(() => { if (hit) setTimeout(() => markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 150); }, [hit]);

  return (
    <Dialog open={!!source} onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>
        {art.data?.title ?? source?.title}
        {art.data && <Box><Chip size="small" label={art.data.category} sx={{ mt: 1 }} /></Box>}
      </DialogTitle>
      <DialogContent dividers>
        {art.isLoading && <CircularProgress size={24} />}
        {art.error && <Alert severity="error">{errorMessage(art.error)}</Alert>}
        {art.data && (
          <>
            {hit && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Vurgulanan kısım, asistanın cevabında kullandığı bölüm.
              </Typography>
            )}
            <Typography variant="body2" component="div" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {before}
              {hit && (
                <Box component="mark" ref={markRef}
                  sx={{ bgcolor: "rgba(245,205,71,0.35)", color: "inherit", borderRadius: 0.5, px: 0.25 }}>{hit}</Box>
              )}
              {after}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions>
    </Dialog>
  );
}
