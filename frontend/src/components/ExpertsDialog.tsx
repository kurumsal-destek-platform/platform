import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Avatar, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Tooltip, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import GroupsIcon from "@mui/icons-material/GroupsOutlined";
import StarIcon from "@mui/icons-material/StarRounded";
import { api, ROLE_LABEL, type Expert } from "../api";
import { avatarColor } from "../theme";
import { initials } from "./Layout";

const AVAIL: Record<Expert["availability"], { label: string; color: "success" | "warning" | "error" }> = {
  available: { label: "Müsait", color: "success" },
  busy: { label: "Yoğun", color: "warning" },
  overloaded: { label: "Çok yoğun", color: "error" },
};

// Küçük düğme: "Bu konuyla kimler ilgilenir?" → destek ekibini konuya göre kart ızgarasında gösterir
export function ExpertsButton({ area, title, description, size = "small" }: { area?: string; title?: string; description?: string; size?: "small" | "medium" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} startIcon={<GroupsIcon />} onClick={() => setOpen(true)} sx={{ whiteSpace: "nowrap" }}>Kimler ilgilenir?</Button>
      {open && <ExpertsDialog area={area} title={title} description={description} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function ExpertsDialog({ area: initial, title, description, onClose }: { area?: string; title?: string; description?: string; onClose: () => void }) {
  const phone = useMediaQuery(useTheme().breakpoints.down("sm"));
  const [area, setArea] = useState(initial ?? "");
  useEffect(() => setArea(initial ?? ""), [initial]);
  const areas = useQuery({ queryKey: ["expertiseAreas"], queryFn: async () => (await api.get<string[]>("/api/people/expertise-areas")).data });
  const experts = useQuery({
    queryKey: ["experts", area, title, description],
    queryFn: async () => (await api.get<Expert[]>("/api/people/experts", { params: { area: area || undefined, title: title || undefined, description: description || undefined } })).data,
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={phone}>
      <DialogTitle>Bu konuyla kimler ilgilenir?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Destek ekibinden bu konuda uzman olanlar ve benzer sorunları çözmüş kişiler. Açıklamada <b>@</b> yazarak birini talebe ekleyebilirsiniz.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1 }}>
          <Chip label="Tümü" color={area === "" ? "primary" : "default"} variant={area === "" ? "filled" : "outlined"} onClick={() => setArea("")} />
          {[...new Set([...(areas.data ?? []), ...(initial ? [initial] : [])])].map((a) => (
            <Chip key={a} label={a} icon={a === "VIP" ? <StarIcon /> : undefined}
              color={area === a ? "primary" : "default"} variant={area === a ? "filled" : "outlined"} onClick={() => setArea(a)} />
          ))}
        </Stack>
        {experts.isLoading && <LinearProgress />}
        {experts.data?.length === 0 && (
          <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => setArea("")}>Tüm ekibi göster</Button>}>
            "{area}" konusunda tanımlı uzman ya da bu konuda çözülmüş talep yok. Yöneticiniz Kullanıcılar sayfasından uzmanlık alanı ekleyebilir.
          </Alert>
        )}
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(4, 1fr)" } }}>
          {experts.data?.map((e, i) => (
            <Card key={e.id} sx={{ p: 2, position: "relative", borderColor: i === 0 && area ? "primary.main" : undefined }}>
              {i === 0 && area && (experts.data?.length ?? 0) > 1 && (
                <Chip size="small" color="primary" label="En uygun" sx={{ position: "absolute", top: 10, right: 10, height: 20, fontSize: 11 }} />
              )}
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 1.25, pr: 7 }}>
                <Avatar sx={{ width: 40, height: 40, bgcolor: avatarColor(e.fullName), fontWeight: 700 }}>{initials(e.fullName)}</Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }} noWrap>{e.fullName}{e.isMe ? " (siz)" : ""}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    {[ROLE_LABEL[e.role] ?? e.role, e.department].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5, mb: 1.25, minHeight: 24 }}>
                {e.expertise.length === 0 && <Typography variant="caption" color="text.secondary">Uzmanlık alanı tanımlı değil</Typography>}
                {e.expertise.map((x) => (
                  <Chip key={x} size="small" label={x} icon={x === "VIP" ? <StarIcon /> : undefined}
                    color={area && x.toLocaleLowerCase("tr-TR") === area.toLocaleLowerCase("tr-TR") ? "primary" : "default"}
                    variant={area && x.toLocaleLowerCase("tr-TR") === area.toLocaleLowerCase("tr-TR") ? "filled" : "outlined"} />
                ))}
              </Stack>
              <Stack spacing={0.4}>
                <Typography variant="body2">
                  <b>{e.solvedInArea}</b> {area ? (area === "VIP" ? "kritik/VIP talep" : "talep bu konuda") : "talep"} çözdü <Typography component="span" variant="caption" color="text.secondary">(son 6 ay)</Typography>
                </Typography>
                {e.similarSolved > 0 && <Typography variant="body2"><b>{e.similarSolved}</b> benzer sorunu çözdü</Typography>}
                <Typography variant="body2" color="text.secondary">
                  {e.avgHours != null ? `Ortalama çözüm: ${e.avgHours < 24 ? `${e.avgHours} saat` : `${Math.round(e.avgHours / 24)} gün`}` : "Çözüm süresi verisi yok"}
                  {e.csat != null ? ` · Memnuniyet ${e.csat}/5` : ""}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center" }}>
                <Tooltip title={e.openLoad != null ? `Şu an ${e.openLoad} açık talebi var` : "Şu anki iş yoğunluğu"}>
                  <Chip size="small" variant="outlined" color={AVAIL[e.availability].color} label={AVAIL[e.availability].label} />
                </Tooltip>
              </Stack>
            </Card>
          ))}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions>
    </Dialog>
  );
}
