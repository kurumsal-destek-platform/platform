import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch,
  Typography, useMediaQuery, useTheme,
} from "@mui/material";
import MailIcon from "@mui/icons-material/MailOutlined";
import BoltIcon from "@mui/icons-material/BoltOutlined";
import { api, downloadFile, errorMessage, timeAgo, type DigestPreview, type MailChannelT } from "../api";
import { useAuth } from "../auth";

// Ayarlar sayfasının alt kartları: e-posta kanalı, otomasyon kısayolu, haftalık özet, KVKK veri dışa aktarma
export default function SettingsExtras() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const phone = useMediaQuery(useTheme().breakpoints.down("sm"));
  const isAdmin = user?.role === "Admin";
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const channel = useQuery({ queryKey: ["mailChannel"], queryFn: async () => (await api.get<MailChannelT>("/api/mail/channel")).data, refetchInterval: 30000 });
  const digest = useQuery({ queryKey: ["digest"], queryFn: async () => (await api.get<DigestPreview>("/api/digest/preview")).data });
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => api.put("/api/digest/settings", { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["digest"] }),
  });
  const sendNow = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>("/api/digest/send-now")).data,
    onSuccess: (d) => setMsg({ ok: true, text: d.message }), onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });
  const exportAll = useMutation({
    mutationFn: async () => downloadFile("/api/privacy/tenant/export", "firma-verisi.json"),
    onSuccess: (name) => setMsg({ ok: true, text: `${name} indirildi. Dosyada şifre bilgisi yoktur; güvenli bir yerde saklayın.` }),
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });

  const ch = channel.data;
  const inboxOn = !!ch && (ch.mailpitInbox || ch.webhook);

  return (
    <Stack spacing={2}>
      {msg && <Alert severity={msg.ok ? "success" : "error"} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
            <MailIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>E-postadan ticket</Typography>
            {ch && <Chip size="small" color={inboxOn ? "success" : "default"} label={inboxOn ? "Açık" : "Kapalı"} />}
          </Stack>
          {channel.error && <Alert severity="error">{errorMessage(channel.error)}</Alert>}
          {ch && (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Çalışanlar <b>{ch.supportAddress}</b> adresine yazdığında mail otomatik olarak ticket olur. Destek ekibinin
                cevabı çalışana e-postayla gider; çalışan maili yanıtlarsa cevap aynı ticket'a eklenir.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {ch.mailpitInbox ? "Kaynak: Mailpit (demo gelen kutusu, 10 sn'de bir okunur)" : ch.webhook ? "Kaynak: e-posta sağlayıcısı (webhook)" : "Gelen kutusu bağlı değil."}
                {ch.lastCheckAt && ` · son kontrol ${timeAgo(ch.lastCheckAt)}`}
                {" · Sadece firmaya kayıtlı kullanıcıların mailleri kabul edilir."}
              </Typography>
            </>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
            <BoltIcon color="primary" />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Otomasyon kuralları</Typography>
              <Typography variant="body2" color="text.secondary">"Başlıkta VPN geçerse Ali'ye ata, öncelik Yüksek" gibi tekrar eden işleri kurala bağlayın.</Typography>
            </Box>
            <Button variant="outlined" onClick={() => nav("/automation")}>Kuralları yönet</Button>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Haftalık yönetici özeti</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Her pazartesi 09:00'da yönetici ve adminlere e-posta: açılan/çözülen ticket, SLA, memnuniyet, cevapsız sorular ve tasarruf.
          </Typography>
          {digest.error && <Alert severity="error" sx={{ mb: 1 }}>{errorMessage(digest.error)}</Alert>}
          {digest.data && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, flexWrap: "wrap", rowGap: 1 }}>
              <FormControlLabel label={digest.data.enabled ? "Açık" : "Kapalı"} control={
                <Switch checked={digest.data.enabled} disabled={toggle.isPending} onChange={(e) => toggle.mutate(e.target.checked)} />} />
              <Button variant="outlined" onClick={() => setPreview(true)}>Önizle</Button>
              <Button onClick={() => sendNow.mutate()} disabled={sendNow.isPending}>{sendNow.isPending ? "Gönderiliyor…" : "Şimdi bana gönder"}</Button>
              <Typography variant="caption" color="text.secondary">
                {digest.data.lastSentAt ? `Son gönderim: ${new Date(digest.data.lastSentAt).toLocaleString("tr-TR")}` : "Henüz gönderilmedi."}
              </Typography>
            </Stack>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Veri ve gizlilik (KVKK)</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Firmanızın tüm verisini (kullanıcılar, ticket'lar, yazışmalar, makaleler, projeler, denetim kaydı) tek JSON dosyası olarak indirin.
              Şifre bilgisi dosyaya girmez; işlem denetim kaydına yazılır. Ayrılan çalışanın kişisel verisini Kullanıcılar sayfasından silebilirsiniz.
            </Typography>
            <Button variant="outlined" onClick={() => exportAll.mutate()} disabled={exportAll.isPending}>
              {exportAll.isPending ? "Hazırlanıyor…" : "Firma verisini dışa aktar"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={preview} onClose={() => setPreview(false)} fullWidth maxWidth="md" fullScreen={phone}>
        <DialogTitle>Haftalık özet önizleme</DialogTitle>
        <DialogContent dividers sx={{ p: 0, bgcolor: "#fff" }}>
          {/* Mail HTML'i sunucuda üretilir; yine de betik çalıştırmayan, izole bir çerçevede gösterilir */}
          {digest.data && <Box component="iframe" title="Haftalık özet" sandbox="" srcDoc={digest.data.html}
            sx={{ width: "100%", height: { xs: "100%", sm: 560 }, border: 0, display: "block" }} />}
        </DialogContent>
        <DialogActions><Button onClick={() => setPreview(false)}>Kapat</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
