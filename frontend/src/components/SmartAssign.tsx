import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Box, Button, Card, Chip, LinearProgress, Skeleton, Stack, Typography } from "@mui/material";
import AutoIcon from "@mui/icons-material/AutoAwesome";
import { api, errorMessage, type AssignSuggestion, type Ticket } from "../api";
import { initials } from "./Layout";

// "Bunu en iyi kim çözer?" — geçmiş çözümler + hız + mevcut iş yükü
export default function SmartAssign({ ticket, onAssigned }: { ticket: Ticket; onAssigned: (name: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["assignSuggest", ticket.id],
    queryFn: async () => (await api.get<AssignSuggestion[]>(`/api/tickets/${ticket.id}/assign-suggestions`)).data,
  });
  const assign = useMutation({
    mutationFn: async (s: AssignSuggestion) => { await api.put(`/api/tickets/${ticket.id}/assignee`, { assigneeId: s.userId }); return s; },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["allTickets"] });
      qc.invalidateQueries({ queryKey: ["myTickets"] });
      qc.invalidateQueries({ queryKey: ["assignSuggest"] });
      onAssigned(s.fullName);
    },
  });

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <AutoIcon color="primary" fontSize="small" />
        <Typography variant="subtitle2">Akıllı atama önerisi</Typography>
        <Typography variant="caption" color="text.secondary">geçmiş çözümler, hız ve iş yüküne göre</Typography>
      </Stack>
      {q.isLoading && <Skeleton variant="rounded" height={90} />}
      {q.error && <Alert severity="error">{errorMessage(q.error)}</Alert>}
      {assign.error && <Alert severity="error" sx={{ mb: 1 }}>{errorMessage(assign.error)}</Alert>}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
        {q.data?.map((s) => {
          const current = ticket.assigneeId === s.userId;
          return (
            <Card key={s.userId} variant="outlined" sx={{ flex: 1, p: 1.5, borderColor: s.best ? "primary.main" : undefined, borderWidth: s.best ? 2 : 1 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Avatar sx={{ width: 30, height: 30, fontSize: 12, bgcolor: "#f79233" }}>{initials(s.fullName)}</Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{s.fullName}</Typography>
                  {s.best && <Chip size="small" color="primary" label="En uygun" sx={{ height: 18, fontSize: 11 }} />}
                </Box>
                <Typography variant="h6" color={s.best ? "primary" : "text.secondary"}>%{s.match}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={s.match} sx={{ my: 1, height: 4, borderRadius: 2 }} />
              <Stack spacing={0.25} sx={{ mb: 1 }}>
                {s.reasons.map((r) => <Typography key={r} variant="caption" color="text.secondary">• {r}</Typography>)}
              </Stack>
              <Button size="small" fullWidth variant={s.best ? "contained" : "outlined"} disabled={current || assign.isPending}
                onClick={() => assign.mutate(s)}>
                {current ? "Atanmış" : "Ata"}
              </Button>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
