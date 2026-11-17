import { useMemo, useState } from "react";
import { Box, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import ExpandIcon from "@mui/icons-material/ExpandMore";
import CollapseIcon from "@mui/icons-material/ChevronRight";
import { statusLabel, type WorkItem } from "../api";
import { TypeIcon } from "./common";

// Jira "Timeline" benzeri basit Gantt: epic'ler ve altındaki işler, başlangıç→bitiş çubukları
const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const BAR_COLOR: Record<string, string> = { todo: "#8993a4", in_progress: "#0052cc", in_review: "#6554c0", done: "#36b37e" };

function range(w: WorkItem): { s: Date; e: Date; estimated: boolean } {
  const s = startOfDay(new Date(w.startDate ?? w.createdAt));
  const e = w.dueDate ? startOfDay(new Date(w.dueDate)) : new Date(s.getTime() + 7 * DAY);
  return { s, e: e < s ? s : e, estimated: !w.dueDate };
}

export default function TimelineView({ items, onOpen }: { items: WorkItem[]; onOpen: (key: string) => void }) {
  const [zoom, setZoom] = useState<"week" | "month">("week");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const dayW = zoom === "week" ? 28 : 9;

  // Satırlar: epic → çocukları, sonra epic'siz üst seviye işler (alt görevler hariç)
  const rows = useMemo(() => {
    const epics = items.filter((w) => w.type === "Epic");
    const byParent = (id: string) => items.filter((w) => w.parentId === id && w.type !== "Subtask");
    const out: { w: WorkItem; depth: number; hasKids?: boolean }[] = [];
    for (const e of epics) {
      const kids = byParent(e.id);
      out.push({ w: e, depth: 0, hasKids: kids.length > 0 });
      if (!closed[e.id]) kids.forEach((k) => out.push({ w: k, depth: 1 }));
    }
    const epicIds = new Set(epics.map((e) => e.id));
    items.filter((w) => w.type !== "Epic" && w.type !== "Subtask" && (!w.parentId || !epicIds.has(w.parentId)) && !items.some((p) => p.id === w.parentId && p.type !== "Epic"))
      .forEach((w) => out.push({ w, depth: 0 }));
    return out;
  }, [items, closed]);

  // Görünür tarih aralığı: tüm çubukları ve bugünü kapsasın
  const { from, days } = useMemo(() => {
    const today = startOfDay(new Date());
    let min = new Date(today.getTime() - 7 * DAY), max = new Date(today.getTime() + 28 * DAY);
    rows.forEach(({ w }) => { const r = range(w); if (r.s < min) min = r.s; if (r.e > max) max = r.e; });
    min = new Date(min.getTime() - ((min.getDay() + 6) % 7) * DAY); // pazartesiye hizala
    const n = Math.ceil((max.getTime() - min.getTime()) / DAY) + 7;
    return { from: min, days: n };
  }, [rows]);

  const x = (d: Date) => Math.round((d.getTime() - from.getTime()) / DAY) * dayW;
  const todayX = x(startOfDay(new Date()));
  const LEFT = 300, ROW = 36;

  // Başlık: hafta ya da ay etiketleri
  const ticks: { x: number; label: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * DAY);
    if (zoom === "week" ? d.getDay() === 1 : d.getDate() === 1)
      ticks.push({ x: i * dayW, label: d.toLocaleDateString("tr-TR", zoom === "week" ? { day: "numeric", month: "short" } : { month: "long", year: "numeric" }) });
  }

  if (rows.length === 0)
    return <Typography color="text.secondary">Zaman çizelgesinde gösterilecek iş yok. Bir Epic oluşturup altına işler ekleyin.</Typography>;

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 1, alignItems: "center" }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Çubuklar başlangıç → bitiş tarihini gösterir. Kesikli çubuk: bitiş tarihi girilmemiş (1 hafta varsayıldı).
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={zoom} onChange={(_, v) => v && setZoom(v)}>
          <ToggleButton value="week">Hafta</ToggleButton>
          <ToggleButton value="month">Ay</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Box sx={{ display: "flex", border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "background.paper", overflow: "hidden" }}>
        {/* Sol: iş listesi */}
        <Box sx={{ width: LEFT, flexShrink: 0, borderRight: 1, borderColor: "divider" }}>
          <Box sx={{ height: 32, borderBottom: 1, borderColor: "divider", px: 1, display: "flex", alignItems: "center" }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>İş</Typography>
          </Box>
          {rows.map(({ w, depth, hasKids }) => (
            <Stack key={w.id} direction="row" spacing={0.5}
              sx={{ height: ROW, alignItems: "center", pl: 0.5 + depth * 2.5, pr: 1, borderBottom: 1, borderColor: "divider",
                bgcolor: w.type === "Epic" ? "action.hover" : undefined }}>
              {w.type === "Epic" ? (
                <IconButton size="small" disabled={!hasKids} onClick={() => setClosed((c) => ({ ...c, [w.id]: !c[w.id] }))}>
                  {closed[w.id] ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                </IconButton>
              ) : <Box sx={{ width: 4 }} />}
              <TypeIcon type={w.type} />
              <Typography variant="body2" noWrap sx={{ cursor: "pointer", flex: 1, "&:hover": { textDecoration: "underline" } }}
                onClick={() => onOpen(w.key)}>
                <Box component="span" sx={{ color: "text.secondary", mr: 0.5 }}>{w.key}</Box>{w.title}
              </Typography>
            </Stack>
          ))}
        </Box>

        {/* Sağ: zaman ızgarası */}
        <Box sx={{ flex: 1, overflowX: "auto" }}>
          <Box sx={{ width: days * dayW, position: "relative" }}>
            <Box sx={{ height: 32, borderBottom: 1, borderColor: "divider", position: "relative" }}>
              {ticks.map((t) => (
                <Typography key={t.x} variant="caption" color="text.secondary" sx={{ position: "absolute", left: t.x + 4, top: 8, whiteSpace: "nowrap" }}>
                  {t.label}
                </Typography>
              ))}
            </Box>
            {ticks.map((t) => (
              <Box key={`l${t.x}`} sx={{ position: "absolute", left: t.x, top: 32, bottom: 0, borderLeft: "1px dashed", borderColor: "divider" }} />
            ))}
            <Box sx={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, bgcolor: "#ff5630", zIndex: 2 }} title="Bugün" />
            {rows.map(({ w }) => {
              const r = range(w);
              const left = x(r.s), width = Math.max(dayW, x(r.e) - left + dayW);
              const color = BAR_COLOR[w.status] ?? "#8993a4";
              return (
                <Box key={w.id} sx={{ height: ROW, position: "relative", borderBottom: 1, borderColor: "divider" }}>
                  <Tooltip title={`${w.key} · ${statusLabel(w.status)} · ${r.s.toLocaleDateString("tr-TR")} → ${r.estimated ? "bitiş yok" : r.e.toLocaleDateString("tr-TR")}`}>
                    <Box onClick={() => onOpen(w.key)}
                      sx={{
                        position: "absolute", left, width, top: 8, height: ROW - 16, borderRadius: 1, cursor: "pointer",
                        bgcolor: r.estimated ? "transparent" : color, border: `2px ${r.estimated ? "dashed" : "solid"} ${color}`,
                        opacity: w.type === "Epic" ? 1 : 0.85, color: "#fff", fontSize: 11, px: 0.5, overflow: "hidden", whiteSpace: "nowrap",
                      }}>
                      {!r.estimated && width > 60 && w.title}
                    </Box>
                  </Tooltip>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
