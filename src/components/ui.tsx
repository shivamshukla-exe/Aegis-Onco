import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type Accent = 'violet' | 'rose' | 'emerald' | 'amber' | 'blue' | 'cyan';

type AccentDefinition = {
  text: string;
  bg: string;
  bgSoft: string;
  border: string;
  glow: string;
  gradient: string;
  raw: string;
};

export const ACCENT: Record<Accent, AccentDefinition> = {
  violet: { text: 'text-violet-600', bg: 'bg-violet-600', bgSoft: 'bg-slate-100/80', border: 'border-violet-200', glow: 'glow-violet', gradient: 'from-violet-500 to-violet-600', raw: '#7159c7' },
  rose: { text: 'text-rose-600', bg: 'bg-rose-600', bgSoft: 'bg-slate-100/80', border: 'border-rose-200', glow: 'glow-rose', gradient: 'from-rose-500 to-rose-600', raw: '#c23c55' },
  emerald: { text: 'text-emerald-700', bg: 'bg-emerald-600', bgSoft: 'bg-slate-100/80', border: 'border-emerald-200', glow: 'glow-emerald', gradient: 'from-emerald-500 to-emerald-600', raw: '#16836b' },
  amber: { text: 'text-amber-700', bg: 'bg-amber-600', bgSoft: 'bg-slate-100/80', border: 'border-amber-200', glow: 'glow-amber', gradient: 'from-amber-500 to-amber-600', raw: '#a86412' },
  blue: { text: 'text-blue-700', bg: 'bg-blue-600', bgSoft: 'bg-slate-100/80', border: 'border-blue-200', glow: 'glow-violet', gradient: 'from-blue-500 to-blue-600', raw: '#2f6fb3' },
  cyan: { text: 'text-cyan-700', bg: 'bg-cyan-600', bgSoft: 'bg-slate-100/80', border: 'border-cyan-200', glow: 'glow-violet', gradient: 'from-cyan-500 to-cyan-600', raw: '#237f91' },
};

const controlBase = 'rounded-lg border border-slate-200 bg-white/80 text-slate-700 shadow-sm outline-none transition-colors focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/25';
const optionBase = 'relative min-h-9 rounded-lg px-2 py-2 text-[10px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500/35';

export function ModuleHeader({ icon: Icon, title, subtitle, accent }: { icon: LucideIcon; title: string; subtitle: string; accent: Accent }) {
  const a = ACCENT[accent];
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${a.bgSoft} ${a.border}`} aria-hidden="true">
        <Icon className={a.text} size={18} />
      </div>
      <div className="min-w-0">
        <h3 className="text-[13px] font-bold tracking-tight text-slate-800">{title}</h3>
        <p className="font-mono-data mt-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange, columns = 2 }: { options: T[]; value: T; onChange: (v: T) => void; columns?: number }) {
  return (
    <div className="grid gap-1 rounded-xl border border-slate-200/60 bg-slate-100/80 p-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="group" aria-label="Choose an option">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`${optionBase} ${active ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/80 hover:text-slate-800'}`}
          >
            <span className="font-mono-data block truncate">{option}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SelectControl<T extends string>({ options, value, onChange, disabled }: { options: T[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className={`relative ${disabled ? 'pointer-events-none opacity-45' : ''}`}>
      <select
        aria-label="Select an option"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        disabled={disabled}
        className={`${controlBase} font-mono-data w-full cursor-pointer appearance-none px-3.5 py-3 pr-9 text-[12px] disabled:cursor-not-allowed`}
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500">▼</span>
    </div>
  );
}

export function SliderRow({ label, value, display, min, max, step, onChange, disabled, accent = 'violet' }: {
  label: string; value: number; display: string; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; accent?: Accent;
}) {
  const a = ACCENT[accent];
  const range = max - min;
  const percentage = range === 0 ? 0 : ((value - min) / range) * 100;
  const sliderClass = accent === 'rose'
    ? 'aegis-slider aegis-slider-rose'
    : accent === 'emerald'
      ? 'aegis-slider aegis-slider-emerald'
      : 'aegis-slider';

  return (
    <div className={disabled ? 'opacity-45' : ''}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <label className="text-[11px] font-semibold tracking-wide text-slate-600">{label}</label>
        <output className={`font-mono-data text-[14px] font-bold ${a.text}`}>{display}</output>
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={display}
        className={sliderClass}
        style={{ '--val': `${percentage}%` } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
      />
      <div className="font-mono-data mt-1.5 flex justify-between text-[9px] text-slate-500" aria-hidden="true">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

export function StatusPill({ options, value, onChange, accent = 'violet' }: { options: string[]; value: string; onChange: (v: string) => void; accent?: Accent }) {
  const a = ACCENT[accent];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200/60 bg-slate-100/80 p-1" role="group" aria-label="Choose status">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`${optionBase} font-mono-data ${active ? `${a.bg} text-white shadow-sm` : 'text-slate-600 hover:bg-white/80 hover:text-slate-800'}`}
          >
            <span className="block truncate">{option}</span>
          </button>
        );
      })}
    </div>
  );
}

export function KpiCard({ icon: Icon, label, value, sub, danger, accent = 'emerald' }: {
  icon: LucideIcon; label: string; value: string; sub: string; danger?: boolean; accent?: Accent;
}) {
  const resolvedAccent: Accent = danger ? 'rose' : accent;
  const a = ACCENT[resolvedAccent];
  return (
    <section className={`glass-card-${resolvedAccent} relative overflow-hidden rounded-2xl p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--elevation-2)]`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.bgSoft}`} aria-hidden="true">
          <Icon size={16} className={a.text} />
        </div>
        <span className={`font-mono-data text-right text-[9px] font-bold uppercase tracking-[0.16em] ${a.text}`}>{label}</span>
      </div>
      <div className={`font-mono-data text-[26px] font-extrabold tracking-tight ${a.text}`}>{value}</div>
      <div className="font-mono-data mt-1 text-[10px] text-slate-500">{sub}</div>
    </section>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, accent, children }: {
  icon: LucideIcon; title: string; subtitle: string; accent: Accent; children?: ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${a.bgSoft} ${a.border}`} aria-hidden="true">
          <Icon className={a.text} size={23} />
        </div>
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight text-slate-800">{title}</h1>
          <p className="font-mono-data mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </header>
  );
}

export function GlassCard({ children, className = '', accent }: { children: ReactNode; className?: string; accent?: Accent }) {
  return <div className={`${accent ? `glass-card-${accent}` : 'glass-card'} ${className}`}>{children}</div>;
}

export function LoadingSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20" role="status" aria-live="polite">
      <div aria-hidden="true" className="h-9 w-9 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
      <p className="font-mono-data mt-4 text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}