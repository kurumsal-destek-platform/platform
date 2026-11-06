import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Chip, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../auth";
import { errorMessage } from "../api";

// Demo için hızlı giriş butonları (şifre: Demo123!)
const DEMO = [
  { email: "yonetici@anka.com", label: "Anka yöneticisi" },
  { email: "ayse@anka.com", label: "Ayşe" },
  { email: "mehmet@anka.com", label: "Mehmet" },
  { email: "yonetici@mavi.com", label: "Mavi yöneticisi" },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e?: FormEvent, em = email, pw = password) => {
    e?.preventDefault();
    setBusy(true); setError("");
    try {
      await login(em, pw);
      nav("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
      <Card sx={{ width: 400, maxWidth: "100%" }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>◆ Destek Platformu</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>Hesabınıza giriş yapın</Typography>
          <form onSubmit={submit}>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus fullWidth />
              <TextField label="Şifre" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
              <Button type="submit" variant="contained" size="large" disabled={busy}>Giriş yap</Button>
            </Stack>
          </form>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3, mb: 1 }}>
            Demo hesapları (şifre: Demo123!)
          </Typography>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            {DEMO.map((d) => (
              <Chip key={d.email} label={d.label} onClick={() => submit(undefined, d.email, "Demo123!")} />
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
