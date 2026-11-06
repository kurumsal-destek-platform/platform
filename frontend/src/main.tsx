import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { AuthProvider } from "./auth";
import App from "./App";

// Jira'ya benzer koyu tema
const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#579dff" },
    background: { default: "#1d2125", paper: "#22272b" },
  },
  shape: { borderRadius: 6 },
  typography: { fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif", button: { textTransform: "none" } },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
