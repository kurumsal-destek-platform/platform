import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { api, TICKET_STATUSES, type Project, type Ticket, type WorkItem } from "../api";
import { useAuth } from "../auth";
import { StatusChip, TypeIcon } from "../components/common";

// "Sizin için": bana atanan görevler + ticketlarım
export default function HomePage() {
  const { user } = useAuth();
  const nav = useNavigate();

  const myItems = useQuery({
    queryKey: ["myItems"],
    queryFn: async () => {
      const projects = (await api.get<Project[]>("/api/projects")).data;
      const lists = await Promise.all(projects.map((p) =>
        api.get<WorkItem[]>(`/api/projects/${p.key}/items`, { params: { assigneeId: user!.id } })
          .then((r) => r.data.map((w) => ({ ...w, projectKey: p.key, projectName: p.name })))));
      return lists.flat().filter((w) => w.status !== "done");
    },
  });
  const tickets = useQuery({ queryKey: ["myTickets"], queryFn: async () => (await api.get<Ticket[]>("/api/tickets/mine")).data });

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Merhaba, {user?.fullName.split(" ")[0]} 👋</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>{user?.tenantName}</Typography>
      <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Bana atananlar ({myItems.data?.length ?? 0})</Typography>
            {myItems.data?.length === 0 && <Typography color="text.secondary">Açık göreviniz yok.</Typography>}
            {myItems.data?.map((w) => (
              <Stack key={w.id} direction="row" spacing={1} onClick={() => nav(`/projects/${w.projectKey}`)}
                sx={{ alignItems: "center", py: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, px: 1, borderRadius: 1 }}>
                <TypeIcon type={w.type} />
                <Typography variant="body2" color="primary">{w.key}</Typography>
                <Typography variant="body2" sx={{ flex: 1 }}>{w.title}</Typography>
                <StatusChip status={w.status} />
              </Stack>
            ))}
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Ticketlarım ({tickets.data?.length ?? 0})</Typography>
            {tickets.data?.length === 0 && <Typography color="text.secondary">Ticketınız yok.</Typography>}
            {tickets.data?.slice(0, 8).map((t) => (
              <Stack key={t.id} direction="row" spacing={1} onClick={() => nav("/tickets")}
                sx={{ alignItems: "center", py: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, px: 1, borderRadius: 1 }}>
                <Typography variant="body2" sx={{ flex: 1 }}>{t.title}</Typography>
                <Chip size="small" label={TICKET_STATUSES[t.status] ?? t.status} variant="outlined" />
              </Stack>
            ))}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
