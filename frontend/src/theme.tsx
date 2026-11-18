import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CssBaseline, ThemeProvider, createTheme, useMediaQuery } from "@mui/material";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "kdp_theme";
const read = (): ThemeMode => { try { return (localStorage.getItem(KEY) as ThemeMode) || "system"; } catch { return "system"; } };

const Ctx = createContext<{ mode: ThemeMode; resolved: "light" | "dark"; setMode: (m: ThemeMode) => void; toggle: () => void }>(null!);
export const useThemeMode = () => useContext(Ctx);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [mode, setModeState] = useState<ThemeMode>(read);
  const resolved: "light" | "dark" = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
  const setMode = (m: ThemeMode) => { setModeState(m); try { localStorage.setItem(KEY, m); } catch { /* tarayıcı izin vermezse sadece bu oturum */ } };
  const toggle = () => setMode(resolved === "dark" ? "light" : "dark");
  useEffect(() => { document.documentElement.style.colorScheme = resolved; }, [resolved]);

  const theme = useMemo(() => createTheme({
    palette: resolved === "dark"
      ? { mode: "dark", primary: { main: "#579dff" }, background: { default: "#1d2125", paper: "#22272b" }, divider: "rgba(255,255,255,0.09)" }
      : { mode: "light", primary: { main: "#0c66e4" }, background: { default: "#f7f8f9", paper: "#ffffff" }, text: { primary: "#172b4d", secondary: "#44546f" }, divider: "#dcdfe4" },
    shape: { borderRadius: 6 },
    typography: { fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif", button: { textTransform: "none", fontWeight: 600 } },
    components: {
      MuiCard: { defaultProps: { elevation: 0 } },
      MuiTooltip: { defaultProps: { arrow: true } },
      MuiButton: { defaultProps: { disableElevation: true } },
    },
  }), [resolved]);

  return (
    <Ctx.Provider value={{ mode, resolved, setMode, toggle }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </Ctx.Provider>
  );
}
