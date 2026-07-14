import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export type Accent = 'violet' | 'rose' | 'emerald' | 'amber' | 'blue' | 'cyan';

export const ACCENT: Record<Accent, {
  text: string; bg: string; bgSoft: string; border: string; glow: string; gradient: string; raw: string;
}> = {
  violet: { text: 'text-violet-600', bg: 'bg-violet-500', bgSoft: 'bg-violet-50', border: 'border-violet-200', glow: 'glow-violet', gradient: 'from-violet-500 to-purple-600', raw: '#8b5cf6' },
  rose: { text: 'text-rose-500', bg: 'bg-rose-500', bgSoft: 'bg-rose-50', border: 'border-rose-200', glow: 'glow-rose', gradient: 'from-rose-400 to-pink-600', raw: '#f43f5e' },
  emerald: { text: 'text-emerald-600', bg: 'bg-emerald-500', bgSoft: 'bg-emerald-50', border: 'border-emerald-200', glow: 'glow-emerald', gradient: 'from-emerald-400 to-teal-600', raw: '#10b981' },
  amber: { text: 'text-amber-600', bg: 'bg-amber-500', bgSoft: 'bg-amber-50', border: 'border-amber-200', glow: 'glow-amber', gradient: 'from-amber-400 to-orange-500', raw: '#f59e0b' },
  blue: { text: 'text-blue-600', bg: 'bg-blue-500', bgSoft: 'bg-blue-50', border: 'border-blue-200', glow: 'glow-violet', gradient: 'from-blue-500 to-indigo-600', raw: '#3b82f6' },
  cyan: { text: 'text-cyan-600', bg: 'bg-cyan-500', bgSoft: 'bg-cyan-50', border: 'border-cyan-200', glow: 'glow-violet', gradient: 'from-cyan-400 to-blue-500', raw: '#06b6d4' },
};

export function ModuleHeader({ icon: Icon, title, subtitle, accent }: { icon: LucideIcon; title: string; subtitle: string; accent: Accent }) {
  const a = ACCENT[accent];
  return (
    <div className="flex items-center gap-3 mb-5">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className={`relative w-10 h-10 rounded-xl ${a.bgSoft} ${a.border} border flex items-center justify-center ${a.glow}`}
      >
        <Icon className={a.text} size={18} />
      </motion.div>
      <div>
        <h3 className="text-[13px] font-bold tracking-tight text-slate-800">{title}</h3>
        <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.18em] mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange, columns = 2 }: { options: T[]; value: T; onChange: (v: T) => void; columns?: number }) {
  return (
    <div className={`grid gap-1 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button key={opt} onClick={() => onChange(opt)}
            className={`relative px-2 py-2 rounded-lg text-[10px] font-semibold transition-all duration-300 ${active ? 'text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'}`}>
            {active && (
              <motion.div layoutId={`seg-${options.join('-')}`} className="absolute inset-0 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-[0_4px_14px_rgba(139,92,246,0.35)]"
                transition={{ type: 'spring', stiffness: 400, damping: 28 }} />
            )}
            <span className="relative z-10 font-mono-data whitespace-nowrap">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SelectControl<T extends string>({ options, value, onChange, disabled }: { options: T[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className={`relative ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}
        className="w-full appearance-none bg-white/80 border border-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 rounded-xl px-3.5 py-3 text-[12px] font-mono-data text-slate-700 cursor-pointer outline-none transition-all shadow-sm">
        {options.map((o) => <option key={o} value={o} className="bg-white text-slate-700">{o}</option>)}
      </select>
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">▼</div>
    </div>
  );
}

export function SliderRow({ label, value, display, min, max, step, onChange, disabled, accent = 'violet' }: {
  label: string; value: number; display: string; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; accent?: Accent;
}) {
  const a = ACCENT[accent];
  const pct = ((value - min) / (max - min)) * 100;
  const cls = accent === 'rose' ? 'aegis-slider aegis-slider-rose' : accent === 'emerald' ? 'aegis-slider aegis-slider-emerald' : 'aegis-slider';
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="flex justify-between items-baseline mb-2.5">
        <label className="text-[11px] text-slate-500 font-semibold tracking-wide">{label}</label>
        <motion.span key={display} initial={{ scale: 1.1, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }}
          className={`font-mono-data text-[14px] font-bold ${a.text}`}>{display}</motion.span>
      </div>
      <input type="range" className={cls} style={{ ['--val' as any]: `${pct}%` }} min={min} max={max} step={step} value={value}
        disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <div className="flex justify-between mt-1.5">
        <span className="text-[9px] text-slate-400 font-mono-data">{min}</span>
        <span className="text-[9px] text-slate-400 font-mono-data">{max}</span>
      </div>
    </div>
  );
}

export function StatusPill({ options, value, onChange, accent = 'violet' }: { options: string[]; value: string; onChange: (v: string) => void; accent?: Accent }) {
  const a = ACCENT[accent];
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button key={opt} onClick={() => onChange(opt)}
            className={`relative px-2 py-2 rounded-lg text-[10px] font-semibold transition-all ${active ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}>
            {active && (
              <motion.div layoutId={`pill-${options.join('-')}`} className={`absolute inset-0 rounded-lg bg-gradient-to-br ${a.gradient} shadow-[0_4px_14px_rgba(139,92,246,0.3)]`}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }} />
            )}
            <span className="relative z-10 font-mono-data">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

export function KpiCard({ icon: Icon, label, value, sub, danger, accent = 'emerald' }: {
  icon: LucideIcon; label: string; value: string; sub: string; danger?: boolean; accent?: Accent;
}) {
  const a = ACCENT[danger ? 'rose' : accent];
  const card = danger ? 'glass-card-rose glow-rose' : `glass-card-${accent}`;
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`relative rounded-2xl p-5 overflow-hidden ${card}`}>
      <div className="flex items-start justify-between mb-3">
        <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className={`w-9 h-9 rounded-xl ${a.bgSoft} flex items-center justify-center`}>
          <Icon size={16} className={a.text} />
        </motion.div>
        <span className={`text-[9px] uppercase tracking-[0.18em] font-mono-data font-bold ${a.text} opacity-70`}>{label}</span>
      </div>
      <motion.div key={value} initial={{ opacity: 0.4, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className={`font-mono-data text-[26px] font-extrabold tracking-tight ${a.text}`}>{value}</motion.div>
      <div className="text-[10px] text-slate-400 mt-1 font-mono-data">{sub}</div>
      <div className={`absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${a.gradient} opacity-[0.06] blur-2xl`} />
    </motion.div>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, accent, children }: {
  icon: LucideIcon; title: string; subtitle: string; accent: Accent; children?: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-4">
        <motion.div initial={{ scale: 0.8, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className={`w-12 h-12 rounded-2xl ${a.bgSoft} ${a.border} border flex items-center justify-center ${a.glow}`}>
          <Icon className={a.text} size={24} />
        </motion.div>
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-slate-800">{title}</h1>
          <p className="text-[10px] text-slate-400 font-mono-data uppercase tracking-[0.2em] mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

export function GlassCard({ children, className = '', accent }: { children: React.ReactNode; className?: string; accent?: Accent }) {
  const cardClass = accent ? `glass-card-${accent}` : 'glass-card';
  return <div className={`${cardClass} ${className}`}>{children}</div>;
}

export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 rounded-full border-3 border-violet-200 border-t-violet-500" />
      {label && <p className="mt-4 text-[11px] text-slate-400 font-mono-data uppercase tracking-wider">{label}</p>}
    </div>
  );
}
