import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";

type Status = "checking" | "ok" | "no-key" | "error";

const LABEL: Record<Status, string> = {
  checking: "Checking backend connection",
  ok: "Backend connected",
  "no-key": "Backend missing API key",
  error: "Backend unreachable",
};

/**
 * Edge-light health indicator. Replaces the old "Connected" chip in the topbar
 * with a hairline gradient bar across the very top of the viewport. Visually
 * disappears when healthy (a faint teal sheen), turns warm amber if the API
 * key is missing, red if the backend is unreachable.
 */
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

  const tone =
    status === "ok"
      ? "from-teal-400/0 via-teal-300/60 to-violet-400/0"
      : status === "no-key"
      ? "from-amber-400/0 via-amber-300/80 to-amber-400/0"
      : status === "error"
      ? "from-rose-500/0 via-rose-400/80 to-rose-500/0"
      : "from-ink-500/0 via-ink-400/40 to-ink-500/0";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={LABEL[status]}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]"
    >
      <div className={`h-full w-full bg-gradient-to-r ${tone}`} />
    </div>
  );
}
