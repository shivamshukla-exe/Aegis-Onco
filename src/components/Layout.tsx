import { Children, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3, Command, Database, Dna, FlaskConical, GitCompare,
  LayoutDashboard, Menu, Server, Server as ServerIcon, ShieldCheck,
  Users, Wifi, X,
} from 'lucide-react';
import { DarkModeToggle } from './DarkMode';
import { useCommandPalette } from './CommandPalette';

const NAV_ITEMS = [
  { path: '/', label: 'Command Center', icon: LayoutDashboard, accent: 'violet' },
  { path: '/registry', label: 'Patient Registry', icon: Users, accent: 'blue' },
  { path: '/genomics', label: 'Genomics Explorer', icon: Dna, accent: 'rose' },
  { path: '/federated', label: 'Federated Learning', icon: Server, accent: 'emerald' },
  { path: '/simulator', label: 'Scenario Explorer', icon: GitCompare, accent: 'amber' },
  { path: '/analytics', label: 'Analytics & Insights', icon: BarChart3, accent: 'cyan' },
] as const;

const ACCENT_DOT: Record<(typeof NAV_ITEMS)[number]['accent'], string> = {
  violet: 'bg-violet-500',
  blue: 'bg-blue-500',
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  cyan: 'bg-cyan-500',
};

function UtcClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const display = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'UTC',
  });

  return <time dateTime={now.toISOString()} title="Coordinated Universal Time">{display} UTC</time>;
}

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const commandPalette = useCommandPalette();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const childNodes = Children.toArray(children);
  const routedContent = childNodes[0] ?? null;
  const persistentOverlays = childNodes.slice(1);

  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  return (
    <div className="mesh-bg relative min-h-screen overflow-x-hidden text-slate-800">
      <div className="app-grid-overlay pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 flex">
        <aside className="glass-card sticky top-3 m-3 hidden h-[calc(100vh-1.5rem)] w-[248px] shrink-0 flex-col rounded-2xl border-r border-slate-200/40 p-4 lg:flex">
          <div className="mb-4 flex items-center gap-3 px-2 py-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 shadow-sm" aria-hidden="true">
              <ShieldCheck className="text-white" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-extrabold leading-tight tracking-tight text-slate-800">AegisOnco</p>
              <p className="font-mono-data mt-0.5 text-[8px] uppercase tracking-[0.16em] text-slate-500">Research UI · Synthetic Data</p>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.path} to={item.path} end={item.path === '/'} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40">
                {({ isActive }) => (
                  <div className={`relative flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                    isActive
                      ? 'border-violet-200 bg-violet-50 text-violet-700'
                      : 'border-transparent text-slate-600 hover:border-slate-200/60 hover:bg-white/60 hover:text-slate-800'
                  }`}>
                    {isActive && <span className="absolute bottom-2.5 left-0 top-2.5 w-0.5 rounded-full bg-violet-600" aria-hidden="true" />}
                    <item.icon size={18} className={isActive ? 'text-violet-600' : 'text-slate-500'} aria-hidden="true" />
                    <span className="text-[12px] font-semibold">{item.label}</span>
                    <span className={`ml-auto h-1.5 w-1.5 rounded-full ${isActive ? ACCENT_DOT[item.accent] : 'bg-transparent'}`} aria-hidden="true" />
                  </div>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center justify-between gap-2 border-t border-slate-200/40 pt-3">
            <button
              type="button"
              onClick={() => commandPalette.setOpen(true)}
              className="group flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200/60 bg-slate-100/60 px-2.5 py-2 text-slate-500 outline-none hover:border-violet-300 hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500/35"
              aria-label="Open quick search"
            >
              <Command size={13} aria-hidden="true" />
              <span className="font-mono-data truncate text-[9px]">Quick Search</span>
              <kbd className="font-mono-data ml-auto rounded border border-slate-200 bg-white/60 px-1 py-0.5 text-[8px]">⌘K</kbd>
            </button>
            <DarkModeToggle />
          </div>

          <div className="mt-3 space-y-2 border-t border-slate-200/40 pt-4" aria-label="Environment status">
            <div className="flex items-center gap-2 px-2">
              <FlaskConical className="text-violet-600" size={12} aria-hidden="true" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-violet-700">Research Demo</span>
            </div>
            <div className="flex items-center gap-2 px-2">
              <Database className="text-emerald-600" size={12} aria-hidden="true" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Synthetic Records</span>
            </div>
            <div className="flex items-center gap-2 px-2">
              <Wifi className="text-slate-500" size={12} aria-hidden="true" />
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Demo Sync</span>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            </div>
            <div className="font-mono-data flex items-center gap-2 px-2 text-[9px] text-slate-500">
              <ServerIcon size={12} aria-hidden="true" />
              <span>US-EAST-92</span>
              <span className="ml-auto"><UtcClock /></span>
            </div>
          </div>
        </aside>

        <header className="glass-card fixed inset-x-0 top-0 z-50 border-x-0 border-t-0 px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600" aria-hidden="true">
                <ShieldCheck className="text-white" size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-extrabold text-slate-800">AegisOnco</p>
                <p className="font-mono-data truncate text-[8px] uppercase tracking-wider text-slate-500">Research Demo · Synthetic Records</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => commandPalette.setOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-violet-500/35"
                aria-label="Open quick search"
              >
                <Command size={18} aria-hidden="true" />
              </button>
              <DarkModeToggle />
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-violet-500/35"
                aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-navigation"
                onClick={() => setMobileNavOpen((open) => !open)}
              >
                {mobileNavOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {mobileNavOpen && (
              <motion.nav
                id="mobile-navigation"
                aria-label="Mobile navigation"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-1 border-t border-slate-200/60 pb-1 pt-3 sm:grid-cols-2">
                  {NAV_ITEMS.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500/35 ${
                        isActive
                          ? 'border-violet-200 bg-violet-50 text-violet-700'
                          : 'border-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-800'
                      }`}
                    >
                      <item.icon size={15} aria-hidden="true" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-6 pt-[5.5rem] lg:px-6 lg:py-6" id="main-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {routedContent}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {persistentOverlays}
    </div>
  );
}