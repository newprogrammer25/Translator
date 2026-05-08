import { Languages, MessageSquareText, Mic, Phone } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/", label: "Real-time", icon: Mic, end: true },
  { to: "/translate", label: "AI Translation", icon: Languages, end: false },
  { to: "/dialogue", label: "AI Dialogue", icon: MessageSquareText, end: false },
  { to: "/call", label: "Call", icon: Phone, end: false },
];

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-ink-950/70 border-b border-ink-800/80">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <Languages className="w-4 h-4 text-ink-950" />
            </div>
            <span className="font-semibold tracking-tight text-ink-50">Translator</span>
            <span className="hidden sm:inline text-xs text-ink-400">AI · Real-time · Call</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
                    isActive
                      ? "bg-brand-500/10 text-brand-200 ring-1 ring-brand-500/30"
                      : "text-ink-300 hover:bg-ink-800/60 hover:text-ink-100"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pt-4 pb-28 md:pb-8">
        <Outlet />
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 backdrop-blur-xl bg-ink-950/85 border-t border-ink-800/80 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-2 text-[11px] transition ${
                  isActive ? "text-brand-300" : "text-ink-400"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
