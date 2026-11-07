import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Box, Card, CardContent, LinearProgress, Stack, Typography } from "@mui/material";
import { api, statusLabel, TICKET_STATUSES, type Dashboard } from "../api";

const STATUS_COLORS: Record<string, string> = {
  todo: "#8c9bab", in_progress: "#579dff", in_review: "#f5cd47", done: "#4bce97",
  open: "#f87168", assigned: "#f5cd47", resolved: "#4bce97", closed: "#8c9bab",
};

// Yönetici gösterge paneli: grafik kütüphanesi olmadan, basit çubuklarla
export default function DashboardPage() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: async () => (await api.get<Dashboard>("/api/dashboard/summary")).data });

  if (q.isError) return <Alert severity="warning">Gösterge panelini sadece yöneticiler görebilir.</Alert>;
  if (!q.data) return <LinearProgress />;
  const d = q.data;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Gösterge paneli</Typography>

      {/* Üst kartlar */}
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, mb: 2 }}>
        <Kpi label="Açık iş öğesi" value={d.workItems.total - (d.workItems.byStatus.find((s) => s.status === "done")?.count ?? 0)} />
        <Kpi label="Geciken" value={d.workItems.overdue} tone={d.workItems.overdue ? "#f87168" : undefined} />
        <Kpi label="Açık ticket" value={d.tickets.open} />
        <Kpi label="Ort. çözüm süresi" value={d.tickets.avgResolutionHours == null ? "—" : `${d.tickets.avgResolutionHours} sa`} />
        <Kpi label="Ticket açmadan çözülen" value={`%${d.selfService.deflectionRate}`} tone="#4bce97"
          sub={`${d.selfService.solvedWithoutTicket} kişi bilgi bankasıyla çözdü`} />
      </Stack>

      <Stack direction={{ xs: "column", lg: "row" }} spacing={2} sx={{ mb: 2 }}>
        <Panel title="İş öğeleri — durum">
          <Bars rows={d.workItems.byStatus.map((s) => ({ label: statusLabel(s.status), value: s.count, color: STATUS_COLORS[s.status] }))} />
        </Panel>
        <Panel title="Ticketlar — durum">
          <Bars rows={d.tickets.byStatus.map((s) => ({ label: TICKET_STATUSES[s.status] ?? s.status, value: s.count, color: STATUS_COLORS[s.status] }))} />
        </Panel>
        <Panel title="Ticketlar — kategori">
          <Bars rows={d.tickets.byCategory.map((c) => ({ label: c.category, value: c.count }))} />
        </Panel>
      </Stack>

      <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
        <Panel title="Projeler ve aktif sprintler">
          {d.projects.map((p) => {
            const sp = p.activeSprint;
            const pct = sp && sp.points ? Math.round((100 * sp.donePoints) / sp.points) : p.total ? Math.round((100 * p.done) / p.total) : 0;
            return (
              <Box key={p.key} sx={{ mb: 2, cursor: "pointer" }} onClick={() => nav(`/projects/${p.key}`)}>
                <Stack direction="row" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" sx={{ flex: 1 }}><b>{p.key}</b> · {p.name}</Typography>
                  <Typography variant="body2" color="text.secondary">%{pct}</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4 }} />
                <Typography variant="caption" color="text.secondary">
                  {sp
                    ? `${sp.name}: ${sp.donePoints}/${sp.points} puan · bitiş ${new Date(sp.endDate).toLocaleDateString("tr-TR")}`
                    : `Aktif sprint yok · ${p.done}/${p.total} iş tamamlandı`}
                </Typography>
              </Box>
            );
          })}
        </Panel>
        <Panel title="Kişi başı açık iş">
          {d.workItems.unassigned > 0 && (
            <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>{d.workItems.unassigned} iş kimseye atanmamış</Typography>
          )}
          <Bars rows={d.workItems.byAssignee.map((a) => ({ label: a.name, value: a.open, note: `${a.points} puan` }))} />
        </Panel>
      </Stack>
    </Box>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <Card variant="outlined" sx={{ minWidth: 180, flex: 1 }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, color: tone }}>{value}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ flex: 1 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>{title}</Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; color?: string; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Typography variant="body2" color="text.secondary">Veri yok.</Typography>;
  return (
    <Stack spacing={1.2}>
      {rows.map((r) => (
        <Stack key={r.label} direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="body2" sx={{ width: 120, flexShrink: 0 }} noWrap>{r.label}</Typography>
          <Box sx={{ flex: 1, bgcolor: "action.hover", borderRadius: 1, height: 18 }}>
            <Box sx={{ width: `${(100 * r.value) / max}%`, bgcolor: r.color ?? "primary.main", height: "100%", borderRadius: 1, minWidth: r.value ? 4 : 0 }} />
          </Box>
          <Typography variant="body2" sx={{ width: 28, textAlign: "right" }}>{r.value}</Typography>
          {r.note && <Typography variant="caption" color="text.secondary" sx={{ width: 60 }}>{r.note}</Typography>}
        </Stack>
      ))}
    </Stack>
  );
}
