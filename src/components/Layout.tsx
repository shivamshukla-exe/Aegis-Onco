import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, LayoutDashboard, Users, Dna, Server, GitCompare,
  BarChart3, Lock, Wifi, Server as ServerIcon, Command,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { DarkModeToggle } from './DarkMode';
import { useCommandPalette } from './CommandPalette';

const NAV_ITEMS = [
  { path: '/', label: 'Command Center', icon: LayoutDashboard, accent: 'violet' },
  { path: '/registry', label: 'Patient Registry', icon: Users, accent: 'blue' },
  { path: '/genomics', label: 'Genomics Explorer', icon: Dna, accent: 'rose' },
  { path: '/federated', label: 'Federated Learning', icon: Server, accent: 'emerald' },
  { path: '/simulator', label: 'Treatment Simulator', icon: GitCompare, accent: 'amber' },
  { path: '/analytics', label: 'Analytics & Insights', icon: BarChart3, accent: 'cyan' },
];

const ACCENT_DOT: Record<string, string> = {
  violet: 'bg-violet-500',
  blue: 'bg-blue-500',
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  cyan: 'bg-cyan-500',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [now, setNow] = useState(new Date());
  const commandPalette = useCommandPalette();

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const timeStr = now.toUTCString().split(' ')[4];

  return (
    <div className="min-h-screen mesh-bg text-slate-800 relative overflow-x-hidden">
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div animate={{ x: [0, 40, 0], y: [0, -30, 0] }} transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[10%] left-[15%] w-[400px] h-[400px] bg-violet-300/20 rounded-full blur-[100px]" />
        <motion.div animate={{ x: [0, -50, 0], y: [0, 40, 0] }} transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[15%] right-[12%] w-[350px] h-[350px] bg-pink-300/15 rounded-full blur-[100px]" />
        <motion.div animate={{ x: [0, 30, 0], y: [0, -20, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[40%] right-[30%] w-[300px] h-[300px] bg-emerald-300/12 rounded-full blur-[100px]" />
      </div>

      {/* Grid overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.4]"
        style={{ backgroundImage: 'linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      <div className="relative z-10 flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-[240px] min-h-screen sticky top-0 glass-card border-r border-slate-200/40 m-3 rounded-3xl p-4">
          {/* Logo */}
          <div className="flex items-center gap-3 px-2 py-3 mb-4">
            <motion.div initial={{ scale: 0.8, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center glow-violet">
              <ShieldCheck className="text-white" size={22} />
              <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.5, repeat: Infinity }}
                className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full" />
            </motion.div>
            <div>
              <h1 className="text-[14px] font-extrabold tracking-tight text-slate-800 leading-tight">AegisOnco</h1>
              <p className="text-[8px] text-slate-400 font-mono-data uppercase tracking-[0.18em]">Digital Twin v4.2.1</p>
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex flex-col gap-1 flex-1">
            {NAV_ITEMS.map((item, i) => (
              <NavLink key={item.path} to={item.path} end={item.path === '/'}>
                {({ isActive }) => (
                  <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                    <div className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ${
                      isActive ? 'bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200' : 'hover:bg-white/60 border border-transparent'
                    }`}>
                      {isActive && (
                        <motion.div layoutId="nav-active-bar" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-gradient-to-b from-violet-500 to-purple-600"
                          transition={{ type: 'spring', stiffness: 400, damping: 28 }} />
                      )}
                      <item.icon size={18} className={isActive ? 'text-violet-600' : 'text-slate-400'} />
                      <span className={`text-[12px] font-semibold ${isActive ? 'text-violet-700' : 'text-slate-600'}`}>{item.label}</span>
                      <span className={`ml-auto w-2 h-2 rounded-full ${isActive ? ACCENT_DOT[item.accent] : 'bg-transparent'}`} />
                    </div>
                  </motion.div>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Command palette hint + dark mode */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200/40">
            <button onClick={() => commandPalette.setOpen(true)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-100/60 border border-slate-200/40 hover:border-violet-300 hover:bg-violet-50 transition-all group">
              <Command size={12} className="text-slate-400 group-hover:text-violet-500" />
              <span className="text-[9px] text-slate-400 font-mono-data group-hover:text-violet-500">Quick Search</span>
              <kbd className="ml-auto text-[8px] font-mono-data text-slate-400 bg-white/60 border border-slate-200/40 rounded px-1 py-0.5">⌘K</kbd>
            </button>
            <DarkModeToggle />
          </div>

          {/* Status footer */}
          <div className="space-y-2 pt-4 mt-3 border-t border-slate-200/40">
            <div className="flex items-center gap-2 px-2">
              <Lock className="text-emerald-500" size={12} />
              <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">HIPAA Validated</span>
            </div>
            <div className="flex items-center gap-2 px-2">
              <Wifi className="text-violet-500" size={12} />
              <span className="text-[9px] text-violet-600 font-bold uppercase tracking-wider">Global Sync Live</span>
              <span className="relative flex h-1.5 w-1.5 ml-auto">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" />
              </span>
            </div>
            <div className="flex items-center gap-2 px-2">
              <ServerIcon className="text-slate-400" size={12} />
              <span className="text-[9px] text-slate-400 font-mono-data">US-EAST-92</span>
              <span className="text-[9px] text-slate-400 font-mono-data ml-auto">{timeStr}</span>
            </div>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-card border-b border-slate-200/40 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <ShieldCheck className="text-white" size={16} />
              </div>
              <span className="text-[13px] font-extrabold text-slate-800">AegisOnco</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[9px] text-slate-400 font-mono-data">LIVE</span>
            </div>
          </div>
          <nav className="flex gap-1 mt-3 overflow-x-auto pb-1">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap text-[10px] font-semibold transition-all ${
                  isActive ? 'bg-violet-100 text-violet-700 border border-violet-200' : 'text-slate-500 bg-white/40'
                }`}>
                <item.icon size={12} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 lg:px-6 py-6 pt-20 lg:pt-6">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
