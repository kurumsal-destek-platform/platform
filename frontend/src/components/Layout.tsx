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
import ChatIcon from "@mui/icons-material/ForumOutlined";
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
import QuickReplyIcon from "@mui/icons-material/QuickreplyOutlined";
import TopBar from "./TopBar";
import CommandPalette from "./CommandPalette";
import WelcomeTour from "./WelcomeTour";
import ErrorBoundary from "./ErrorBoundary";
import { useAuth } from "../auth";
import { isManagerRole, isSupportRole, ROLE_LABEL } from "../api";
import { useLiveUpdates } from "../live";
import { BRAND, avatarColor, useThemeMode } from "../theme";

const WIDTH = 248;
type NavItem = { to: string; label: string; icon: React.ReactNode };

const work = (support: boolean): NavItem[] => [
  { to: "/", label: "Ana sayfa", icon: <HomeIcon /> },
  { to: "/tickets", label: support ? "Talepler" : "Taleplerim", icon: <SupportIcon /> },
  { to: "/kb", label: "Bilgi bankası", icon: <BookIcon /> },
  { to: "/assistant", label: "Soru sor", icon: <ChatIcon /> },
  { to: "/projects", label: "Projeler", icon: <FolderIcon /> },
];
// Destek uzmanı + yöneticiler
const SUPPORT: NavItem[] = [
  { to: "/canned", label: "Hazır yanıtlar", icon: <QuickReplyIcon /> },
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
  const { resolved } = useThemeMode();

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

  // Yan menü koyu çam yeşili: içerik alanından net ayrılır, aktif sayfa mercan çizgiyle belli olur
  const navList = (items: NavItem[]) => items.map((n) => (
    <ListItemButton key={n.to} component={NavLink} to={n.to} end={n.to === "/"}
      sx={{
        borderRadius: 2, mb: 0.25, py: 0.75, color: "rgba(231,240,237,0.78)", position: "relative",
        "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#fff" },
        "&.active": { bgcolor: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 600 },
        "&.active::before": { content: '""', position: "absolute", left: -12, top: 8, bottom: 8, width: 4, borderRadius: 4, bgcolor: BRAND.coral },
      }}>
      <ListItemIcon sx={{ minWidth: 34, color: "inherit", "& svg": { fontSize: 20 } }}>{n.icon}</ListItemIcon>
      <ListItemText primary={n.label} slotProps={{ primary: { variant: "body2", sx: { fontWeight: "inherit" } } }} />
    </ListItemButton>
  ));
  const section = (title: string) => (
    <ListSubheader disableSticky sx={{ bgcolor: "transparent", color: "rgba(231,240,237,0.45)", lineHeight: "30px", mt: 2, px: 1.5 }}>{title}</ListSubheader>
  );

  const sidebar = (
    <Box sx={{ width: WIDTH, px: 1.5, py: 2, display: "flex", flexDirection: "column", height: "100%",
      bgcolor: resolved === "dark" ? BRAND.sidebarDark : BRAND.sidebar, color: "#e7f0ed" }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", px: 1 }}>
        <Box component="img" src="/esenn-logo.svg" alt="" sx={{ width: 42, height: 42, flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.1, letterSpacing: 1.5 }}>ESENN</Typography>
          <Typography variant="caption" noWrap sx={{ color: "rgba(231,240,237,0.6)", display: "block" }}>{user?.tenantName}</Typography>
        </Box>
      </Stack>
      <Button variant="contained" color="secondary" startIcon={<AddIcon />} sx={{ my: 2.5, py: 1, justifyContent: "flex-start" }} onClick={() => nav("/tickets/new")}>
        Yeni talep oluştur
        <Box component="kbd" sx={{ ml: "auto", pl: 1, fontSize: 11, opacity: 0.75, fontFamily: "inherit", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 1, px: 0.6, lineHeight: 1.5 }}>C</Box>
      </Button>
      <Box sx={{ flex: 1, overflowY: "auto", mx: -0.5, px: 0.5 }}>
        <List dense disablePadding>{navList(work(isSupport))}</List>
        {isSupport && <List dense disablePadding subheader={section("Destek ekibi")}>{navList(SUPPORT)}</List>}
        {isManager && <List dense disablePadding subheader={section("Yönetim")}>{navList(MANAGE)}</List>}
      </Box>
      <Divider sx={{ my: 1.5, borderColor: "rgba(255,255,255,0.1)" }} />
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 0.5 }}>
        <Box component={NavLink} to="/profile" title="Profilim"
          sx={{ display: "flex", gap: 1.25, alignItems: "center", flex: 1, minWidth: 0, color: "inherit", textDecoration: "none",
            p: 0.75, borderRadius: 2, "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
          <Avatar sx={{ width: 34, height: 34, bgcolor: avatarColor(user?.fullName), fontSize: 13, fontWeight: 700, border: "2px solid rgba(255,255,255,0.2)" }}>{initials(user?.fullName)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{user?.fullName}</Typography>
            <Typography variant="caption" sx={{ color: "rgba(231,240,237,0.65)", display: "block", lineHeight: 1.35 }}>
              {ROLE_LABEL[user?.role ?? ""] ?? user?.role}
              {user?.department && <Box component="span" sx={{ display: "block", color: "rgba(231,240,237,0.5)" }}>{user.department}</Box>}
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Çıkış yap">
          <Button size="small" sx={{ minWidth: 36, color: "rgba(231,240,237,0.7)" }} onClick={() => { logout(); nav("/login"); }}><LogoutIcon fontSize="small" /></Button>
        </Tooltip>
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {mobile ? (
        <Drawer open={drawer} onClose={() => setDrawer(false)}>{sidebar}</Drawer>
      ) : (
        <Box sx={{ width: WIDTH, flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>{sidebar}</Box>
      )}
      <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 4 }, py: { xs: 2, md: 3 }, minWidth: 0, maxWidth: 1440 }}>
        <TopBar onMenu={mobile ? () => setDrawer(true) : undefined} onPalette={() => setPalette(true)} live={live} />
        <ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary>
      </Box>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <WelcomeTour />
    </Box>
  );
}
