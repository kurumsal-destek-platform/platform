import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Card, CardActionArea, CardContent, Chip, Stack, Typography, alpha } from "@mui/material";
import AddIcon from "@mui/icons-material/AddCircleOutlined";
import ForumIcon from "@mui/icons-material/ForumOutlined";
import BookIcon from "@mui/icons-material/MenuBookOutlined";
import { api, TICKET_STATUSES, type Project, type Ticket, type WorkItem } from "../api";
import { useAuth } from "../auth";
import { StatusChip, TypeIcon } from "../components/common";

const greeting = () => { const h = new Date().getHours(); return h < 6 ? "İyi geceler" : h < 12 ? "Günaydın" : h < 18 ? "İyi günler" : "İyi akşamlar"; };
const QUICK = [
  { to: "/tickets/new", title: "Yeni talep", hint: "Bir sorunu destek ekibine iletin", icon: <AddIcon />, color: "#e0694a" },
  { to: "/assistant", title: "Soru sor", hint: "Önce hızlı bir cevap deneyin", icon: <ForumIcon />, color: "#1d6b63" },
  { to: "/kb", title: "Bilgi bankası", hint: "Rehberler ve sık sorulanlar", icon: <BookIcon />, color: "#3b78a8" },
];

// Ana sayfa: bana atanan görevler + ticketlarım
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
      <Typography variant="h4" sx={{ fontSize: { xs: 26, md: 30 } }}>{greeting()}, {user?.fullName.split(" ")[0]}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Bugün ne yapmak istersiniz?</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2, mb: 3 }}>
        {QUICK.map((q) => (
          <Card key={q.to} sx={{ "&:hover": { borderColor: q.color, boxShadow: `0 6px 20px ${alpha(q.color, 0.15)}` } }}>
            <CardActionArea onClick={() => nav(q.to)} sx={{ p: 2.25, height: "100%" }}>
              <Stack direction="row" spacing={1.75} sx={{ alignItems: "center" }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 3, display: "grid", placeItems: "center", flexShrink: 0,
                  bgcolor: alpha(q.color, 0.12), color: q.color }}>{q.icon}</Box>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>{q.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{q.hint}</Typography>
                </Box>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
      <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Bana atananlar ({myItems.data?.length ?? 0})</Typography>
            {myItems.data?.length === 0 && <Typography color="text.secondary">Üzerinizde açık görev yok.</Typography>}
            {myItems.data?.map((w) => (
              <Stack key={w.id} direction="row" spacing={1} onClick={() => nav(`/projects/${w.projectKey}?item=${w.key}`)}
                sx={{ alignItems: "center", py: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, px: 1, borderRadius: 1 }}>
                <TypeIcon type={w.type} />
                <Typography variant="body2" color="primary">{w.key}</Typography>
                <Typography variant="body2" sx={{ flex: 1 }}>{w.title}</Typography>
                <StatusChip status={w.status} />
              </Stack>
            ))}
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Taleplerim ({tickets.data?.length ?? 0})</Typography>
            {tickets.data?.length === 0 && <Typography color="text.secondary">Henüz talebiniz yok. Bir sorun olursa “Yeni talep” ile başlayın.</Typography>}
            {tickets.data?.slice(0, 8).map((t) => (
              <Stack key={t.id} direction="row" spacing={1} onClick={() => nav(`/tickets?open=${t.id}`)}
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
