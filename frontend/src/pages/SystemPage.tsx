import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, InputAdornment, Stack, Tab, Table, TableBody, TableCell, TableHead,
  TableRow, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import OkIcon from "@mui/icons-material/CheckCircleRounded";
import WarnIcon from "@mui/icons-material/WarningRounded";
import DownIcon from "@mui/icons-material/ErrorRounded";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage, timeAgo } from "../api";

type St = "ok" | "warn" | "down";
interface StatusT {
  overall: St; uptimeMinutes: number; version?: string; environment: string;
  checks: { key: string; name: string; status: St; detail: string; ms?: number | null }[];
  counts: { users: number; tickets: number; articles: number; auditLast24h: number };
}
interface AuditT { id: string; at: string; userName: string; action: string; method: string; path: string; statusCode: number; ip?: string }

const ICON: Record<St, React.ReactNode> = { ok: <OkIcon color="success" />, warn: <WarnIcon color="warning" />, down: <DownIcon color="error" /> };
const SUMMARY: Record<St, { sev: "success" | "warning" | "error"; text: string }> = {
  ok: { sev: "success", text: "Tüm bileşenler çalışıyor." },
  warn: { sev: "warning", text: "Sistem çalışıyor; bazı bileşenler yedek modda." },
  down: { sev: "error", text: "Bir veya daha fazla bileşen çalışmıyor." },
};

export default function SystemPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "audit" ? 1 : 0;
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Sistem</Typography>
      <Tabs value={tab} onChange={(_, v) => setParams(v ? { tab: "audit" } : {}, { replace: true })} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Durum" />
        <Tab label="Denetim kaydı" />
      </Tabs>
      {tab === 0 ? <Status /> : <Audit />}
    </Box>
  );
}

function Status() {
  const q = useQuery({
    queryKey: ["systemStatus"], refetchInterval: 30000,
    queryFn: async () => (await api.get<StatusT>("/api/system/status", { timeout: 30000 })).data,
  });
  if (q.isLoading) return <CircularProgress />;
  if (q.error) return <Alert severity="error">{errorMessage(q.error)}</Alert>;
  const d = q.data!;
  const up = d.uptimeMinutes < 60 ? `${d.uptimeMinutes} dk` : d.uptimeMinutes < 1440 ? `${Math.floor(d.uptimeMinutes / 60)} sa` : `${Math.floor(d.uptimeMinutes / 1440)} gün`;
  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Alert severity={SUMMARY[d.overall].sev} action={<Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => q.refetch()}>Yenile</Button>}>
        {SUMMARY[d.overall].text} <Typography component="span" variant="caption">· ortam: {d.environment} · çalışma süresi: {up}</Typography>
      </Alert>
      <Card variant="outlined">
        {d.checks.map((c, i) => (
          <Stack key={c.key} direction="row" spacing={2} sx={{ alignItems: "center", px: 2, py: 1.5, borderTop: i ? 1 : 0, borderColor: "divider" }}>
            {ICON[c.status]}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.name}</Typography>
              <Typography variant="caption" color="text.secondary">{c.detail}</Typography>
            </Box>
            {c.ms != null && <Chip size="small" variant="outlined" label={`${c.ms} ms`} />}
          </Stack>
        ))}
      </Card>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
        {[["Kullanıcı", d.counts.users], ["Ticket", d.counts.tickets], ["Makale", d.counts.articles], ["Son 24 saatte denetim kaydı", d.counts.auditLast24h]].map(([l, v]) => (
          <Card key={l as string} variant="outlined"><CardContent sx={{ py: 1.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{v}</Typography>
            <Typography variant="caption" color="text.secondary">{l}</Typography>
          </CardContent></Card>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary">
        Yedek: veritabanı her gün otomatik yedeklenir (proje klasöründe <code>backups/</code>, son 7 gün).
      </Typography>
    </Stack>
  );
}

function Audit() {
  const [text, setText] = useState("");
  const [onlySecurity, setOnlySecurity] = useState(false);
  const [days, setDays] = useState(7);
  const q = useQuery({
    queryKey: ["audit", text, onlySecurity, days],
    queryFn: async () => (await api.get<AuditT[]>("/api/audit", { params: { q: text || undefined, onlySecurity, days } })).data,
  });
  const download = async () => {
    const r = await api.get("/api/audit", { params: { q: text || undefined, onlySecurity, days, format: "csv" }, responseType: "blob" });
    const url = URL.createObjectURL(r.data as Blob);
    const a = document.createElement("a"); a.href = url; a.download = `denetim-kaydi.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const color = (a: AuditT) => a.action.startsWith("YETKİSİZ") || a.action.startsWith("Giriş başarısız") || a.action.startsWith("Çok fazla") ? "error.main" : undefined;

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Veri değiştiren her işlem ve giriş denemesi kaydedilir: kim, ne yaptı, ne zaman, nereden. Mesaj ve şifre gibi içerikler kaydedilmez.
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" } }}>
        <TextField size="small" placeholder="Kişi, işlem ya da adres ara…" value={text} onChange={(e) => setText(e.target.value)} sx={{ minWidth: 280 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <Chip label="🔐 Sadece güvenlik olayları" color={onlySecurity ? "primary" : "default"} variant={onlySecurity ? "filled" : "outlined"} onClick={() => setOnlySecurity((v) => !v)} />
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
          <ToggleButton value={1}>24 sa</ToggleButton><ToggleButton value={7}>7 gün</ToggleButton><ToggleButton value={30}>30 gün</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<DownloadIcon />} onClick={download}>CSV indir</Button>
      </Stack>
      {q.error && <Alert severity="error">{errorMessage(q.error)}</Alert>}
      <Card variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 760 }}>
          <TableHead><TableRow>
            <TableCell>Zaman</TableCell><TableCell>Kişi</TableCell><TableCell>İşlem</TableCell><TableCell>Adres</TableCell><TableCell>IP</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {q.data?.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Kayıt yok.</Typography></TableCell></TableRow>}
            {q.data?.map((a) => (
              <TableRow key={a.id} hover>
                <TableCell sx={{ whiteSpace: "nowrap" }} title={new Date(a.at).toLocaleString("tr-TR")}>{timeAgo(a.at)}</TableCell>
                <TableCell>{a.userName}</TableCell>
                <TableCell sx={{ color: color(a), fontWeight: color(a) ? 600 : undefined }}>{a.action}</TableCell>
                <TableCell><Typography variant="caption" sx={{ fontFamily: "monospace" }}>{a.method} {a.path}</Typography></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{a.ip}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Stack>
  );
}
