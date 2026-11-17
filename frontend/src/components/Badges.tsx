import { useQuery } from "@tanstack/react-query";
import { Box, Stack, Typography } from "@mui/material";
import { api } from "../api";

export interface BadgeT { userId: string; name?: string; emoji: string; title: string; detail: string }

export function useBadges() {
  return useQuery({ queryKey: ["badges"], queryFn: async () => (await api.get<BadgeT[]>("/api/performance/badges")).data, staleTime: 60000 });
}

function BadgeCard({ b, showName }: { b: BadgeT; showName?: boolean }) {
  return (
    <Box sx={{
      p: 1.5, borderRadius: 2, border: 1, borderColor: "divider", bgcolor: "background.paper", minWidth: 0,
      display: "flex", gap: 1.5, alignItems: "center",
      transition: "transform .15s, box-shadow .15s", "&:hover": { transform: "translateY(-2px)", boxShadow: 3 },
    }}>
      <Box sx={{ fontSize: 30, lineHeight: 1, width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: "50%", bgcolor: "action.hover", flexShrink: 0 }}>
        {b.emoji}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{b.title}{showName && b.name ? ` · ${b.name}` : ""}</Typography>
        <Typography variant="caption" color="text.secondary">{b.detail}</Typography>
      </Box>
    </Box>
  );
}

// Performans sayfası: "Bu ayın yıldızları"
export function TeamBadges() {
  const q = useBadges();
  if (!q.data?.length) return null;
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>🏆 Son 30 günün yıldızları</Typography>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" } }}>
        {q.data.map((b, i) => <BadgeCard key={i} b={b} showName />)}
      </Box>
    </Box>
  );
}

// Profil: kişinin kendi rozetleri
export function MyBadges({ userId }: { userId?: string }) {
  const q = useBadges();
  const mine = q.data?.filter((b) => b.userId === userId) ?? [];
  if (!mine.length) return null;
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Rozetleriniz</Typography>
      {mine.map((b, i) => <BadgeCard key={i} b={b} />)}
    </Stack>
  );
}
