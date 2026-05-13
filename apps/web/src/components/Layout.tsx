import { Languages, MessageSquareText, Mic, Phone } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { HealthBadge } from "./HealthBadge";
import { PageTransition } from "./PageTransition";

const NAV = [
  { to: "/", label: "Real-time", short: "Live", icon: Mic, end: true },
  { to: "/translate", label: "Translation", short: "Translate", icon: Languages, end: false },
  { to: "/dialogue", label: "Dialogue", short: "Chat", icon: MessageSquareText, end: false },
  { to: "/call", label: "Call", short: "Call", icon: Phone, end: false },
];

/**
 * App shell with responsive layout:
 * - Mobile: full-screen content + sticky bottom tab nav
 * - Desktop: fixed left sidebar + scrollable content
 */
export function Layout() {
  return (
    <div className="relative flex min-h-dvh w-full flex-col lg:flex-row">
      {/* Background decoration */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-violet-500/10 blur-[100px] animate-blob" />
        <div className="absolute -right-40 top-32 h-[400px] w-[400px] rounded-full bg-teal-500/10 blur-[100px] animate-blob" style={{ animationDelay: "-5s" }} />
        <div className="absolute bottom-0 left-1/4 h-[350px] w-[350px] rounded-full bg-violet-600/8 blur-[100px] animate-blob" style={{ animationDelay: "-10s" }} />
      </div>

      {/* Health status bar */}
      <HealthBadge />

      {/* Mobile topbar */}
      <header className="lg:hidden pt-safe sticky top-0 z-30 backdrop-blur-2xl bg-canvas-950/70">
        <div className="flex items-center justify-between gap-3 px-5 h-14">
          <Brand />
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex sticky top-0 h-dvh w-[260px] xl:w-[280px] flex-col border-r border-white/[0.04] bg-canvas-950/50 backdrop-blur-xl px-4 py-6">
        <Brand large />
        <nav className="mt-8 flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition-all duration-150 ease-premium ${
                  isActive
                    ? "text-white"
                    : "text-ink-400 hover:text-white hover:bg-white/[0.03]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span aria-hidden className="absolute inset-0 rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.06]" />
                  )}
                  {isActive && (
                    <span aria-hidden className="absolute left-0 top-1/2 h-5 -translate-y-1/2 -translate-x-2 rounded-full w-[3px] bg-brand-grad" />
                  )}
                  <Icon className={`relative w-4 h-4 transition-colors ${isActive ? "text-teal-300" : "text-ink-500 group-hover:text-ink-200"}`} />
                  <span className="relative">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="mt-auto px-3.5">
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.15em] text-ink-500 font-medium">Shortcuts</p>
            <div className="mt-2 space-y-1.5 text-[12px] text-ink-400">
              <div className="flex items-center justify-between">
                <span>Translate</span>
                <span className="flex gap-0.5"><kbd className="kbd">Ctrl</kbd><kbd className="kbd">Enter</kbd></span>
              </div>
              <div className="flex items-center justify-between">
                <span>Swap langs</span>
                <span className="flex gap-0.5"><kbd className="kbd">Ctrl</kbd><kbd className="kbd">Shift</kbd><kbd className="kbd">S</kbd></span>
              </div>
              <div className="flex items-center justify-between">
                <span>Clear</span>
                <span className="flex gap-0.5"><kbd className="kbd">Ctrl</kbd><kbd className="kbd">Shift</kbd><kbd className="kbd">X</kbd></span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="relative flex-1 min-w-0 pb-28 lg:pb-10">
        <div className="mx-auto w-full max-w-3xl xl:max-w-4xl px-5 lg:px-10 pt-6 lg:pt-10">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 pb-safe backdrop-blur-2xl bg-canvas-950/80"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="grid grid-cols-4">
          {NAV.map(({ to, short, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 py-2.5 transition-all duration-150 ${
                  isActive ? "text-white" : "text-ink-500"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={`absolute -top-px h-[2px] w-8 rounded-full transition-all duration-200 ${
                      isActive ? "opacity-100 bg-brand-grad" : "opacity-0"
                    }`}
                  />
                  <Icon className={`w-5 h-5 transition-colors ${isActive ? "text-teal-300" : ""}`} />
                  <span className="text-[10px] font-medium tracking-tight">{short}</span>
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
        <Languages className={large ? "w-4 h-4" : "w-3.5 h-3.5"} />
      </div>
      <div className="leading-tight">
        <div className={`font-display font-semibold tracking-tightest text-white ${large ? "text-[17px]" : "text-[15px]"}`}>
          Translator
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500 font-medium">
          AI Platform
        </div>
      </div>
    </div>
  );
}
