import { Languages, MessageSquareText, Mic, Phone } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { HealthBadge } from "./HealthBadge";

const NAV = [
  { to: "/", label: "Real-time", short: "Live", icon: Mic, end: true },
  {
    to: "/translate",
    label: "AI Translation",
    short: "Translate",
    icon: Languages,
    end: false,
  },
  {
    to: "/dialogue",
    label: "AI Dialogue",
    short: "Chat",
    icon: MessageSquareText,
    end: false,
  },
  { to: "/call", label: "Call", short: "Call", icon: Phone, end: false },
];

/**
 * Premium app shell.
 *
 * Mobile (≤768px): full-screen panes for content + bottom tab nav with big touch
 * targets — feels like a native app, not a shrunk desktop.
 *
 * Desktop (≥1024px): a fixed left rail (icon+label) instead of a topbar; the
 * content area gets full vertical real-estate with hero typography and
 * asymmetric composition.
 *
 * Tablet (768–1024px): icon-only rail + slightly looser content padding.
 */
export function Layout() {
  return (
    <div className="relative flex min-h-dvh w-full flex-col lg:flex-row">
      {/* Decorative aurora blobs — pinned, GPU-only, never blocks taps. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-violet-500/15 blur-3xl animate-blob" />
        <div className="absolute -right-32 top-40 h-[360px] w-[360px] rounded-full bg-teal-500/15 blur-3xl animate-blob" />
        <div className="absolute bottom-0 left-1/3 h-[300px] w-[300px] rounded-full bg-violet-600/10 blur-3xl animate-blob" />
      </div>

      {/* Top edge: thin health-state color bar (replaces old "Connected" chip). */}
      <HealthBadge />

      {/* Mobile / tablet topbar — minimal: brand only. Nav is at the bottom. */}
      <header className="lg:hidden pt-safe sticky top-0 z-30 backdrop-blur-2xl bg-canvas-950/60">
        <div className="flex items-center justify-between gap-3 px-5 h-14">
          <Brand />
        </div>
      </header>

      {/* Desktop left rail. */}
      <aside className="hidden lg:flex sticky top-0 h-dvh w-[260px] xl:w-[280px] flex-col gap-1 border-r border-white/[0.04] bg-canvas-950/40 backdrop-blur-xl px-4 py-6">
        <Brand large />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition-colors duration-150 ease-premium ${
                  isActive
                    ? "text-white"
                    : "text-ink-400 hover:text-white hover:bg-white/[0.04]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.07]"
                    />
                  ) : null}
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 -translate-y-1/2 -translate-x-2 rounded-full w-[3px] bg-brand-grad"
                    />
                  ) : null}
                  <Icon
                    className={`relative w-4 h-4 ${
                      isActive ? "text-teal-300" : "text-ink-400 group-hover:text-white"
                    }`}
                  />
                  <span className="relative">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-3.5 text-[11px] text-ink-500 leading-relaxed">
          <p className="text-ink-400 font-medium tracking-tight">Tip</p>
          <p className="mt-1">
            For lowest latency, allow microphone access — speech is recognised in
            your browser, only the translation goes to the server.
          </p>
        </div>
      </aside>

      {/* Main content. Mobile gets bottom padding so bottom nav doesn't cover. */}
      <main className="relative flex-1 min-w-0 pb-32 lg:pb-10">
        <div className="mx-auto w-full max-w-3xl xl:max-w-4xl px-5 lg:px-10 pt-4 lg:pt-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab nav. Big touch targets; safe-area aware. */}
      <nav
        aria-label="Primary"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 pb-safe backdrop-blur-2xl bg-canvas-950/70"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="grid grid-cols-4">
          {NAV.map(({ to, short, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 py-2.5 transition-colors duration-150 ${
                  isActive ? "text-white" : "text-ink-400 hover:text-ink-200"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={`absolute -top-px h-[2px] w-10 rounded-full transition-opacity duration-200 ${
                      isActive ? "opacity-100 bg-brand-grad" : "opacity-0"
                    }`}
                  />
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? "text-teal-300" : ""
                    }`}
                  />
                  <span className="text-[11px] font-medium tracking-tight">{short}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`flex items-center justify-center rounded-2xl bg-brand-grad text-canvas-950 shadow-glow-teal ${
          large ? "w-9 h-9" : "w-8 h-8"
        }`}
      >
        <Languages className={large ? "w-4.5 h-4.5" : "w-4 h-4"} />
      </div>
      <div className="leading-tight">
        <div
          className={`font-display font-semibold tracking-tightest text-white ${
            large ? "text-[17px]" : "text-[15px]"
          }`}
        >
          Translator
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500 font-medium">
          AI · Live · Call
        </div>
      </div>
    </div>
  );
}
