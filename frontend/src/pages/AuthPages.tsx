import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Collapse, FormControlLabel,
  IconButton, InputAdornment, Link, LinearProgress, Stack, TextField, Typography,
} from "@mui/material";
import Visibility from "@mui/icons-material/VisibilityOutlined";
import VisibilityOff from "@mui/icons-material/VisibilityOffOutlined";
import CheckIcon from "@mui/icons-material/CheckCircle";
import DotIcon from "@mui/icons-material/RadioButtonUnchecked";
import { useAuth } from "../auth";
import { api, errorCode, errorMessage, PASSWORD_RULES, type Me } from "../api";

type Session = { token: string; user: Me };

// ---------- Ortak parçalar ----------
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", px: 2, py: 4 }}>
      <Box sx={{ width: "100%", maxWidth: 420 }}>
        <Typography variant="h5" sx={{ textAlign: "center", fontWeight: 700, mb: 3, color: "#0052cc" }}>
          ◆ Destek Platformu
        </Typography>
        <Card variant="outlined" sx={{ boxShadow: "0 1px 3px rgba(9,30,66,.15)" }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ textAlign: "center", mb: subtitle ? 0.5 : 3 }}>{title}</Typography>
            {subtitle && <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mb: 3 }}>{subtitle}</Typography>}
            {children}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export function PasswordField(props: { label: string; value: string; onChange: (v: string) => void; autoComplete?: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <TextField label={props.label} type={show ? "text" : "password"} value={props.value} fullWidth required
      autoComplete={props.autoComplete} autoFocus={props.autoFocus}
      onChange={(e) => props.onChange(e.target.value)}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setShow((s) => !s)} aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}>
                {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }} />
  );
}

export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

// Şifre gücü göstergesi + kural listesi
export function PasswordStrength({ password }: { password: string }) {
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length + (password.length >= 12 ? 1 : 0);
  const pct = (passed / (PASSWORD_RULES.length + 1)) * 100;
  const color = pct < 50 ? "error" : pct < 100 ? "warning" : "success";
  const label = !password ? "" : pct < 50 ? "Zayıf" : pct < 80 ? "Orta" : pct < 100 ? "İyi" : "Güçlü";
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <LinearProgress variant="determinate" value={password ? pct : 0} color={color} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
        <Typography variant="caption" sx={{ width: 44 }}>{label}</Typography>
      </Stack>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5, mt: 1 }}>
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(password);
          return (
            <Stack key={r.label} direction="row" spacing={0.5} sx={{ alignItems: "center", color: ok ? "success.main" : "text.secondary" }}>
              {ok ? <CheckIcon sx={{ fontSize: 14 }} /> : <DotIcon sx={{ fontSize: 14 }} />}
              <Typography variant="caption">{r.label}</Typography>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

// ---------- Giriş ----------
const DEMO = [
  { email: "yonetici@anka.com", label: "Anka yöneticisi" },
  { email: "ayse@anka.com", label: "Ayşe" },
  { email: "mehmet@anka.com", label: "Mehmet" },
  { email: "yonetici@mavi.com", label: "Mavi yöneticisi" },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState<string>();
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(""); setInfo(""); setCode(undefined);
    try {
      await login(email.trim(), password, remember);
      nav("/");
    } catch (err) {
      setError(errorMessage(err));
      setCode(errorCode(err));
    } finally { setBusy(false); }
  };

  const resend = async () => {
    try {
      const r = await api.post<{ message: string }>("/api/auth/resend-verification", { email: email.trim() });
      setError(""); setInfo(r.data.message);
    } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <AuthShell title="Hesabınıza giriş yapın">
      <form onSubmit={submit}>
        <Stack spacing={2}>
          {error && (
            <Alert severity={code === "locked" ? "warning" : "error"}
              action={code === "unverified"
                ? <Button color="inherit" size="small" onClick={resend}>Tekrar gönder</Button>
                : code === "locked"
                  ? <Button color="inherit" size="small" component={RouterLink} to="/forgot-password">Sıfırla</Button>
                  : undefined}>
              {error}
            </Alert>
          )}
          {info && <Alert severity="success">{info}</Alert>}
          <TextField label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="username" autoFocus required fullWidth />
          <PasswordField label="Şifre" value={password} onChange={setPassword} autoComplete="current-password" />
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <FormControlLabel control={<Checkbox size="small" checked={remember} onChange={(e) => setRemember(e.target.checked)} />}
              label={<Typography variant="body2">Beni hatırla</Typography>} />
            <Link component={RouterLink} to="/forgot-password" variant="body2">Şifremi unuttum</Link>
          </Stack>
          <Button type="submit" variant="contained" size="large" disabled={busy}>
            {busy ? <CircularProgress size={22} color="inherit" /> : "Giriş yap"}
          </Button>
          <Typography variant="body2" sx={{ textAlign: "center" }}>
            Şirketiniz kayıtlı değil mi? <Link component={RouterLink} to="/register">Şirket hesabı oluştur</Link>
          </Typography>
        </Stack>
      </form>

      <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: "divider" }}>
        <Link component="button" variant="caption" onClick={() => setShowDemo((s) => !s)}>
          {showDemo ? "Demo hesaplarını gizle" : "Demo hesapları"}
        </Link>
        <Collapse in={showDemo}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Şifre: Demo123!</Typography>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, mt: 1 }}>
            {DEMO.map((d) => (
              <Chip key={d.email} label={d.label} size="small" onClick={() => { setEmail(d.email); setPassword("Demo123!"); }} />
            ))}
          </Stack>
        </Collapse>
      </Box>
    </AuthShell>
  );
}

// ---------- Şirket kaydı ----------
export function RegisterPage() {
  const [f, setF] = useState({ companyName: "", fullName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passwordOk(f.password)) { setError("Şifre kurallarını sağlamıyor."); return; }
    setBusy(true); setError("");
    try {
      const r = await api.post<{ message: string }>("/api/auth/register", f);
      setDone(r.data.message);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  if (done)
    return (
      <AuthShell title="E-postanızı kontrol edin">
        <Alert severity="success" sx={{ mb: 2 }}>{done}</Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <b>{f.email}</b> adresine bir doğrulama bağlantısı gönderdik.
        </Typography>
        <Button fullWidth variant="outlined" component={RouterLink} to="/login">Giriş sayfasına dön</Button>
      </AuthShell>
    );

  return (
    <AuthShell title="Şirket hesabı oluşturun" subtitle="Siz yönetici olursunuz, ekibinizi sonra davet edersiniz.">
      <form onSubmit={submit}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Şirket adı" value={f.companyName} onChange={(e) => set("companyName")(e.target.value)} required fullWidth autoFocus />
          <TextField label="Ad soyad" value={f.fullName} onChange={(e) => set("fullName")(e.target.value)} required fullWidth autoComplete="name" />
          <TextField label="İş e-postası" type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} required fullWidth autoComplete="email" />
          <PasswordField label="Şifre" value={f.password} onChange={set("password")} autoComplete="new-password" />
          <PasswordStrength password={f.password} />
          <Button type="submit" variant="contained" size="large" disabled={busy}>
            {busy ? <CircularProgress size={22} color="inherit" /> : "Hesap oluştur"}
          </Button>
          <Typography variant="body2" sx={{ textAlign: "center" }}>
            Zaten hesabınız var mı? <Link component={RouterLink} to="/login">Giriş yapın</Link>
          </Typography>
        </Stack>
      </form>
    </AuthShell>
  );
}

// ---------- Şifremi unuttum ----------
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api.post<{ message: string }>("/api/auth/forgot-password", { email: email.trim() });
      setSent(r.data.message);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Şifrenizi mi unuttunuz?" subtitle={sent ? undefined : "E-postanızı yazın, size sıfırlama bağlantısı gönderelim."}>
      {sent ? (
        <Stack spacing={2}>
          <Alert severity="success">{sent}</Alert>
          <Typography variant="body2" color="text.secondary">Bağlantı 30 dakika geçerlidir. Gelmediyse spam klasörüne bakın.</Typography>
          <Button variant="outlined" onClick={() => setSent("")}>Tekrar gönder</Button>
          <Button component={RouterLink} to="/login">Giriş sayfasına dön</Button>
        </Stack>
      ) : (
        <form onSubmit={submit}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth autoFocus />
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {busy ? <CircularProgress size={22} color="inherit" /> : "Sıfırlama bağlantısı gönder"}
            </Button>
            <Button component={RouterLink} to="/login">Giriş sayfasına dön</Button>
          </Stack>
        </form>
      )}
    </AuthShell>
  );
}

// ---------- Şifre belirleme (sıfırlama + davet kabulü) ----------
export function SetPasswordPage({ mode }: { mode: "reset" | "invite" }) {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { setSession } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ email: string; fullName: string; tenantName?: string } | null>(null);
  const [invalid, setInvalid] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid("Bağlantıda token yok."); return; }
    api.post("/api/auth/check-token", { token })
      .then((r) => setInfo(r.data))
      .catch((err) => setInvalid(errorMessage(err)));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passwordOk(password)) { setError("Şifre kurallarını sağlamıyor."); return; }
    if (password !== confirm) { setError("Şifreler eşleşmiyor."); return; }
    setBusy(true); setError("");
    try {
      const r = await api.post<Session>("/api/auth/set-password", { token, password });
      setSession(r.data.token, r.data.user, false);
      nav("/");
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  const title = mode === "invite" ? "Davete hoş geldiniz" : "Yeni şifre belirleyin";
  if (invalid)
    return (
      <AuthShell title={title}>
        <Alert severity="error" sx={{ mb: 2 }}>{invalid}</Alert>
        <Button fullWidth variant="contained" component={RouterLink} to={mode === "invite" ? "/login" : "/forgot-password"}>
          {mode === "invite" ? "Giriş sayfasına git" : "Yeni bağlantı iste"}
        </Button>
      </AuthShell>
    );
  if (!info) return <AuthShell title={title}><Box sx={{ textAlign: "center" }}><CircularProgress /></Box></AuthShell>;

  return (
    <AuthShell title={title}
      subtitle={mode === "invite"
        ? `${info.fullName}, ${info.tenantName ?? ""} sizi davet etti. Hesabınız için bir şifre belirleyin.`
        : `${info.email} hesabı için yeni şifrenizi girin.`}>
      <form onSubmit={submit}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="E-posta" value={info.email} disabled fullWidth autoComplete="username" />
          <PasswordField label="Yeni şifre" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
          <PasswordStrength password={password} />
          <PasswordField label="Yeni şifre (tekrar)" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <Button type="submit" variant="contained" size="large" disabled={busy}>
            {busy ? <CircularProgress size={22} color="inherit" /> : mode === "invite" ? "Hesabı etkinleştir" : "Şifreyi kaydet"}
          </Button>
        </Stack>
      </form>
    </AuthShell>
  );
}

// ---------- E-posta doğrulama ----------
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { setSession } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState("");
  const started = useRef(false); // token tek kullanımlık: StrictMode'da iki kez çağrılmasın

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) { setError("Bağlantıda token yok."); return; }
    api.post<Session>("/api/auth/verify-email", { token })
      .then((r) => { setSession(r.data.token, r.data.user, false); nav("/", { replace: true }); })
      .catch((err) => setError(errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell title="E-posta doğrulama">
      {error ? (
        <Stack spacing={2}>
          <Alert severity="error">{error}</Alert>
          <Typography variant="body2" color="text.secondary">Giriş sayfasında e-postanızı yazıp "Tekrar gönder" ile yeni bağlantı isteyebilirsiniz.</Typography>
          <Button variant="contained" component={RouterLink} to="/login">Giriş sayfasına git</Button>
        </Stack>
      ) : (
        <Box sx={{ textAlign: "center" }}><CircularProgress /><Typography sx={{ mt: 2 }}>Doğrulanıyor…</Typography></Box>
      )}
    </AuthShell>
  );
}
