import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Avatar, Box, Button, Divider, Drawer, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Stack, Tooltip, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/HomeOutlined";
import FolderIcon from "@mui/icons-material/FolderOutlined";
import SupportIcon from "@mui/icons-material/SupportAgentOutlined";
import BookIcon from "@mui/icons-material/MenuBookOutlined";
import ChatIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AddIcon from "@mui/icons-material/Add";
import LogoutIcon from "@mui/icons-material/Logout";
import DashboardIcon from "@mui/icons-material/InsightsOutlined";
import IncidentIcon from "@mui/icons-material/CampaignOutlined";
import RadarIcon from "@mui/icons-material/Radar";
import PeopleIcon from "@mui/icons-material/PeopleOutlined";
import SpeedIcon from "@mui/icons-material/SpeedOutlined";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import MonitorIcon from "@mui/icons-material/MonitorHeartOutlined";
import BoltIcon from "@mui/icons-material/BoltOutlined";
import TopBar from "./TopBar";
import CommandPalette from "./CommandPalette";
import WelcomeTour from "./WelcomeTour";
import ErrorBoundary from "./ErrorBoundary";
import { useAuth } from "../auth";
import { isManagerRole, isSupportRole, ROLE_LABEL } from "../api";
import { useLiveUpdates } from "../live";

const WIDTH = 248;
type NavItem = { to: string; label: string; icon: React.ReactNode };

const WORK: NavItem[] = [
  { to: "/", label: "Sizin için", icon: <HomeIcon /> },
  { to: "/projects", label: "Projeler", icon: <FolderIcon /> },
  { to: "/tickets", label: "Ticketlar", icon: <SupportIcon /> },
  { to: "/kb", label: "Bilgi bankası", icon: <BookIcon /> },
  { to: "/assistant", label: "Asistan", icon: <ChatIcon /> },
];
// Destek uzmanı + yöneticiler
const SUPPORT: NavItem[] = [
  { to: "/incidents", label: "Büyük olaylar", icon: <IncidentIcon /> },
  { to: "/insights/gaps", label: "Bilgi boşlukları", icon: <RadarIcon /> },
];
// Sadece yönetici/admin
const MANAGE: NavItem[] = [
  { to: "/dashboard", label: "Gösterge paneli", icon: <DashboardIcon /> },
  { to: "/performance", label: "Performans", icon: <SpeedIcon /> },
  { to: "/users", label: "Kullanıcılar", icon: <PeopleIcon /> },
  { to: "/automation", label: "Otomasyon", icon: <BoltIcon /> },
  { to: "/settings", label: "Hedefler ve ayarlar", icon: <SettingsIcon /> },
  { to: "/system", label: "Sistem ve denetim", icon: <MonitorIcon /> },
];

export const initials = (name?: string | null) =>
  (name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const live = useLiveUpdates(user?.id);
  const isManager = isManagerRole(user?.role);
  const isSupport = isSupportRole(user?.role);

  useEffect(() => { setDrawer(false); }, [loc.pathname]);

  // Klavye kısayolları: Ctrl/⌘+K komut paleti, "c" yeni ticket (yazı alanında değilken)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "c") { e.preventDefault(); nav("/tickets/new"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const navList = (items: NavItem[]) => items.map((n) => (
    <ListItemButton key={n.to} component={NavLink} to={n.to} end={n.to === "/"}
      sx={{ borderRadius: 1.5, mb: 0.25, "&.active": { bgcolor: "action.selected", color: "primary.main", fontWeight: 600 } }}>
      <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>{n.icon}</ListItemIcon>
      <ListItemText primary={n.label} slotProps={{ primary: { variant: "body2", sx: { fontWeight: "inherit" } } }} />
    </ListItemButton>
  ));

  const sidebar = (
    <Box sx={{ width: WIDTH, p: 1.5, display: "flex", flexDirection: "column", height: "100%" }}>
      <Typography variant="h6" sx={{ px: 1, pt: 1, fontWeight: 800, letterSpacing: -0.3 }}>
        <Box component="span" sx={{ color: "primary.main" }}>◆</Box> Destek Platformu
      </Typography>
      <Typography variant="caption" sx={{ px: 1, color: "text.secondary" }}>{user?.tenantName}</Typography>
      <Button variant="contained" startIcon={<AddIcon />} sx={{ my: 2 }} onClick={() => nav("/tickets/new")}>
        Ticket oluştur
        <Box component="kbd" sx={{ ml: "auto", pl: 1, fontSize: 11, opacity: 0.7, fontFamily: "inherit" }}>C</Box>
      </Button>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <List dense disablePadding>{navList(WORK)}</List>
        {isSupport && (
          <List dense disablePadding subheader={<ListSubheader disableSticky sx={{ bgcolor: "transparent", lineHeight: "32px", mt: 1 }}>Destek</ListSubheader>}>
            {navList(SUPPORT)}
          </List>
        )}
        {isManager && (
          <List dense disablePadding subheader={<ListSubheader disableSticky sx={{ bgcolor: "transparent", lineHeight: "32px", mt: 1 }}>Yönetim</ListSubheader>}>
            {navList(MANAGE)}
          </List>
        )}
      </Box>
      <Divider sx={{ my: 1 }} />
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 1 }}>
        <Box component={NavLink} to="/profile" title="Profil"
          sx={{ display: "flex", gap: 1, alignItems: "center", flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: "#f79233", fontSize: 13 }}>{initials(user?.fullName)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap>{user?.fullName}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{ROLE_LABEL[user?.role ?? ""] ?? user?.role}</Typography>
          </Box>
        </Box>
        <Tooltip title="Çıkış yap">
          <Button size="small" color="inherit" sx={{ minWidth: 36 }} onClick={() => { logout(); nav("/login"); }}><LogoutIcon fontSize="small" /></Button>
        </Tooltip>
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {mobile ? (
        <Drawer open={drawer} onClose={() => setDrawer(false)}>{sidebar}</Drawer>
      ) : (
        <Box sx={{ width: WIDTH, flexShrink: 0, borderRight: 1, borderColor: "divider", position: "sticky", top: 0, height: "100vh" }}>{sidebar}</Box>
      )}
      <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, minWidth: 0 }}>
        <TopBar onMenu={mobile ? () => setDrawer(true) : undefined} onPalette={() => setPalette(true)} live={live} />
        <ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary>
      </Box>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <WelcomeTour />
    </Box>
  );
}
