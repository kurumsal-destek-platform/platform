import { useRef, useState, type KeyboardEvent } from "react";
import { Box, ListItemButton, Paper, Stack, TextField, Typography } from "@mui/material";
import { Person } from "./common";

export interface MentionUser { userId: string; fullName: string }

const TR = "tr-TR";
const firstName = (n: string) => n.split(" ")[0];

// İmlecin hemen solunda "@yarım" varsa onu bulur
function findQuery(text: string, caret: number): { start: number; q: string } | null {
  const left = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}]*)$/u.exec(left);
  if (!m) return null;
  return { start: caret - m[2].length - 1, q: m[2] };
}

// Yorum kutusu: "@" yazınca proje üyelerini listeler, ok tuşları + Enter ile seçilir.
export default function MentionInput({ value, onChange, onSubmit, users, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  users: MentionUser[]; placeholder?: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<{ start: number; q: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches = query
    ? users.filter((u) => u.fullName.toLocaleLowerCase(TR).split(" ")
        .some((part) => part.startsWith(query.q.toLocaleLowerCase(TR)))).slice(0, 6)
    : [];
  const open = !!query && matches.length > 0;

  const update = (text: string, caret: number) => {
    onChange(text);
    setQuery(findQuery(text, caret));
    setActive(0);
  };

  const pick = (u: MentionUser) => {
    if (!query) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const insert = `@${firstName(u.fullName)} `;
    const next = value.slice(0, query.start) + insert + value.slice(caret);
    onChange(next);
    setQuery(null);
    const pos = query.start + insert.length;
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (open) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[active]); return; }
      if (e.key === "Escape") { e.preventDefault(); setQuery(null); return; }
    }
    if (e.key === "Enter" && value.trim()) { e.preventDefault(); onSubmit(); }
  };

  return (
    <Box sx={{ position: "relative", flex: 1 }}>
      <TextField size="small" fullWidth inputRef={ref} value={value} placeholder={placeholder} disabled={disabled}
        onChange={(e) => update(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)} />
      {open && (
        <Paper elevation={8} sx={{ position: "absolute", left: 0, right: 0, bottom: 44, zIndex: 30, py: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>Kişi seçin</Typography>
          {matches.map((u, i) => (
            <ListItemButton key={u.userId} selected={i === active} dense
              onMouseDown={(e) => { e.preventDefault(); pick(u); }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Person name={u.fullName} />
              </Stack>
            </ListItemButton>
          ))}
        </Paper>
      )}
    </Box>
  );
}

// Yorumu gösterirken @İsim kısımlarını vurgular
export function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[\p{L}]+)/u);
  return (
    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
      {parts.map((p, i) => p.startsWith("@")
        ? <Box key={i} component="span" sx={{ color: "primary.main", fontWeight: 600 }}>{p}</Box>
        : p)}
    </Typography>
  );
}
