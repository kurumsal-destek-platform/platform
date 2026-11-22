import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Box, ListItemButton, Paper, Popper, Stack, TextField, Typography, type TextFieldProps } from "@mui/material";
import { api, ROLE_LABEL, type DirectoryUser } from "../api";
import { avatarColor } from "../theme";
import { initials } from "./Layout";

const TR = "tr-TR";

// İmlecin solunda "@yarım isim" varsa (en fazla iki kelime) onu bulur
function findQuery(text: string, caret: number): { start: number; q: string } | null {
  const left = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}]*(?: [\p{L}]*)?)$/u.exec(left);
  if (!m) return null;
  return { start: caret - m[2].length - 1, q: m[2] };
}

// Metinde "@Ad Soyad" olarak hâlâ duran seçilmiş kişiler (silinen anma bildirim göndermesin)
export const mentionedIds = (text: string, picked: DirectoryUser[]) => {
  const t = text.toLocaleLowerCase(TR);
  return [...new Set(picked.filter((u) => t.includes("@" + u.fullName.toLocaleLowerCase(TR))).map((u) => u.id))];
};

// Çok satırlı metin kutusu: "@" yazınca firmadaki kişileri (ad, soyad, departman) listeler.
// Ok tuşları + Enter/Tab ile seçilir, metne "@Ad Soyad" eklenir; onMentions seçili kişilerin id'lerini verir.
export default function MentionField({ value, onChange, onMentions, onKeyDown, ...rest }: Omit<TextFieldProps, "onChange" | "value"> & {
  value: string; onChange: (v: string) => void; onMentions?: (ids: string[]) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<{ start: number; q: string } | null>(null);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<DirectoryUser[]>([]);

  const dir = useQuery({
    queryKey: ["directory", query?.q ?? ""], enabled: !!query, staleTime: 60_000,
    queryFn: async () => (await api.get<DirectoryUser[]>("/api/people/directory", { params: { q: query!.q, limit: 8 } })).data,
  });
  const matches = query ? dir.data ?? [] : [];
  const open = !!query && (matches.length > 0 || dir.isLoading);

  useEffect(() => { onMentions?.(mentionedIds(value, picked)); }, [value, picked]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!value) setPicked([]); }, [value]);

  const update = (text: string, caret: number) => { onChange(text); setQuery(findQuery(text, caret)); setActive(0); };

  const pick = (u: DirectoryUser) => {
    if (!query) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const insert = `@${u.fullName} `;
    onChange(value.slice(0, query.start) + insert + value.slice(caret));
    setPicked((p) => (p.some((x) => x.id === u.id) ? p : [...p, u]));
    setQuery(null);
    const pos = query.start + insert.length;
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  };

  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (open && matches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[active]); return; }
    }
    if (open && e.key === "Escape") { e.preventDefault(); setQuery(null); return; }
    onKeyDown?.(e);
  };

  return (
    <Box ref={anchor} sx={{ position: "relative", width: "100%" }}>
      <TextField {...rest} fullWidth inputRef={ref} value={value}
        onChange={(e) => update(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onKeyDown={keyDown} onBlur={() => setTimeout(() => setQuery(null), 150)} />
      <Popper open={open} anchorEl={anchor.current} placement="bottom-start" style={{ zIndex: 1500, width: Math.min(anchor.current?.clientWidth ?? 360, 380) }}>
        <Paper elevation={8} sx={{ py: 0.5, mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>
            {dir.isLoading ? "Aranıyor…" : "Kişi seçin · ↑↓ ve Enter"}
          </Typography>
          {matches.map((u, i) => (
            <ListItemButton key={u.id} selected={i === active} dense onMouseDown={(e) => { e.preventDefault(); pick(u); }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
                <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: avatarColor(u.fullName) }}>{initials(u.fullName)}</Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{u.fullName}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    {[ROLE_LABEL[u.role] ?? u.role, u.department].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
              </Stack>
            </ListItemButton>
          ))}
        </Paper>
      </Popper>
    </Box>
  );
}

// Mesajı gösterirken "@Ad Soyad" anmalarını vurgular
export function HighlightMentions({ text }: { text: string }) {
  const parts = text.split(/(@\p{Lu}\p{Ll}+(?: \p{Lu}\p{Ll}+)?)/u);
  return <>{parts.map((p, i) => p.startsWith("@")
    ? <Box key={i} component="span" sx={{ color: "primary.main", fontWeight: 600, bgcolor: "action.selected", borderRadius: 1, px: 0.4 }}>{p}</Box>
    : p)}</>;
}
