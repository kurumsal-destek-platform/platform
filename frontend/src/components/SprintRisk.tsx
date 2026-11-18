import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, Card, CardContent, Chip, Collapse, Stack, Typography, useTheme } from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";
import WarningIcon from "@mui/icons-material/WarningAmberRounded";
import { api, statusLabel, type SprintRiskT } from "../api";

const LEVEL = {
  low: { color: "success", label: "Düşük risk", text: "Sprint zamanında bitecek gibi görünüyor." },
  medium: { color: "warning", label: "Orta risk", text: "Sprint sıkışık; birkaç önlemle yetişebilir." },
  high: { color: "error", label: "Yüksek risk", text: "Bu hızla sprint bitmeyecek." },
} as const;

// Sprint risk tahmini: tamamlanma tahmini, burndown, riskli işler ve öneriler
export default function SprintRisk({ sprintId, onOpen }: { sprintId: string; onOpen: (key: string) => void }) {
  const [open, setOpen] = useState(true);
  const q = useQuery({
    queryKey: ["sprintRisk", sprintId],
    queryFn: async () => (await api.get<SprintRiskT>(`/api/sprints/${sprintId}/risk`)).data,
  });
  const r = q.data;
  if (!r || !r.available) return null;
  const lv = LEVEL[r.level];

  return (
    <Card variant="outlined" sx={{ mb: 2, borderLeft: 4, borderLeftColor: `${lv.color}.main` }}>
      <CardContent sx={{ pb: "12px !important" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          <InsightsIcon color={lv.color} />
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Sprint tahmini: %{r.completion} tamamlanacak</Typography>
              <Chip size="small" color={lv.color} label={lv.label} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {lv.text} Sürenin %{r.timePct}'i geçti, işin %{r.workPct}'i bitti · {r.done}/{r.total} {r.unit} · {r.daysLeft} gün kaldı
              {r.usedHistory > 0 && ` · son ${r.usedHistory} sprintin hızı da hesaba katıldı`}
            </Typography>
          </Box>
          <Button size="small" onClick={() => setOpen((o) => !o)}>{open ? "Gizle" : "Detay"}</Button>
        </Stack>

        <Collapse in={open}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ mt: 2 }}>
            <Box sx={{ width: { md: 340 }, flexShrink: 0 }}>
              <Burndown data={r.burndown} unit={r.unit} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {r.risks.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Riskli işler</Typography>
                  <Stack spacing={0.75} sx={{ mb: 2 }}>
                    {r.risks.map((k) => (
                      <Box key={k.key}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <WarningIcon fontSize="small" color={k.severity === "high" ? "error" : "warning"} />
                          <Typography variant="body2" sx={{ fontWeight: 600, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                            onClick={() => onOpen(k.key)}>{k.key}</Typography>
                          <Typography variant="body2" noWrap sx={{ flex: 1 }}>{k.title}</Typography>
                          <Chip size="small" variant="outlined" label={statusLabel(k.status)} />
                        </Stack>
                        {k.reasons.map((x) => (
                          <Typography key={x} variant="caption" color="text.secondary" sx={{ display: "block", pl: 3.5 }}>• {x}</Typography>
                        ))}
                      </Box>
                    ))}
                  </Stack>
                </>
              )}
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Öneriler</Typography>
              {r.recommendations.map((x) => <Typography key={x} variant="body2" sx={{ mb: 0.5 }}>💡 {x}</Typography>)}
            </Box>
          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  );
}

// Basit SVG burndown: ideal çizgi, gerçekleşen, tahmin
function Burndown({ data, unit }: { data: SprintRiskT["burndown"]; unit: string }) {
  const t = useTheme();
  const W = 340, H = 170, pad = { l: 30, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.ideal, d.actual ?? 0, d.forecast ?? 0)));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = (key: "ideal" | "actual" | "forecast") =>
    data.map((d, i) => (d[key] == null ? null : `${x(i)},${y(d[key]!)}`)).filter(Boolean).join(" ");
  const fmt = (s: string) => new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  const todayIdx = data.findIndex((d) => d.forecast != null);

  return (
    <Box>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sprint burndown grafiği">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke={t.palette.divider} />
            <text x={pad.l - 4} y={y(max * f) + 3} fontSize="9" textAnchor="end" fill={t.palette.text.secondary}>{Math.round(max * f)}</text>
          </g>
        ))}
        {todayIdx > 0 && <line x1={x(todayIdx)} x2={x(todayIdx)} y1={pad.t} y2={H - pad.b} stroke={t.palette.error.main} strokeDasharray="2 3" />}
        <polyline points={path("ideal")} fill="none" stroke={t.palette.text.disabled} strokeDasharray="4 4" strokeWidth={1.5} />
        <polyline points={path("forecast")} fill="none" stroke={t.palette.warning.main} strokeDasharray="5 3" strokeWidth={2} />
        <polyline points={path("actual")} fill="none" stroke={t.palette.primary.main} strokeWidth={2.5} />
        <text x={pad.l} y={H - 6} fontSize="9" fill={t.palette.text.secondary}>{fmt(data[0].date)}</text>
        <text x={W - pad.r} y={H - 6} fontSize="9" textAnchor="end" fill={t.palette.text.secondary}>{fmt(data[data.length - 1].date)}</text>
      </svg>
      <Stack direction="row" spacing={1.5} sx={{ justifyContent: "center" }}>
        <Legend color={t.palette.primary.main} label="Kalan (gerçek)" />
        <Legend color={t.palette.warning.main} label="Tahmin" dashed />
        <Legend color={t.palette.text.disabled} label="İdeal" dashed />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center" }}>Kalan {unit}</Typography>
    </Box>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <Box sx={{ width: 14, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Stack>
  );
}
