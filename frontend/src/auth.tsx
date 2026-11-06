import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { api, tokenStore, type Me } from "./api";

interface AuthCtx {
  user: Me | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  // Sayfa yenilenince token varsa kullanıcıyı geri yükle.
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get<Me>("/api/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: Me }>("/api/auth/login", { email, password });
    tokenStore.set(r.data.token);
    setUser(r.data.user);
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  if (loading)
    return <Box sx={{ display: "grid", placeItems: "center", height: "100vh" }}><CircularProgress /></Box>;

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}
