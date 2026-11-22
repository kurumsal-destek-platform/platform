import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CssBaseline, ThemeProvider, alpha, createTheme, useMediaQuery } from "@mui/material";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "kdp_theme";
const read = (): ThemeMode => { try { return (localStorage.getItem(KEY) as ThemeMode) || "system"; } catch { return "system"; } };

const Ctx = createContext<{ mode: ThemeMode; resolved: "light" | "dark"; setMode: (m: ThemeMode) => void; toggle: () => void }>(null!);
export const useThemeMode = () => useContext(Ctx);

// Renk paleti: "çam yeşili + mercan". Sakin, sıcak bir zemin; dikkat isteyen yerlerde mercan vurgusu.
// Göz yormaması için saf beyaz/siyah yerine kâğıt tonları kullanılıyor.
export const BRAND = {
  pine: "#1d6b63", pineDark: "#134a44", pineLight: "#e3f0ed",
  coral: "#e0694a", coralLight: "#fdebe5",
  sand: "#f5f3ee", ink: "#22302e",
  sidebar: "#17302d", sidebarDark: "#0f1716",
};

// Kişi avatarları için isimden sabit renk (aynı kişi hep aynı renkte görünür)
const AVATAR = ["#1d6b63", "#e0694a", "#3b78a8", "#8a5a9e", "#c48a1e", "#4f8a4a", "#b5536b", "#5b6b9e"];
export const avatarColor = (name?: string | null) => {
  if (!name) return "#8a9592";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
};

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [mode, setModeState] = useState<ThemeMode>(read);
  const resolved: "light" | "dark" = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
  const setMode = (m: ThemeMode) => { setModeState(m); try { localStorage.setItem(KEY, m); } catch { /* tarayıcı izin vermezse sadece bu oturum */ } };
  const toggle = () => setMode(resolved === "dark" ? "light" : "dark");
  useEffect(() => { document.documentElement.style.colorScheme = resolved; }, [resolved]);

  const theme = useMemo(() => {
    const dark = resolved === "dark";
    const t = createTheme({
      palette: dark
        ? {
            mode: "dark",
            primary: { main: "#5fbfb2", contrastText: "#0f1716" },
            secondary: { main: "#f08a6c", contrastText: "#1a0f0b" },
            success: { main: "#6cc08b" }, warning: { main: "#e8b04a" }, error: { main: "#ef7a6c" }, info: { main: "#6fa8d6" },
            background: { default: "#141b1a", paper: "#1b2423" },
            text: { primary: "#e7ecea", secondary: "#9fb0ac" },
            divider: "rgba(255,255,255,0.08)",
          }
        : {
            mode: "light",
            primary: { main: BRAND.pine, dark: BRAND.pineDark, light: "#3f8f86" },
            secondary: { main: BRAND.coral, contrastText: "#fff" },
            success: { main: "#3d8b5a" }, warning: { main: "#c98a17" }, error: { main: "#c9483b" }, info: { main: "#3b78a8" },
            background: { default: BRAND.sand, paper: "#fffdf9" },
            text: { primary: BRAND.ink, secondary: "#5f6b68" },
            divider: "#e4e0d6",
            action: { hover: "rgba(29,107,99,0.06)", selected: "rgba(29,107,99,0.12)" },
          },
      shape: { borderRadius: 10 },
      typography: {
        fontFamily: "'Plus Jakarta Sans', 'Segoe UI', Roboto, sans-serif",
        h4: { fontWeight: 700, letterSpacing: -0.4 },
        h5: { fontWeight: 700, letterSpacing: -0.3 },
        h6: { fontWeight: 700, letterSpacing: -0.2 },
        subtitle1: { fontWeight: 600 },
        body2: { lineHeight: 1.55 },
        button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
        caption: { lineHeight: 1.45 },
      },
    });
    const line = t.palette.divider;
    t.components = {
      MuiCssBaseline: {
        styleOverrides: {
          body: { WebkitFontSmoothing: "antialiased" },
          "::selection": { background: alpha(t.palette.secondary.main, 0.25) },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": { background: alpha(t.palette.text.primary, 0.18), borderRadius: 8, border: `2px solid ${t.palette.background.default}` },
          "*::-webkit-scrollbar-track": { background: "transparent" },
          code: { background: alpha(t.palette.primary.main, 0.1), padding: "1px 5px", borderRadius: 4, fontSize: "0.9em" },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { border: `1px solid ${line}`, borderRadius: 14, transition: "border-color .15s, box-shadow .15s" } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 10, paddingInline: 16 },
          sizeSmall: { borderRadius: 8, paddingInline: 10 },
          outlined: { borderColor: line },
        },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 10 } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 500 }, sizeSmall: { height: 24 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10, backgroundColor: t.palette.background.paper,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: line },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderWidth: 2 },
          },
        },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 18, border: `1px solid ${line}` } } },
      MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700, fontSize: "1.15rem" } } },
      MuiMenu: { styleOverrides: { paper: { borderRadius: 12, border: `1px solid ${line}`, boxShadow: "0 12px 32px rgba(20,30,28,0.12)" } } },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: { tooltip: { backgroundColor: dark ? "#e7ecea" : BRAND.ink, color: dark ? BRAND.ink : "#fff", fontSize: 12, borderRadius: 8, padding: "6px 10px" }, arrow: { color: dark ? "#e7ecea" : BRAND.ink } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: line },
          head: { fontSize: 12, fontWeight: 600, color: t.palette.text.secondary, textTransform: "uppercase", letterSpacing: 0.4 },
        },
      },
      MuiTableRow: { styleOverrides: { root: { "&.MuiTableRow-hover:hover": { backgroundColor: t.palette.action.hover } } } },
      MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 600, minHeight: 44 } } },
      MuiLinearProgress: { styleOverrides: { root: { borderRadius: 4 } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiListSubheader: { styleOverrides: { root: { fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" } } },
    };
    return t;
  }, [resolved]);

  return (
    <Ctx.Provider value={{ mode, resolved, setMode, toggle }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </Ctx.Provider>
  );
}
