import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge, Box, Button, ClickAwayListener, Divider, IconButton, InputAdornment, List, ListItemButton, ListItemText,
  Paper, Popover, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import BellIcon from "@mui/icons-material/NotificationsNoneOutlined";
import { api, statusLabel, timeAgo, type NotificationT, type SearchResult } from "../api";
import { TypeIcon } from "./common";

export default function TopBar() {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 3 }}>
      <GlobalSearch />
      <Box sx={{ flex: 1 }} />
      <NotificationBell />
    </Stack>
  );
}

function GlobalSearch() {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const res = useQuery({
    queryKey: ["search", q],
    queryFn: async () => (await api.get<SearchResult>("/api/search", { params: { q } })).data,
    enabled: q.length >= 2,
  });
  const go = (to: string) => { setOpen(false); setText(""); nav(to); };
  const empty = res.data && !res.data.items.length && !res.data.tickets.length && !res.data.articles.length;

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: "relative", width: 480, maxWidth: "100%" }}>
        <TextField size="small" fullWidth placeholder="Ara: görev anahtarı (ANK-3), başlık, ticket, makale…"
          value={text} onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        {open && q.length >= 2 && (
          <Paper elevation={8} sx={{ position: "absolute", top: 44, left: 0, right: 0, zIndex: 20, maxHeight: 420, overflowY: "auto" }}>
            {empty && <Typography sx={{ p: 2 }} color="text.secondary">Sonuç bulunamadı.</Typography>}
            {!!res.data?.items.length && <Section title="İş öğeleri" />}
            {res.data?.items.map((i) => (
              <ListItemButton key={i.key} onClick={() => go(`/projects/${i.projectKey}?item=${i.key}`)}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", width: "100%" }}>
                  <TypeIcon type={i.type} />
                  <Typography variant="body2" color="primary">{i.key}</Typography>
                  <Typography variant="body2" sx={{ flex: 1 }} noWrap>{i.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{statusLabel(i.status)}</Typography>
                </Stack>
              </ListItemButton>
            ))}
            {!!res.data?.tickets.length && <Section title="Ticketlar" />}
            {res.data?.tickets.map((t) => (
              <ListItemButton key={t.id} onClick={() => go("/tickets")}>
                <ListItemText primary={t.title} slotProps={{ primary: { variant: "body2" } }} />
              </ListItemButton>
            ))}
            {!!res.data?.articles.length && <Section title="Bilgi bankası" />}
            {res.data?.articles.map((a) => (
              <ListItemButton key={a.id} onClick={() => go("/kb")}>
                <ListItemText primary={a.title} secondary={a.category} slotProps={{ primary: { variant: "body2" } }} />
              </ListItemButton>
            ))}
          </Paper>
        )}
      </Box>
    </ClickAwayListener>
  );
}

function Section({ title }: { title: string }) {
  return <Typography variant="caption" sx={{ display: "block", px: 2, pt: 1.5, pb: 0.5, color: "text.secondary", fontWeight: 700 }}>{title.toUpperCase()}</Typography>;
}

function NotificationBell() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  // 15 saniyede bir yeni bildirim var mı bak
  const notes = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<{ unread: number; items: NotificationT[] }>("/api/notifications")).data,
    refetchInterval: 15000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api.post("/api/notifications/read-all"), onSuccess: refresh });

  const open = (n: NotificationT) => {
    if (!n.isRead) read.mutate(n.id);
    setAnchor(null);
    if (n.link) nav(n.link);
  };

  return (
    <>
      <Tooltip title="Bildirimler">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)}>
          <Badge badgeContent={notes.data?.unread ?? 0} color="error"><BellIcon /></Badge>
        </IconButton>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <Box sx={{ width: 380 }}>
          <Stack direction="row" sx={{ alignItems: "center", px: 2, py: 1.5 }}>
            <Typography sx={{ fontWeight: 700, flex: 1 }}>Bildirimler</Typography>
            <Button size="small" disabled={!notes.data?.unread} onClick={() => readAll.mutate()}>Tümünü okundu yap</Button>
          </Stack>
          <Divider />
          {!notes.data?.items.length && <Typography sx={{ p: 2 }} color="text.secondary">Bildiriminiz yok.</Typography>}
          <List dense disablePadding sx={{ maxHeight: 420, overflowY: "auto" }}>
            {notes.data?.items.map((n) => (
              <ListItemButton key={n.id} onClick={() => open(n)} sx={{ alignItems: "flex-start", bgcolor: n.isRead ? undefined : "action.hover" }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: n.isRead ? "transparent" : "primary.main", mt: 1, mr: 1.5, flexShrink: 0 }} />
                <ListItemText primary={n.title}
                  secondary={<>{n.body}<br />{timeAgo(n.createdAt)}</>}
                  slotProps={{ primary: { variant: "body2", sx: { fontWeight: n.isRead ? 400 : 600 } } }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Popover>
    </>
  );
}
