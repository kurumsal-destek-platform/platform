import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Button, Card, Chip, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api, errorMessage, PRIORITIES, TICKET_STATUSES, type Ticket, type UserLite } from "../api";
import { useAuth } from "../auth";
import { Person } from "../components/common";
import TicketDialog from "../components/TicketDialog";

export default function TicketsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const isManager = user?.role === "Manager" || user?.role === "Admin";
  const [tab, setTab] = useState(0);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const mine = useQuery({ queryKey: ["myTickets"], queryFn: async () => (await api.get<Ticket[]>("/api/tickets/mine")).data });
  const all = useQuery({
    queryKey: ["allTickets"], enabled: isManager,
    queryFn: async () => (await api.get<Ticket[]>("/api/tickets")).data,
  });
  const users = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<UserLite[]>("/api/users")).data });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["myTickets"] }); qc.invalidateQueries({ queryKey: ["allTickets"] }); };
  const assign = useMutation({
    mutationFn: ({ id, uid }: { id: string; uid: string }) => api.put(`/api/tickets/${id}/assignee`, { assigneeId: uid || null }),
    onSuccess: refresh, onError: (e) => setError(errorMessage(e)),
  });
  const status = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => api.patch(`/api/tickets/${id}/status`, { status: s }),
    onSuccess: refresh, onError: (e) => setError(errorMessage(e)),
  });

  const rows = tab === 1 && isManager ? all.data : mine.data;

  return (
    <>
      <Stack direction="row" sx={{ alignItems: "center", mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Ticketlar</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav("/tickets/new")}>Ticket oluştur</Button>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Benim ticketlarım" />
        {isManager && <Tab label="Tüm ticketlar" />}
      </Tabs>
      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}
      <Card variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Başlık</TableCell><TableCell>Kategori</TableCell><TableCell>Öncelik</TableCell>
              <TableCell>Açan</TableCell><TableCell>Atanan</TableCell><TableCell>Durum</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows?.map((t) => {
              const canStatus = t.assigneeId === user?.id || isManager;
              return (
                <TableRow key={t.id}>
                  <TableCell onClick={() => setOpenId(t.id)} sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.title}</Typography>
                    {t.workItemKey && <Chip size="small" color="primary" variant="outlined" label={`→ ${t.workItemKey}`} sx={{ height: 18, fontSize: 11, my: 0.3 }} />}
                    <Typography variant="caption" color="text.secondary">{t.description}</Typography>
                  </TableCell>
                  <TableCell><Chip size="small" label={t.category} /></TableCell>
                  <TableCell>{PRIORITIES[t.priority] ?? t.priority}</TableCell>
                  <TableCell><Person name={t.reporterName} /></TableCell>
                  <TableCell>
                    {isManager ? (
                      <TextField select size="small" value={t.assigneeId ?? ""} sx={{ minWidth: 150 }}
                        onChange={(e) => assign.mutate({ id: t.id, uid: e.target.value })}>
                        <MenuItem value="">Atanmadı</MenuItem>
                        {users.data?.map((u) => <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>)}
                      </TextField>
                    ) : <Person name={t.assigneeName} />}
                  </TableCell>
                  <TableCell>
                    {canStatus ? (
                      <TextField select size="small" value={t.status} sx={{ minWidth: 130 }}
                        onChange={(e) => status.mutate({ id: t.id, s: e.target.value })}>
                        {Object.entries(TICKET_STATUSES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                      </TextField>
                    ) : <Chip size="small" variant="outlined" label={TICKET_STATUSES[t.status] ?? t.status} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <TicketDialog ticket={rows?.find((t) => t.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </>
  );
}
