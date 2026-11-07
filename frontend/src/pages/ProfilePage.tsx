import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Avatar, Box, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { useAuth } from "../auth";
import { api, errorMessage, type Me } from "../api";
import { initials } from "../components/Layout";
import { PasswordField, PasswordStrength, passwordOk } from "./AuthPages";

const ROLE_TR: Record<string, string> = { Employee: "Çalışan", Manager: "Yönetici", Admin: "Admin" };

export default function ProfilePage() {
  const { user, setSession, logout } = useAuth();
  const nav = useNavigate();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<Me & { lastLoginAt?: string | null }>("/api/auth/me")).data,
  });
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (!passwordOk(next)) { setMsg({ ok: false, text: "Yeni şifre kurallarını sağlamıyor." }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: "Şifreler eşleşmiyor." }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ token: string; user: Me }>("/api/auth/change-password", { currentPassword: cur, newPassword: next });
      setSession(r.data.token, r.data.user, true);
      setCur(""); setNext(""); setConfirm("");
      setMsg({ ok: true, text: "Şifreniz değişti. Diğer cihazlardaki oturumlar kapatıldı." });
    } catch (err) { setMsg({ ok: false, text: errorMessage(err) }); } finally { setBusy(false); }
  };

  const logoutAll = async () => {
    if (!window.confirm("Bu cihaz dahil tüm cihazlardan çıkış yapılacak. Emin misiniz?")) return;
    await api.post("/api/auth/logout-all").catch(() => {});
    logout();
    nav("/login");
  };

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Profil</Typography>
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Avatar sx={{ width: 56, height: 56, bgcolor: "#f79233" }}>{initials(user?.fullName)}</Avatar>
            <Box>
              <Typography variant="h6">{user?.fullName}</Typography>
              <Typography variant="body2" color="text.secondary">{user?.email}</Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.tenantName} · {ROLE_TR[user?.role ?? ""] ?? user?.role}
                {me.data?.lastLoginAt && ` · Son giriş: ${new Date(me.data.lastLoginAt).toLocaleString("tr-TR")}`}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Şifre değiştir</Typography>
          <form onSubmit={change}>
            <Stack spacing={2}>
              {msg && <Alert severity={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
              <PasswordField label="Mevcut şifre" value={cur} onChange={setCur} autoComplete="current-password" />
              <PasswordField label="Yeni şifre" value={next} onChange={setNext} autoComplete="new-password" />
              <PasswordStrength password={next} />
              <PasswordField label="Yeni şifre (tekrar)" value={confirm} onChange={setConfirm} autoComplete="new-password" />
              <Box><Button type="submit" variant="contained" disabled={busy}>Şifreyi değiştir</Button></Box>
            </Stack>
          </form>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Oturumlar</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Hesabınızın başka bir cihazda açık kaldığını düşünüyorsanız tüm oturumları kapatın.
          </Typography>
          <Button color="error" variant="outlined" onClick={logoutAll}>Tüm cihazlardan çıkış yap</Button>
        </CardContent>
      </Card>
    </Box>
  );
}
