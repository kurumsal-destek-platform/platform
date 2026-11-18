import { Box, Stack, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";

// Küçük, bağımlılıksız grafikler (SVG). Renkler temadan gelir; aydınlık ve karanlık modda okunur.

export function StatCard({ label, value, sub, color, icon }: { label: string; value: ReactNode; sub?: ReactNode; color?: string; icon?: ReactNode }) {
  return (
    <Box sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary" }}>
        {icon}
        <Typography variant="caption" sx={{ fontWeight: 600 }}>{label}</Typography>
      </Stack>
      <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, color, lineHeight: 1.2 }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Box>
  );
}

// Haftalık iki seri: çubuk (ör. açılan ticket) + çizgi (ör. önlenen)
export function BarLine({ labels, bars, line, barLabel, lineLabel, height = 180 }: {
  labels: string[]; bars: number[]; line: (number | null)[]; barLabel: string; lineLabel: string; height?: number;
}) {
  const t = useTheme();
  const W = 560, H = height, pad = { l: 30, r: 10, t: 12, b: 24 };
  const max = Math.max(1, ...bars, ...line.map((v) => v ?? 0));
  const n = labels.length;
  const bw = (W - pad.l - pad.r) / n;
  const x = (i: number) => pad.l + i * bw + bw / 2;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const pts = line.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ");
  return (
    <Box>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${barLabel} ve ${lineLabel}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke={t.palette.divider} />
            <text x={pad.l - 6} y={y(max * f) + 3} fontSize="10" textAnchor="end" fill={t.palette.text.secondary}>{Math.round(max * f)}</text>
          </g>
        ))}
        {bars.map((v, i) => (
          <rect key={i} x={x(i) - bw * 0.3} width={bw * 0.6} y={y(v)} height={Math.max(0, H - pad.b - y(v))} rx={3}
            fill={t.palette.text.disabled} opacity={0.55}><title>{`${labels[i]}: ${v} ${barLabel.toLowerCase()}`}</title></rect>
        ))}
        <polyline points={pts} fill="none" stroke={t.palette.success.main} strokeWidth={2.5} strokeLinejoin="round" />
        {line.map((v, i) => v == null ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={t.palette.success.main}><title>{`${labels[i]}: ${v} ${lineLabel.toLowerCase()}`}</title></circle>
        ))}
        {labels.map((l, i) => (i % Math.ceil(n / 8) === 0 || i === n - 1) && (
          <text key={i} x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill={t.palette.text.secondary}>{l}</text>
        ))}
      </svg>
      <Stack direction="row" spacing={2} sx={{ justifyContent: "center" }}>
        <Legend color={t.palette.text.disabled} label={barLabel} box />
        <Legend color={t.palette.success.main} label={lineLabel} />
      </Stack>
    </Box>
  );
}

// Tek çizgi, sabit aralık (ör. SLA %0-100 veya puan 1-5)
export function TrendLine({ labels, values, min, max, suffix = "", color, height = 140 }: {
  labels: string[]; values: (number | null)[]; min: number; max: number; suffix?: string; color?: string; height?: number;
}) {
  const t = useTheme();
  const c = color ?? t.palette.primary.main;
  const W = 560, H = height, pad = { l: 34, r: 10, t: 10, b: 22 };
  const n = values.length;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, n - 1);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const pts = values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Haftalık eğilim">
      {[min, (min + max) / 2, max].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={t.palette.divider} />
          <text x={pad.l - 6} y={y(v) + 3} fontSize="10" textAnchor="end" fill={t.palette.text.secondary}>{Math.round(v * 10) / 10}{suffix}</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke={c} strokeWidth={2.5} strokeLinejoin="round" />
      {values.map((v, i) => v == null ? null : (
        <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={c}><title>{`${labels[i]}: ${v}${suffix}`}</title></circle>
      ))}
      {labels.map((l, i) => (i % 2 === 0 || i === n - 1) && (
        <text key={i} x={x(i)} y={H - 5} fontSize="10" textAnchor="middle" fill={t.palette.text.secondary}>{l}</text>
      ))}
    </svg>
  );
}

// Yatay oran çubukları (ör. 1-5 yıldız dağılımı, öncelik bazında SLA)
export function HBars({ rows, max, color, format, labelWidth = 76 }: {
  rows: { label: ReactNode; value: number; note?: string }[]; max?: number; color?: string; format?: (v: number) => string; labelWidth?: number;
}) {
  const t = useTheme();
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <Stack spacing={1}>
      {rows.map((r, i) => (
        <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box sx={{ width: labelWidth, flexShrink: 0, minWidth: 0 }}><Typography variant="body2" component="div" noWrap>{r.label}</Typography></Box>
          <Box sx={{ flex: 1, height: 10, borderRadius: 5, bgcolor: "action.hover", overflow: "hidden" }}>
            <Box sx={{ width: `${(r.value / m) * 100}%`, height: "100%", borderRadius: 5, bgcolor: color ?? t.palette.primary.main, transition: "width .4s" }} />
          </Box>
          <Typography variant="body2" sx={{ width: 64, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {format ? format(r.value) : r.value}
          </Typography>
          {r.note && <Typography variant="caption" color="text.secondary" sx={{ width: 60 }}>{r.note}</Typography>}
        </Stack>
      ))}
    </Stack>
  );
}

function Legend({ color, label, box }: { color: string; label: string; box?: boolean }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Box sx={box ? { width: 10, height: 10, borderRadius: 0.5, bgcolor: color, opacity: 0.55 } : { width: 16, borderTop: `2.5px solid ${color}` }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Stack>
  );
}

export const weekLabel = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
