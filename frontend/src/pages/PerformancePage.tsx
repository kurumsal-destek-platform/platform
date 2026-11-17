import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Rating, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import TimerIcon from "@mui/icons-material/TimerOutlined";
import StarIcon from "@mui/icons-material/StarRounded";
import SavingsIcon from "@mui/icons-material/SavingsOutlined";
import ShieldIcon from "@mui/icons-material/VerifiedOutlined";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import { api, errorMessage, formatDuration, formatTL, PRIORITIES, type QualityT, type SavingsT } from "../api";
import { BarLine, HBars, StatCard, TrendLine, weekLabel } from "../components/charts";
import { SlaChip } from "../components/SlaCsat";
import { TeamBadges } from "../components/Badges";

export default function PerformancePage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "savings" ? 1 : 0;
  const [days, setDays] = useState(30);

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, mb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Performans</Typography>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
          <ToggleButton value={7}>7 gün</ToggleButton>
          <ToggleButton value={30}>30 gün</ToggleButton>
          <ToggleButton value={90}>90 gün</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" startIcon={<SettingsIcon />} onClick={() => nav("/settings")}>Hedefler ve varsayımlar</Button>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setParams(v ? { tab: "savings" } : {}, { replace: true })} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Hizmet kalitesi" />
        <Tab label="Tasarruf" />
      </Tabs>
      {tab === 0 ? <Quality days={days} /> : <Savings days={days} />}
    </Box>
  );
}

// ---------------------------------------------------------------- SLA + memnuniyet
function Quality({ days }: { days: number }) {
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["quality", days],
    queryFn: async () => (await api.get<QualityT>("/api/performance/quality", { params: { days } })).data,
  });
  if (q.isLoading) return <CircularProgress />;
  if (q.error) return <Alert severity="error">{errorMessage(q.error)}</Alert>;
  const d = q.data!;
  const pctColor = (p: number) => (p >= 90 ? "success.main" : p >= 75 ? "warning.main" : "error.main");

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
        <StatCard icon={<TimerIcon fontSize="small" />} label="İlk yanıt hedefinde" value={`%${d.sla.responsePct}`} color={pctColor(d.sla.responsePct)} sub="SLA süresi içinde yanıt" />
        <StatCard icon={<ShieldIcon fontSize="small" />} label="Çözüm hedefinde" value={`%${d.sla.resolutionPct}`} color={pctColor(d.sla.resolutionPct)} sub="SLA süresi içinde çözüm" />
        <StatCard icon={<StarIcon fontSize="small" />} label="Memnuniyet" value={<>{d.csat.average.toFixed(1)}<Typography component="span" variant="h6" color="text.secondary"> / 5</Typography></>}
          sub={`${d.csat.count} değerlendirme · katılım %${d.csat.responseRate}`} />
        <StatCard label="Şu an dikkat" value={<><Box component="span" sx={{ color: "error.main" }}>{d.sla.openBreached}</Box> · <Box component="span" sx={{ color: "warning.main" }}>{d.sla.openAtRisk}</Box></>}
          sub="aşılan · süresi dolmak üzere" />
      </Box>

      <TeamBadges />

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "3fr 2fr" } }}>
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" sx={{ alignItems: "center", mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>Müdahale bekleyenler</Typography>
              <Button size="small" onClick={() => nav("/tickets?sla=breached")}>Tümünü gör</Button>
            </Stack>
            {d.sla.watch.length === 0 && <Alert severity="success">Riskte ticket yok. 🎉</Alert>}
            <Stack spacing={1}>
              {d.sla.watch.map((w) => (
                <Stack key={w.id} direction="row" spacing={1.5} sx={{ alignItems: "center", p: 1, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{w.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{PRIORITIES[w.priority]} · {w.assigneeName ?? "atanmadı"}</Typography>
                  </Box>
                  <SlaChip sla={{ response: w.response, resolution: w.resolution, responseDueAt: w.responseDueAt, resolutionDueAt: w.resolutionDueAt, firstResponseAt: w.status === "open" ? null : w.createdAt }} />
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Önceliğe göre çözüm hedefi</Typography>
            <HBars max={100} format={(v) => `%${v}`}
              rows={d.sla.byPriority.filter((p) => p.total > 0).map((p) => ({ label: PRIORITIES[p.priority], value: p.pct, note: `${p.total} ticket` }))} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>Haftalık SLA uyumu</Typography>
            <TrendLine labels={d.trend.map((t) => weekLabel(t.week))} values={d.trend.map((t) => t.slaPct)} min={0} max={100} suffix="%" />
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "2fr 3fr" } }}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Puan dağılımı</Typography>
            <HBars color="#f5a623" labelWidth={110} rows={[...d.csat.distribution].reverse().map((r) => ({ label: <Rating size="small" value={r.rating} readOnly max={5} />, value: r.count }))} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>Haftalık ortalama puan</Typography>
            <TrendLine labels={d.trend.map((t) => weekLabel(t.week))} values={d.trend.map((t) => t.csat)} min={1} max={5} color="#f5a623" />
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Çalışanlar ne diyor?</Typography>
            {d.csat.comments.length === 0 && <Typography color="text.secondary">Henüz yorum yok.</Typography>}
            <Stack spacing={1.5}>
              {d.csat.comments.map((c, i) => (
                <Box key={i} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "action.hover", borderLeft: 3, borderColor: c.rating >= 4 ? "success.main" : c.rating === 3 ? "warning.main" : "error.main" }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Rating size="small" value={c.rating} readOnly />
                    <Typography variant="caption" color="text.secondary" noWrap>{c.reporterName} → {c.assigneeName ?? "ekip"} · {c.title}</Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>"{c.comment}"</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Card variant="outlined" sx={{ overflowX: "auto" }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Destek ekibi</Typography>
          <Table size="small" sx={{ minWidth: 560 }}>
            <TableHead><TableRow>
              <TableCell>Kişi</TableCell><TableCell align="right">Çözülen</TableCell><TableCell align="right">SLA uyumu</TableCell>
              <TableCell align="right">Ortanca çözüm süresi</TableCell><TableCell align="right">Memnuniyet</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {d.agents.map((a) => (
                <TableRow key={a.name}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell align="right">{a.resolved}</TableCell>
                  <TableCell align="right"><Box component="span" sx={{ color: pctColor(a.slaPct), fontWeight: 600 }}>%{a.slaPct}</Box></TableCell>
                  <TableCell align="right">{formatDuration(a.medianHours * 60)}</TableCell>
                  <TableCell align="right">{a.csat ? <Chip size="small" icon={<StarIcon sx={{ color: "#f5a623 !important" }} />} label={a.csat.toFixed(1)} /> : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- Tasarruf
function Savings({ days }: { days: number }) {
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["savings", days],
    queryFn: async () => (await api.get<SavingsT>("/api/performance/savings", { params: { days } })).data,
  });
  if (q.isLoading) return <CircularProgress />;
  if (q.error) return <Alert severity="error">{errorMessage(q.error)}</Alert>;
  const d = q.data!;
  const wizardRate = d.wizard.solved + d.wizard.escalated === 0 ? 0 : Math.round((100 * d.wizard.solved) / (d.wizard.solved + d.wizard.escalated));

  return (
    <Stack spacing={3}>
      {/* Yöneticiye tek cümle */}
      <Card sx={{ background: (t) => `linear-gradient(135deg, ${t.palette.success.dark}, ${t.palette.primary.dark})`, color: "#fff" }}>
        <CardContent sx={{ py: 3 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ alignItems: { md: "center" } }}>
            <SavingsIcon sx={{ fontSize: 56, opacity: 0.9 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="overline" sx={{ opacity: 0.85 }}>Son {d.days} günde self-servis sayesinde</Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {d.deflected} sorun ticket açılmadan çözüldü
              </Typography>
              <Typography sx={{ opacity: 0.9, mt: 0.5 }}>
                Destek ekibine <b>{d.supportHoursSaved} saat</b> kazandırıldı (≈ <b>{formatTL(d.moneySaved)}</b>); çalışanlar toplam
                <b> {d.employeeHoursSaved.toLocaleString("tr-TR")} saat</b> çözüm beklemedi.
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
        <StatCard label="Self-servis oranı" value={`%${d.deflectionRate}`} sub={`${d.deflected} çözüldü / ${d.ticketsCreated} ticket açıldı`} color="success.main" />
        <StatCard label="Çözüm sihirbazı" value={d.wizard.solved} sub={`başarı %${wizardRate} · ort. ${d.wizard.avgSteps.toFixed(1)} adımda`} />
        <StatCard label="Makale ile" value={d.bySource.article} sub="'Bu çözdü' denen makaleler" />
        <StatCard label="Asistan ile" value={d.bySource.assistant} sub={`${d.assistantAnswered} soru cevaplandı`} />
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "3fr 2fr" } }}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Haftalık: açılan ticket ve önlenen ticket</Typography>
            <Typography variant="caption" color="text.secondary">Yeşil çizgi yükseldikçe bilgi bankası daha çok işi üstleniyor.</Typography>
            <BarLine labels={d.weekly.map((w) => weekLabel(w.week))} bars={d.weekly.map((w) => w.tickets)} line={d.weekly.map((w) => w.deflected)}
              barLabel="Açılan ticket" lineLabel="Ticket açılmadan çözülen" />
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>En çok işe yarayan makaleler</Typography>
            <HBars color="#36b37e" labelWidth={170} rows={d.topArticles.map((a) => ({ label: <span title={a.title}>{a.title}</span>, value: a.solved }))} />
            <Button size="small" sx={{ mt: 2 }} onClick={() => nav("/insights/gaps")}>Eksik makaleleri bul →</Button>
          </CardContent>
        </Card>
      </Box>

      <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => nav("/settings")}>Değiştir</Button>}>
        Hesap varsayımları: bir ticket ortalama <b>{d.assumptions.minutesPerTicket} dk</b> destek emeği, saatlik maliyet <b>{formatTL(d.assumptions.hourlyCost)}</b>,
        çalışanın çözüm için ortanca bekleme süresi <b>{formatDuration(d.assumptions.medianWaitHours * 60)}</b>.
      </Alert>
    </Stack>
  );
}
