import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { api, tokenStore } from "./api";

// Sunucudan "şu adres değişti" sinyali gelince sadece ilgili ekran verileri yenilenir.
// Düzenleme formlarını besleyen sorgular (ör. tek makale, ayarlar) bilerek listede yok: yazdığınız kaybolmasın.
const MAP: [RegExp, string[]][] = [
  [/^\/api\/tickets/, ["myTickets", "allTickets", "quality", "savings", "assignSuggest", "incidentSuggestions", "knowledgeGaps", "dashboard"]],
  [/^\/api\/incidents/, ["incidents", "incidentSuggestions", "myTickets", "allTickets"]],
  [/^\/api\/(items|projects|sprints|links|filters|attachments)/, ["items", "myItems", "project", "projects", "sprints", "sprintRisk", "item", "links", "comments", "activity", "labels", "filters", "dashboard"]],
  [/^\/api\/kb/, ["articles", "knowledgeGaps", "savings"]],
  [/^\/api\/users/, ["users"]],
  [/^\/api\/insights/, ["knowledgeGaps", "articles"]],
];

export type LiveState = "connecting" | "live" | "offline";

export function useLiveUpdates(userId?: string): LiveState {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>("connecting");
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!userId) return;
    const base = (api.defaults.baseURL ?? "").replace(/\/$/, "");
    const conn = new HubConnectionBuilder()
      .withUrl(`${base}/hubs/live`, { accessTokenFactory: () => tokenStore.get() ?? "" })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.None)
      .build();

    conn.on("changed", (e: { path: string; by?: string }) => {
      const keys = new Set<string>(["notifications"]);
      if (e.by !== userId) for (const [re, ks] of MAP) if (re.test(e.path)) ks.forEach((k) => keys.add(k));
      keys.forEach((k) => pending.current.add(k));
      // Art arda gelen sinyalleri 400 ms'de bir topla
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const ks = new Set(pending.current);
        pending.current.clear();
        qc.invalidateQueries({ predicate: (q) => ks.has(String(q.queryKey[0])) });
      }, 400);
    });
    conn.onreconnecting(() => setState("connecting"));
    conn.onreconnected(() => { setState("live"); qc.invalidateQueries(); });
    conn.onclose(() => setState("offline"));
    conn.start().then(() => setState("live")).catch(() => setState("offline"));
    return () => { clearTimeout(timer.current); if (conn.state !== HubConnectionState.Disconnected) conn.stop(); };
  }, [userId, qc]);

  return state;
}
