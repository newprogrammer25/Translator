import { useEffect, useState } from "react";
import { apiBase } from "../lib/api";

type Status = "connected" | "degraded" | "offline" | "checking";

/**
 * Thin top-edge status indicator.
 * Shows server health via a subtle color bar — green/teal = OK,
 * amber = degraded, red = offline. Barely visible unless there's an issue.
 */
export function HealthBadge() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch(`${apiBase()}/api/health`, { signal: AbortSignal.timeout(4000) });
        if (!mounted) return;
        setStatus(res.ok ? "connected" : "degraded");
      } catch {
        if (mounted) setStatus("offline");
      }
    };
    void check();
    const interval = setInterval(check, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const colors: Record<Status, string> = {
    connected: "bg-teal-400/60",
    degraded: "bg-amber-400/60",
    offline: "bg-rose-400/60",
    checking: "bg-white/10",
  };

  return (
    <div
      aria-hidden
      className={`fixed top-0 inset-x-0 z-50 h-[2px] transition-colors duration-500 ${colors[status]}`}
    />
  );
}
