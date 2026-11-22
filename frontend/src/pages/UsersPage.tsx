import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem,
  Autocomplete, Select, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import MoreIcon from "@mui/icons-material/MoreHoriz";
import PersonAddIcon from "@mui/icons-material/PersonAddOutlined";
import { useAuth } from "../auth";
import { api, errorMessage, timeAgo, type UserLite } from "../api";
import { Person } from "../components/common";

const ROLES = [
  { key: "Employee", label: "Çalışan" },
  { key: "Agent", label: "Destek uzmanı" },
  { key: "Manager", label: "Yönetici" },
  { key: "Admin", label: "Admin" },
];

function StatusChip({ u }: { u: UserLite }) {
  if (!u.isActive) return <Chip size="small" label="Devre dışı" />;
  if (u.invited) return <Chip size="small" color="info" variant="outlined" label="Davet bekliyor" />;
  if (u.locked) return <Chip size="small" color="warning" label="Kilitli" />;
  return <Chip size="small" color="success" variant="outlined" label="Aktif" />;
}

export default function UsersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "Admin";
  const canManage = isAdmin || user?.role === "Manager";
  const depts = useQuery({ queryKey: ["departments"], queryFn: async () => (await api.get<string[]>("/api/users/departments")).data });
  const [toast, setToast] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menu, setMenu] = useState<{ el: HTMLElement; u: UserLite } | null>(null);
  const [erase, setErase] = useState<UserLite | null>(null);

  const users = useQuery({
    queryKey: ["users", "all"],
    queryFn: async () => (await api.get<UserLite[]>("/api/users", { params: { all: true } })).data,
  });

  const act = useMutation({
    mutationFn: async (f: () => Promise<unknown>) => f(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => setToast(errorMessage(e)),
  });
  const run = (f: () => Promise<unknown>, ok: string) => { setMenu(null); act.mutate(f, { onSuccess: () => setToast(ok) }); };

  const roleOptions = ROLES.filter((r) => isAdmin || r.key !== "Admin");

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Kullanıcılar</Typography>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setInviteOpen(true)}>Kullanıcı davet et</Button>
      </Stack>
      {users.error && <Alert severity="error">{errorMessage(users.error)}</Alert>}

      <Box sx={{ overflowX: "auto" }}>
      <Table size="small" sx={{ bgcolor: "background.paper", minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>Kullanıcı</TableCell><TableCell>E-posta</TableCell><TableCell>Rol</TableCell><TableCell>Departman</TableCell>
            <TableCell>Durum</TableCell><TableCell>Son giriş</TableCell><TableCell width={48} />
          </TableRow>
        </TableHead>
        <TableBody>
          {users.data?.map((u) => {
            const self = u.id === user?.id;
            const lockedRole = (u.role === "Admin" && !isAdmin) || self;
            return (
              <TableRow key={u.id} hover sx={{ opacity: u.isActive ? 1 : 0.55 }}>
                <TableCell><Person name={u.fullName} />{self && <Chip size="small" label="Siz" sx={{ ml: 1 }} />}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Select size="small" variant="standard" value={u.role} disabled={lockedRole}
                    onChange={(e) => run(() => api.put(`/api/users/${u.id}/role`, { role: e.target.value }), "Rol güncellendi")}>
                    {(lockedRole ? ROLES : roleOptions).map((r) => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
                  </Select>
                </TableCell>
                <TableCell sx={{ minWidth: 170 }}>
                  <Autocomplete size="small" freeSolo options={depts.data ?? []} value={u.department ?? ""} disabled={!canManage}
                    onChange={(_, v) => { if ((v ?? "") !== (u.department ?? "")) run(() => api.put(`/api/users/${u.id}/department`, { department: v || null }), "Departman güncellendi"); }}
                    renderInput={(p) => <TextField {...p} variant="standard" placeholder="—"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (u.department ?? "")) run(() => api.put(`/api/users/${u.id}/department`, { department: v || null }), "Departman güncellendi"); }} />} />
                </TableCell>
                <TableCell><StatusChip u={u} /></TableCell>
                <TableCell>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "—"}</TableCell>
                <TableCell>
                  {!self && <IconButton size="small" onClick={(e) => setMenu({ el: e.currentTarget, u })}><MoreIcon fontSize="small" /></IconButton>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </Box>

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {menu?.u.invited && menu.u.isActive && (
          <MenuItem onClick={() => run(() => api.post(`/api/users/${menu.u.id}/resend-invite`), "Davet tekrar gönderildi")}>Daveti tekrar gönder</MenuItem>
        )}
        {menu?.u.locked && (
          <MenuItem onClick={() => run(() => api.post(`/api/users/${menu.u.id}/unlock`), "Kilit kaldırıldı")}>Kilidi kaldır</MenuItem>
        )}
        {menu && isAdmin && (
          <MenuItem sx={{ color: "error.main" }} onClick={() => { setErase(menu.u); setMenu(null); }}>Kişisel veriyi sil (KVKK)…</MenuItem>
        )}
        {menu && (
          <MenuItem sx={{ color: menu.u.isActive ? "error.main" : undefined }}
            onClick={() => run(() => api.put(`/api/users/${menu.u.id}/active`, { isActive: !menu.u.isActive }),
              menu.u.isActive ? "Kullanıcı devre dışı bırakıldı" : "Kullanıcı etkinleştirildi")}>
            {menu.u.isActive ? "Devre dışı bırak" : "Etkinleştir"}
          </MenuItem>
        )}
      </Menu>

      <InviteDialog open={inviteOpen} roles={roleOptions} onClose={() => setInviteOpen(false)}
        onDone={(email) => { setInviteOpen(false); setToast(`${email} adresine davet gönderildi`); qc.invalidateQueries({ queryKey: ["users"] }); }} />
      <EraseDialog user={erase} onClose={() => setErase(null)}
        onDone={(msg) => { setErase(null); setToast(msg); qc.invalidateQueries({ queryKey: ["users"] }); }} />
      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

// KVKK: ayrılan çalışanın kişisel verisini sil. Geri alınamaz → adını yazarak onaylatılır.
function EraseDialog({ user, onClose, onDone }: { user: UserLite | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>(`/api/privacy/users/${user!.id}/anonymize`)).data,
    onSuccess: (d) => { setTyped(""); setError(""); onDone(d.message); },
    onError: (e) => setError(errorMessage(e)),
  });
  const close = () => { setTyped(""); setError(""); onClose(); };
  const ok = !!user && typed.trim().toLocaleLowerCase("tr-TR") === user.fullName.trim().toLocaleLowerCase("tr-TR");
  return (
    <Dialog open={!!user} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Kişisel veriyi sil</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Alert severity="warning">
            <b>{user?.fullName}</b> kullanıcısının adı, e-postası ve şifresi kalıcı olarak silinir, oturumları kapanır.
            Açtığı ticket'lar ve istatistikler "Silinmiş kullanıcı" adıyla korunur. <b>Bu işlem geri alınamaz.</b>
          </Alert>
          <TextField label="Onaylamak için kişinin adını yazın" value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder={user?.fullName} autoFocus />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Vazgeç</Button>
        <Button color="error" variant="contained" disabled={!ok || m.isPending} onClick={() => m.mutate()}>Kalıcı olarak sil</Button>
      </DialogActions>
    </Dialog>
  );
}

function InviteDialog({ open, roles, onClose, onDone }: {
  open: boolean; roles: { key: string; label: string }[]; onClose: () => void; onDone: (email: string) => void;
}) {
  const [f, setF] = useState({ fullName: "", email: "", role: "Employee", department: "" });
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: async () => api.post("/api/users/invite", f),
    onSuccess: () => { onDone(f.email); setF({ fullName: "", email: "", role: "Employee", department: "" }); setError(""); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Kullanıcı davet et</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Ad soyad" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoFocus />
          <TextField label="E-posta" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <TextField label="Departman" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="Örn. Muhasebe" />
          <TextField select label="Rol" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {roles.map((r) => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
          </TextField>
          <Typography variant="caption" color="text.secondary">
            Kişiye 7 gün geçerli bir bağlantı gider; bağlantıyla kendi şifresini belirler.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" disabled={m.isPending || !f.fullName || !f.email} onClick={() => m.mutate()}>Davet gönder</Button>
      </DialogActions>
    </Dialog>
  );
}
