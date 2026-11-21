import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  IconButton, LinearProgress, MenuItem, Stack, Switch, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import BoltIcon from "@mui/icons-material/BoltOutlined";
import ArrowIcon from "@mui/icons-material/ArrowForward";
import { api, CATEGORIES, errorMessage, PRIORITIES, timeAgo, type AutomationRuleT, type UserLite } from "../api";
import { describeRule } from "../helpers";

type Form = Omit<AutomationRuleT, "id" | "runCount" | "lastRunAt" | "createdAt" | "assigneeName">;
const EMPTY: Form = {
  name: "", enabled: true, sortOrder: 0, whenCategory: "", whenPriority: "", whenKeywords: "", whenSenderDomain: "",
  setAssigneeId: "", setPriority: "", setCategory: "", notifyManagers: false, stopProcessing: false,
};
const clean = (f: Form) => ({
  ...f,
  whenCategory: f.whenCategory || null, whenPriority: f.whenPriority || null, whenKeywords: f.whenKeywords?.trim() || null,
  whenSenderDomain: f.whenSenderDomain?.trim() || null, setAssigneeId: f.setAssigneeId || null,
  setPriority: f.setPriority || null, setCategory: f.setCategory || null,
});

export default function AutomationPage() {
  const qc = useQueryClient();
  const phone = useMediaQuery(useTheme().breakpoints.down("sm"));
  const [edit, setEdit] = useState<{ id?: string; form: Form } | null>(null);
  const [error, setError] = useState("");

  const rules = useQuery({ queryKey: ["rules"], queryFn: async () => (await api.get<AutomationRuleT[]>("/api/automation/rules")).data });
  const users = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<UserLite[]>("/api/users")).data });
  const names = Object.fromEntries((users.data ?? []).map((u) => [u.id, u.fullName]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["rules"] });

  const save = useMutation({
    mutationFn: async (e: { id?: string; form: Form }) =>
      e.id ? api.put(`/api/automation/rules/${e.id}`, clean(e.form)) : api.post("/api/automation/rules", clean(e.form)),
    onSuccess: () => { setEdit(null); setError(""); refresh(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: async (r: AutomationRuleT) => api.put(`/api/automation/rules/${r.id}`, clean({ ...r, enabled: !r.enabled })),
    onSuccess: refresh, onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/automation/rules/${id}`),
    onSuccess: refresh, onError: (e) => setError(errorMessage(e)),
  });

  const openEdit = (r?: AutomationRuleT) => {
    setError("");
    if (!r) { setEdit({ form: { ...EMPTY, sortOrder: (rules.data?.length ?? 0) + 1 } }); return; }
    const { id, runCount: _rc, lastRunAt: _lr, createdAt: _ca, assigneeName: _an, ...form } = r;
    setEdit({ id, form: { ...EMPTY, ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v ?? ""])) } as Form });
  };

  return (
    <Box sx={{ maxWidth: 960 }}>
      <Stack direction="row" sx={{ alignItems: "center", mb: 0.5, gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Otomasyon kuralları</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => openEdit()}>Yeni kural</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Yeni ticket açıldığında (portal, asistan veya e-posta) kurallar sırayla çalışır. Çalışan kural, ticket yazışmasında "⚙ Otomasyon" notu olarak görünür.
      </Typography>

      {error && !edit && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}
      {rules.error && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage(rules.error)}</Alert>}
      {rules.isLoading && <LinearProgress />}

      {rules.data?.length === 0 && (
        <Card variant="outlined" sx={{ p: 4, textAlign: "center", mb: 2 }}>
          <BoltIcon color="primary" sx={{ fontSize: 40 }} />
          <Typography sx={{ fontWeight: 600, mt: 1 }}>Henüz kural yok</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Örnek: başlıkta "vpn" geçen ticket'ları ağ uzmanına ata ve önceliği Yüksek yap.
          </Typography>
          <Button variant="outlined" onClick={() => setEdit({ form: { ...EMPTY, name: "VPN sorunları → ağ ekibi", whenKeywords: "vpn, uzak bağlantı", setCategory: "Ağ/VPN", setPriority: "High", sortOrder: 1 } })}>
            Örnek kuralla başla
          </Button>
        </Card>
      )}

      <Stack spacing={1.5} sx={{ mb: 3 }}>
        {rules.data?.map((r, i) => {
          const d = describeRule(r, names);
          return (
            <Card key={r.id} variant="outlined" sx={{ opacity: r.enabled ? 1 : 0.6 }}>
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Chip size="small" label={i + 1} sx={{ minWidth: 28 }} />
                  <Typography sx={{ fontWeight: 600, flex: 1 }}>{r.name}</Typography>
                  <Tooltip title={r.enabled ? "Kapat" : "Aç"}>
                    <Switch size="small" checked={r.enabled} onChange={() => toggle.mutate(r)} slotProps={{ input: { "aria-label": `${r.name} aç/kapat` } }} />
                  </Tooltip>
                  <IconButton size="small" onClick={() => openEdit(r)} aria-label="Düzenle"><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" aria-label="Sil" onClick={() => { if (window.confirm(`"${r.name}" kuralı silinsin mi?`)) remove.mutate(r.id); }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1, alignItems: { sm: "center" } }}>
                  <Typography variant="body2"><b>Eğer</b> {d.when}</Typography>
                  <ArrowIcon fontSize="small" color="action" sx={{ display: { xs: "none", sm: "block" } }} />
                  <Typography variant="body2"><b>{phone ? "→ " : ""}Yap:</b> {d.then}{r.stopProcessing ? " · sonraki kurallara bakma" : ""}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {r.runCount > 0 ? `${r.runCount} kez çalıştı · son ${timeAgo(r.lastRunAt!)}` : "Henüz çalışmadı"}
                </Typography>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      {(rules.data?.length ?? 0) > 0 && <RuleTester />}

      {edit && (
        <RuleDialog key={edit.id ?? "new"} initial={edit.form} isNew={!edit.id} users={users.data ?? []} error={error} busy={save.isPending}
          onClose={() => { setEdit(null); setError(""); }} onSave={(form) => save.mutate({ id: edit.id, form })} />
      )}
    </Box>
  );
}

function RuleDialog({ initial, isNew, users, error, busy, onClose, onSave }: {
  initial: Form; isNew: boolean; users: UserLite[]; error: string; busy: boolean; onClose: () => void; onSave: (f: Form) => void;
}) {
  const phone = useMediaQuery(useTheme().breakpoints.down("sm"));
  const [f, setF] = useState<Form>(initial);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const hasAction = !!(f.setAssigneeId || f.setPriority || f.setCategory || f.notifyManagers);
  const preview = describeRule(f, Object.fromEntries(users.map((u) => [u.id, u.fullName])));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{isNew ? "Yeni kural" : "Kuralı düzenle"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Kural adı" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus required />

          <Typography variant="overline" color="text.secondary">Eğer (boş bırakılanlar her şeye uyar)</Typography>
          <TextField label="Anahtar kelimeler" helperText="Virgülle ayırın. Biri başlıkta veya açıklamada geçerse yeterli." placeholder="vpn, uzak bağlantı"
            value={f.whenKeywords ?? ""} onChange={(e) => set({ whenKeywords: e.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select fullWidth label="Kategori" value={f.whenCategory ?? ""} onChange={(e) => set({ whenCategory: e.target.value })}>
              <MenuItem value="">Fark etmez</MenuItem>
              {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label="Öncelik" value={f.whenPriority ?? ""} onChange={(e) => set({ whenPriority: e.target.value })}>
              <MenuItem value="">Fark etmez</MenuItem>
              {Object.entries(PRIORITIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label="Gönderenin alan adı" placeholder="anka.com" helperText="Örn. bir şubeden/firmadan gelenler için"
            value={f.whenSenderDomain ?? ""} onChange={(e) => set({ whenSenderDomain: e.target.value })} />

          <Divider />
          <Typography variant="overline" color="text.secondary">O zaman (en az bir eylem)</Typography>
          <TextField select label="Şu kişiye ata" value={f.setAssigneeId ?? ""} onChange={(e) => set({ setAssigneeId: e.target.value })}>
            <MenuItem value="">Atama yapma</MenuItem>
            {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>)}
          </TextField>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select fullWidth label="Önceliği yap" value={f.setPriority ?? ""} onChange={(e) => set({ setPriority: e.target.value })}>
              <MenuItem value="">Değiştirme</MenuItem>
              {Object.entries(PRIORITIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label="Kategoriyi yap" value={f.setCategory ?? ""} onChange={(e) => set({ setCategory: e.target.value })}>
              <MenuItem value="">Değiştirme</MenuItem>
              {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Stack>
          <FormControlLabel control={<Switch checked={f.notifyManagers} onChange={(e) => set({ notifyManagers: e.target.checked })} />}
            label="Yöneticilere bildirim gönder" />

          <Divider />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
            <TextField type="number" label="Sıra" value={f.sortOrder} onChange={(e) => set({ sortOrder: +e.target.value })} sx={{ width: 110 }}
              helperText="Küçük önce" />
            <FormControlLabel control={<Switch checked={f.stopProcessing} onChange={(e) => set({ stopProcessing: e.target.checked })} />}
              label="Bu kural çalışırsa sonrakilere bakma" />
            <FormControlLabel control={<Switch checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />} label="Açık" />
          </Stack>

          <Alert severity={hasAction ? "info" : "warning"} icon={<BoltIcon />}>
            <b>Eğer</b> {preview.when} <b>→</b> {hasAction ? preview.then : "bir eylem seçin"}
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" disabled={!f.name.trim() || !hasAction || busy} onClick={() => onSave(f)}>Kaydet</Button>
      </DialogActions>
    </Dialog>
  );
}

// "Bu ticket açılsaydı ne olurdu?" — hiçbir şey kaydetmeden kuralları dener
function RuleTester() {
  const [t, setT] = useState({ title: "", category: "Diğer", priority: "Medium" });
  const test = useMutation({
    mutationFn: async () => (await api.post<{
      matched: { ruleId: string; rule: string; summary: string }[];
      result: { category: string; priority: string; assigneeName?: string | null };
    }>("/api/automation/rules/test", t)).data,
  });
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Kuralları dene</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Örnek bir ticket yazın; hangi kuralların çalışacağını görün. Hiçbir şey kaydedilmez.</Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <TextField size="small" fullWidth label="Ticket başlığı" placeholder="VPN'e bağlanamıyorum" value={t.title}
            onChange={(e) => setT({ ...t, title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && t.title.trim()) test.mutate(); }} />
          <TextField size="small" select label="Kategori" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })} sx={{ minWidth: 150 }}>
            {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField size="small" select label="Öncelik" value={t.priority} onChange={(e) => setT({ ...t, priority: e.target.value })} sx={{ minWidth: 120 }}>
            {Object.entries(PRIORITIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <Button variant="outlined" disabled={!t.title.trim() || test.isPending} onClick={() => test.mutate()}>Dene</Button>
        </Stack>
        {test.error && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(test.error)}</Alert>}
        {test.data && (
          <Alert severity={test.data.matched.length ? "success" : "info"} sx={{ mt: 2 }}>
            {test.data.matched.length === 0 ? "Hiçbir kural çalışmazdı." : (
              <>
                {test.data.matched.map((m) => <div key={m.ruleId}>⚙ <b>{m.rule}</b>: {m.summary}</div>)}
                <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
                  Sonuç: kategori {test.data.result.category}, öncelik {PRIORITIES[test.data.result.priority] ?? test.data.result.priority}
                  {test.data.result.assigneeName ? `, atanan ${test.data.result.assigneeName}` : ""}
                </Typography>
              </>
            )}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
