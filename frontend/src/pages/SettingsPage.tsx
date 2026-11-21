import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardContent, InputAdornment, MenuItem, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { api, errorMessage, formatDuration, PRIORITIES, type SettingsT } from "../api";
import SettingsExtras from "../components/SettingsExtras";

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: async () => (await api.get<SettingsT>("/api/settings")).data });
  const [f, setF] = useState<SettingsT | null>(null);
  const [toast, setToast] = useState("");
  useEffect(() => { if (q.data) setF(structuredClone(q.data)); }, [q.data]);
  const save = useMutation({
    mutationFn: async () => (await api.put<SettingsT>("/api/settings", f)).data,
    onSuccess: (d) => { qc.setQueryData(["settings"], d); qc.invalidateQueries({ queryKey: ["savings"] }); setToast("Kaydedildi. Yeni SLA hedefleri bundan sonra açılan ticket'lara uygulanır."); },
  });
  if (!f) return q.error ? <Alert severity="error">{errorMessage(q.error)}</Alert> : null;

  const setPolicy = (i: number, key: "responseHours" | "resolutionHours", v: number) =>
    setF({ ...f, policies: f.policies.map((p, j) => (j === i ? { ...p, [key]: v } : p)) });
  const dayHours = f.workEndHour - f.workStartHour;

  return (
    <Box sx={{ maxWidth: 860 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Hedefler ve varsayımlar</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        SLA süreleri mesai saatine göre işler: Cuma 17:00'de açılan 2 saatlik bir iş Pazartesi 10:00'da dolar.
      </Typography>

      <Stack spacing={2}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Mesai saatleri</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
              <TextField select size="small" label="Başlangıç" value={f.workStartHour} onChange={(e) => setF({ ...f, workStartHour: +e.target.value })} sx={{ width: 120 }}>
                {Array.from({ length: 24 }, (_, h) => <MenuItem key={h} value={h}>{String(h).padStart(2, "0")}:00</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Bitiş" value={f.workEndHour} onChange={(e) => setF({ ...f, workEndHour: +e.target.value })} sx={{ width: 120 }}>
                {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <MenuItem key={h} value={h}>{String(h).padStart(2, "0")}:00</MenuItem>)}
              </TextField>
              <ToggleButtonGroup size="small" value={f.workDays} onChange={(_, v: number[]) => v.length && setF({ ...f, workDays: v })}>
                {DAYS.map((d, i) => <ToggleButton key={d} value={i + 1}>{d}</ToggleButton>)}
              </ToggleButtonGroup>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              Günde {dayHours > 0 ? dayHours : "?"} mesai saati, haftada {f.workDays.length} gün.
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ overflowX: "auto" }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>SLA hedefleri (mesai saati)</Typography>
            <Table size="small" sx={{ minWidth: 520 }}>
              <TableHead><TableRow>
                <TableCell>Öncelik</TableCell><TableCell>İlk yanıt</TableCell><TableCell>Çözüm</TableCell><TableCell>Takvimde yaklaşık</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {f.policies.map((p, i) => (
                  <TableRow key={p.priority}>
                    <TableCell sx={{ fontWeight: 600 }}>{PRIORITIES[p.priority]}</TableCell>
                    {(["responseHours", "resolutionHours"] as const).map((k) => (
                      <TableCell key={k}>
                        <TextField size="small" type="number" value={p[k]} onChange={(e) => setPolicy(i, k, +e.target.value)} sx={{ width: 110 }}
                          slotProps={{ input: { endAdornment: <InputAdornment position="end">sa</InputAdornment> }, htmlInput: { min: 0.25, step: 0.25 } }} />
                      </TableCell>
                    ))}
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        çözüm ≈ {dayHours > 0 ? (p.resolutionHours <= dayHours ? formatDuration(p.resolutionHours * 60) : `${Math.ceil(p.resolutionHours / dayHours)} iş günü`) : "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Tasarruf hesabı</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Ticket açılmadan çözülen her sorun bu varsayımlarla saate ve TL'ye çevrilir.</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" type="number" label="Bir ticket'ın destek emeği" value={f.minutesPerTicket}
                onChange={(e) => setF({ ...f, minutesPerTicket: +e.target.value })}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">dk</InputAdornment> } }} />
              <TextField size="small" type="number" label="Destek personeli saatlik maliyeti" value={f.hourlyCost}
                onChange={(e) => setF({ ...f, hourlyCost: +e.target.value })}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">TL</InputAdornment> } }} />
            </Stack>
          </CardContent>
        </Card>

        {save.error && <Alert severity="error">{errorMessage(save.error)}</Alert>}
        <Box><Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>Kaydet</Button></Box>

        <Typography variant="h6" sx={{ fontWeight: 700, pt: 2 }}>Kanallar, bildirimler ve veri</Typography>
        <SettingsExtras />
      </Stack>
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
