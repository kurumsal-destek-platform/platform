import { Avatar, Chip, Stack, Typography } from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import BugIcon from "@mui/icons-material/BugReport";
import BoltIcon from "@mui/icons-material/Bolt";
import SubIcon from "@mui/icons-material/SubdirectoryArrowRight";
import { PRIORITIES, statusLabel } from "../api";
import { initials } from "./Layout";

export function TypeIcon({ type }: { type: string }) {
  const sx = { fontSize: 18 };
  switch (type) {
    case "Epic": return <BoltIcon sx={{ ...sx, color: "#9f8fef" }} />;
    case "Story": return <BookmarkIcon sx={{ ...sx, color: "#94c748" }} />;
    case "Bug": return <BugIcon sx={{ ...sx, color: "#f87168" }} />;
    case "Subtask": return <SubIcon sx={{ ...sx, color: "#579dff" }} />;
    default: return <CheckBoxIcon sx={{ ...sx, color: "#579dff" }} />;
  }
}

const STATUS_COLOR: Record<string, "default" | "primary" | "warning" | "success"> = {
  todo: "default", in_progress: "primary", in_review: "warning", done: "success",
};
export function StatusChip({ status }: { status: string }) {
  return <Chip size="small" label={statusLabel(status)} color={STATUS_COLOR[status] ?? "default"} variant="outlined" />;
}

export function PriorityText({ p }: { p: string }) {
  const color = p === "Critical" ? "#f87168" : p === "High" ? "#f5cd47" : "text.secondary";
  return <Typography variant="body2" sx={{ color }}>{PRIORITIES[p] ?? p}</Typography>;
}

export function Person({ name }: { name?: string | null }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: name ? "#f79233" : "grey.700" }}>
        {name ? initials(name) : "?"}
      </Avatar>
      <Typography variant="body2" color={name ? "text.primary" : "text.secondary"}>{name ?? "Atanmadı"}</Typography>
    </Stack>
  );
}
