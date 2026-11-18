import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Button, Collapse, Stack, Typography } from "@mui/material";

// Bir sayfa hata verirse tüm uygulama beyaz ekrana dönmesin: sadece o bölüm yerine kibar bir mesaj göster.
// resetKey değişince (ör. başka sayfaya geçince) kendini sıfırlar.
interface Props { children: ReactNode; resetKey?: string; compact?: boolean }
interface State { error: Error | null; details: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, details: false };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Ekran hatası:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, details: false });
  }

  render() {
    const { error, details } = this.state;
    if (!error) return this.props.children;
    return (
      <Box sx={{ py: this.props.compact ? 3 : 8, px: 2, textAlign: "center", maxWidth: 520, mx: "auto" }}>
        <Typography sx={{ fontSize: 48 }}>🛠️</Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>Bu bölüm şu an açılamadı</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Beklenmeyen bir hata oluştu. Verileriniz güvende; sayfayı yenilemek genellikle sorunu çözer.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "center", mt: 3 }}>
          <Button variant="contained" onClick={() => window.location.reload()}>Sayfayı yenile</Button>
          <Button onClick={() => { this.setState({ error: null }); window.history.back(); }}>Geri dön</Button>
        </Stack>
        <Button size="small" color="inherit" sx={{ mt: 2, opacity: 0.7 }} onClick={() => this.setState({ details: !details })}>
          {details ? "Teknik ayrıntıyı gizle" : "Teknik ayrıntı"}
        </Button>
        <Collapse in={details}>
          <Box component="pre" sx={{ textAlign: "left", fontSize: 12, p: 1.5, mt: 1, borderRadius: 1, bgcolor: "action.hover", overflow: "auto", maxHeight: 200 }}>
            {error.message}
          </Box>
        </Collapse>
      </Box>
    );
  }
}
