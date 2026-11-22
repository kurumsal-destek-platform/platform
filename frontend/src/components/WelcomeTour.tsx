import { useEffect, useState, type ReactNode } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, MobileStepper, Typography } from "@mui/material";
import { useAuth } from "../auth";
import { shortcutLabel } from "./CommandPalette";

const key = (id: string) => `kdp_tour_${id}`;
const seen = (id: string) => { try { return localStorage.getItem(key(id)) === "1"; } catch { return true; } };
const markSeen = (id: string) => { try { localStorage.setItem(key(id), "1"); } catch { /* yok say */ } };
export const resetTour = (id: string) => { try { localStorage.removeItem(key(id)); } catch { /* yok say */ } };

interface Step { emoji: string; title: string; body: ReactNode }

// İlk girişte 4-5 adımlık tanıtım. Role göre içerik değişir; bir kez gösterilir (Profil'den tekrar açılabilir).
export default function WelcomeTour() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => { if (user && !seen(user.id)) setOpen(true); }, [user]);
  if (!user) return null;
  const isManager = user.role === "Manager" || user.role === "Admin";
  const isAgent = user.role === "Agent";
  const first = user.fullName.split(" ")[0];

  const steps: Step[] = [
    { emoji: "👋", title: `Hoş geldiniz, ${first}!`, body: "ESENN; sorun bildirmeyi, takip etmeyi ve çözmeyi tek yerde toplar. 30 saniyelik kısa bir tur yapalım." },
    { emoji: "📸", title: "Sorununuzu anlatmanın en hızlı yolu", body: <>Ticket açarken hata ekranının görüntüsünü <b>Ctrl+V</b> ile yapıştırın; hata mesajını biz okuruz. Çoğu sorunu <b>“Adım adım çözelim”</b> sihirbazıyla ticket açmadan birkaç dakikada çözersiniz.</> },
    { emoji: "✨", title: "Asistan 7/24 yanınızda", body: "Asistan sadece şirketinizin bilgi bankasından cevap verir ve kaynağını gösterir. Bilmediği bir şeyi uydurmaz; size ticket açmayı önerir." },
    { emoji: "⌨️", title: "Her şey bir tuş uzağınızda", body: <><b>{shortcutLabel}</b> ile komut paleti açılır: sayfalar, işlemler, ticket ve makale arama. Yazı alanında değilken <b>C</b> tuşu yeni ticket açar.</> },
    ...(isAgent ? [{ emoji: "🎧", title: "Destek uzmanı için", body: <><b>Ticketlar → Tüm ticketlar</b> sekmesi firmanın tüm kuyruğudur: atanmamış ticket'ları üstlenin, SLA'sı dolmak üzere olanlara öncelik verin. Yeni ticket'lar bildirim olarak gelir.</> }] : []),
    ...(isManager ? [{ emoji: "📊", title: "Yönetici için", body: <><b>Performans</b> sayfasında SLA uyumu, memnuniyet ve self-servis tasarrufu (TL) var. <b>Büyük olaylar</b> ticket sellerini tek yerden yönetir, <b>Bilgi boşlukları</b> eksik makaleleri bulur.</> }] : []),
  ];
  const close = () => { markSeen(user.id); setOpen(false); setI(0); };
  const s = steps[i];

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogContent sx={{ textAlign: "center", pt: 4, minHeight: 260 }}>
        <Box key={i} sx={{ animation: "tourIn .3s ease-out", "@keyframes tourIn": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "none" } } }}>
          <Typography sx={{ fontSize: 56, lineHeight: 1.2 }}>{s.emoji}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 1.5 }}>{s.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{s.body}</Typography>
        </Box>
      </DialogContent>
      <MobileStepper variant="dots" steps={steps.length} position="static" activeStep={i} sx={{ justifyContent: "center", bgcolor: "transparent" }}
        backButton={null} nextButton={null} />
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} color="inherit">Geç</Button>
        <Box sx={{ flex: 1 }} />
        {i > 0 && <Button onClick={() => setI(i - 1)}>Geri</Button>}
        <Button variant="contained" onClick={() => (i === steps.length - 1 ? close() : setI(i + 1))}>
          {i === steps.length - 1 ? "Başlayalım" : "İleri"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
