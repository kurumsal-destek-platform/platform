import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Avatar, Box, Button, Divider, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip, Typography,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/HomeOutlined";
import FolderIcon from "@mui/icons-material/FolderOutlined";
import SupportIcon from "@mui/icons-material/SupportAgentOutlined";
import BookIcon from "@mui/icons-material/MenuBookOutlined";
import ChatIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AddIcon from "@mui/icons-material/Add";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../auth";

const NAV = [
  { to: "/", label: "Sizin için", icon: <HomeIcon /> },
  { to: "/projects", label: "Projeler", icon: <FolderIcon /> },
  { to: "/tickets", label: "Ticketlar", icon: <SupportIcon /> },
  { to: "/kb", label: "Bilgi bankası", icon: <BookIcon /> },
  { to: "/assistant", label: "Asistan", icon: <ChatIcon /> },
];

export const initials = (name?: string | null) =>
  (name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* Sol menü */}
      <Box sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: "divider", p: 1.5, display: "flex", flexDirection: "column" }}>
        <Typography variant="h6" sx={{ px: 1, py: 1, fontWeight: 700 }}>
          ◆ Destek Platformu
        </Typography>
        <Typography variant="caption" sx={{ px: 1, color: "text.secondary" }}>{user?.tenantName}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ my: 2 }} onClick={() => nav("/tickets/new")}>
          Ticket oluştur
        </Button>
        <List dense sx={{ flex: 1 }}>
          {NAV.map((n) => (
            <ListItemButton key={n.to} component={NavLink} to={n.to} end={n.to === "/"}
              sx={{ borderRadius: 1, "&.active": { bgcolor: "action.selected", color: "primary.main" } }}>
              <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} />
            </ListItemButton>
          ))}
        </List>
        <Divider sx={{ my: 1 }} />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 1 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: "#f79233", fontSize: 13 }}>{initials(user?.fullName)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap>{user?.fullName}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{user?.role}</Typography>
          </Box>
          <Tooltip title="Çıkış yap">
            <Button size="small" color="inherit" onClick={() => { logout(); nav("/login"); }}><LogoutIcon fontSize="small" /></Button>
          </Tooltip>
        </Stack>
      </Box>

      {/* İçerik */}
      <Box sx={{ flex: 1, p: 3, minWidth: 0 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
