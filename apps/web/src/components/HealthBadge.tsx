import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";

type Status = "checking" | "ok" | "no-key" | "error";

const TEXT: Record<Status, string> = {
  checking: "Checking…",
  ok: "Connected",
  "no-key": "API key missing",
  error: "Backend unreachable",
};

const COLOR: Record<Status, string> = {
  checking: "bg-ink-500/20 text-ink-300",
  ok: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  "no-key": "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  error: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
};

export function HealthBadge() {
  const [status, setStatus] = useState<Status>("checking");
  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((h) => {
        if (cancelled) return;
        setStatus(h.has_api_key ? "ok" : "no-key");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <span className={`text-[11px] inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${COLOR[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {TEXT[status]}
    </span>
  );
}
