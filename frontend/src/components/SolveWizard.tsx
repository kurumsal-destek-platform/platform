import { useMemo, useState } from "react";
import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/CheckCircleRounded";
import CrossIcon from "@mui/icons-material/CancelOutlined";
import NextIcon from "@mui/icons-material/ArrowForwardRounded";
import BackIcon from "@mui/icons-material/ArrowBackRounded";
import AutoIcon from "@mui/icons-material/AutoFixHighOutlined";

// Makale metnini adımlara böler: "1) ...", "2. ..." satırları adım; öncesi giriş, sonrası not.
export function parseSteps(body: string): { intro: string; steps: string[]; outro: string } {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const isStep = (l: string) => /^\d+\s*[).-]\s*/.test(l);
  const first = lines.findIndex(isStep);
  if (first === -1) {
    // Numara yoksa cümle cümle
    const sents = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
    return { intro: "", steps: sents.length ? sents : [body], outro: "" };
  }
  let last = first;
  lines.forEach((l, i) => { if (isStep(l)) last = i; });
  const all = lines.slice(first, last + 1).filter(isStep).map((l) => l.replace(/^\d+\s*[).-]\s*/, ""));
  // "… ticket açın" gibi yönlendirme satırları adım değildir: nota taşınır
  const escalate = (x: string) => /ticket\s+aç/i.test(x);
  const steps = all.filter((x) => !escalate(x));
  return {
    intro: lines.slice(0, first).join(" "),
    steps: steps.length ? steps : all,
    outro: [...all.filter(escalate), ...lines.slice(last + 1)].join(" "),
  };
}

// Adım adım çözüm rehberi. Çözerse onSolved, hiçbiri işe yaramazsa onEscalate (denenen adımlarla).
export default function SolveWizard({ title, body, onSolved, onEscalate, onCancel }: {
  title: string; body: string;
  onSolved: (stepsTried: number) => void;
  onEscalate: (tried: string[]) => void;
  onCancel: () => void;
}) {
  const { intro, steps, outro } = useMemo(() => parseSteps(body), [body]);
  const [i, setI] = useState(0);
  const last = i === steps.length - 1;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <AutoIcon color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>Birlikte çözelim</Typography>
        <Button size="small" onClick={onCancel}>Kapat</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      {intro && i === 0 && <Typography variant="body2" sx={{ mt: 1 }}>{intro}</Typography>}

      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 2, mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>Adım {i + 1} / {steps.length}</Typography>
        <LinearProgress variant="determinate" value={((i + 1) / steps.length) * 100} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
      </Stack>

      {/* Önceki adımlar: denendi */}
      <Stack spacing={0.5} sx={{ mb: 1 }}>
        {steps.slice(0, i).map((s, k) => (
          <Stack key={k} direction="row" spacing={1} sx={{ alignItems: "flex-start", opacity: 0.6 }}>
            <CrossIcon sx={{ fontSize: 16, mt: 0.3 }} color="disabled" />
            <Typography variant="caption" sx={{ textDecoration: "line-through" }}>{s}</Typography>
          </Stack>
        ))}
      </Stack>

      <Box key={i} sx={{
        p: 2, borderRadius: 2, border: 2, borderColor: "primary.main", bgcolor: "action.hover",
        animation: "wizIn .25s ease-out", "@keyframes wizIn": { from: { opacity: 0, transform: "translateX(12px)" }, to: { opacity: 1, transform: "none" } },
      }}>
        <Typography sx={{ fontSize: 17, lineHeight: 1.5 }}>{steps[i]}</Typography>
      </Box>

      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap", rowGap: 1 }}>
        <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={() => onSolved(i + 1)}>Sorun çözüldü</Button>
        {!last ? (
          <Button variant="outlined" endIcon={<NextIcon />} onClick={() => setI(i + 1)}>Denedim, olmadı</Button>
        ) : (
          <Button variant="outlined" color="warning" onClick={() => onEscalate(steps)}>Hiçbiri işe yaramadı, ticket açayım</Button>
        )}
        {i > 0 && <Button size="small" startIcon={<BackIcon />} onClick={() => setI(i - 1)}>Geri</Button>}
      </Stack>
      {last && outro && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>{outro}</Typography>}
    </Box>
  );
}
