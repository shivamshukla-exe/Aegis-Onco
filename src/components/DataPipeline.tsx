import { useEffect, useRef, useState } from 'react';
import { motion, useInView, animate } from 'framer-motion';
import { FileText, Dna, Microscope, Brain, Activity, Zap, Clock, HeartPulse } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ACCENT } from './ui';
import type { Accent } from './ui';

/* ─────────────────────────────────────────────────────────────
   DataPipeline — animated horizontal SVG pipeline showing
   oncology data flowing through 5 inference stages.
   Sits at the top of the Command Center page.
   ───────────────────────────────────────────────────────────── */

interface Stage {
  name: string;
  icon: LucideIcon;
  accent: Accent;
  status: 'active' | 'processing';
}

const STAGES: Stage[] = [
  { name: 'EHR Intake',          icon: FileText,  accent: 'blue',    status: 'active' },
  { name: 'Genomic Sequencing',  icon: Dna,      accent: 'rose',    status: 'processing' },
  { name: 'Histopathology',      icon: Microscope, accent: 'emerald', status: 'processing' },
  { name: 'ML Inference',        icon: Brain,    accent: 'violet',  status: 'active' },
  { name: 'Prognostic Output',   icon: Activity, accent: 'amber',   status: 'active' },
];

/* Animated number that eases toward its target on mount/refresh. */
function AnimatedNumber({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: false, margin: '-40px' });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <span ref={ref} className="font-mono-data">
      {display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* A single glass stage card with glowing icon + pulse + hover lift. */
function StageCard({ stage, index }: { stage: Stage; index: number }) {
  const a = ACCENT[stage.accent];
  const Icon = stage.icon;
  const isProcessing = stage.status === 'processing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.12, type: 'spring', stiffness: 280, damping: 22 }}
      whileHover={{ y: -8, scale: 1.04 }}
      className="relative group w-[150px] sm:w-[160px] shrink-0"
    >
      {/* Subtle breathing pulse on the card border */}
      <motion.div
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: index * 0.3 }}
        className="absolute -inset-px rounded-2xl pointer-events-none"
        style={{ boxShadow: `0 0 0 1px ${a.raw}22, 0 8px 30px -10px ${a.raw}40` }}
      />

      <div
        className="relative rounded-2xl p-4 overflow-hidden transition-shadow duration-300 group-hover:shadow-[0_20px_60px_-12px_rgba(15,23,42,0.25)]"
        style={{
          background: 'rgba(255,255,255,0.78)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${a.raw}26`,
        }}
      >
        {/* Stage index ribbon */}
        <div className="absolute top-0 right-0 px-2 py-0.5 rounded-bl-lg text-[8px] font-mono-data font-bold tracking-wider text-white"
          style={{ background: a.raw }}>
          0{index + 1}
        </div>

        {/* Glowing icon circle */}
        <div className="relative flex items-center justify-center mb-3">
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: index * 0.25 }}
            className="relative w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: `${a.raw}1a`, boxShadow: `0 0 24px -4px ${a.raw}80` }}
          >
            {/* Expanding pulse ring */}
            <motion.span
              animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', delay: index * 0.3 }}
              className="absolute inset-0 rounded-full"
              style={{ border: `1.5px solid ${a.raw}` }}
            />
            <Icon size={22} style={{ color: a.raw }} />
          </motion.div>
        </div>

        {/* Stage name */}
        <div className="text-center">
          <h4 className="text-[11px] font-bold tracking-tight text-slate-800 leading-tight">{stage.name}</h4>
        </div>

        {/* Status indicator */}
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            {isProcessing && (
              <motion.span
                animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                className="absolute inline-flex h-full w-full rounded-full"
                style={{ background: a.raw }}
              />
            )}
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: a.raw }} />
          </span>
          <span className="text-[8px] font-mono-data font-bold uppercase tracking-[0.16em]"
            style={{ color: a.raw }}>
            {isProcessing ? 'Processing' : 'Active'}
          </span>
        </div>

        {/* Decorative corner gradient */}
        <div className="absolute -bottom-6 -right-6 w-16 h-16 rounded-full opacity-[0.10] blur-xl pointer-events-none"
          style={{ background: a.raw }} />
      </div>
    </motion.div>
  );
}

/* Horizontal SVG connector with flowing data particles. */
function HorizontalConnector({ fromColor, toColor }: { fromColor: string; toColor: string }) {
  const W = 56;   // connector width
  const H = 48;   // viewBox height (matches card center band)
  const path = `M 0 ${H / 2} C ${W * 0.35} ${H / 2}, ${W * 0.65} ${H / 2}, ${W} ${H / 2}`;

  const particles = [
    { delay: 0,   duration: 2.0, r: 2.4 },
    { delay: 0.7, duration: 2.0, r: 2.0 },
    { delay: 1.4, duration: 2.0, r: 1.6 },
  ];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 overflow-visible self-center">
      <defs>
        <linearGradient id={`grad-${fromColor}-${toColor}`.replace(/#/g, '')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fromColor} stopOpacity="0.7" />
          <stop offset="100%" stopColor={toColor} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      {/* Base track */}
      <path d={path} fill="none" stroke={`url(#grad-${fromColor}-${toColor}`.replace(/#/g, '')} strokeWidth="1.5"
        strokeDasharray="3 3" opacity="0.45" />
      {/* Flowing particles */}
      {particles.map((p, i) => (
        <motion.circle
          key={i}
          r={p.r}
          fill={i % 2 === 0 ? fromColor : toColor}
          style={{ filter: `drop-shadow(0 0 4px ${i % 2 === 0 ? fromColor : toColor})` }}
          initial={{ offsetDistance: '0%' }}
          animate={{ offsetDistance: ['0%', '100%'] }}
          transition={{ duration: p.duration, repeat: Infinity, ease: 'linear', delay: p.delay }}
        >
          <animateMotion dur={`${p.duration}s`} repeatCount="indefinite" begin={`${p.delay}s`} path={path} />
        </motion.circle>
      ))}
    </svg>
  );
}

/* Vertical SVG connector for mobile stacking. */
function VerticalConnector({ fromColor, toColor }: { fromColor: string; toColor: string }) {
  const W = 48;
  const H = 44;
  const path = `M ${W / 2} 0 C ${W / 2} ${H * 0.35}, ${W / 2} ${H * 0.65}, ${W / 2} ${H}`;

  const particles = [
    { delay: 0,   duration: 2.0, r: 2.4 },
    { delay: 0.7, duration: 2.0, r: 1.8 },
  ];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={`vgrad-${fromColor}-${toColor}`.replace(/#/g, '')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fromColor} stopOpacity="0.7" />
          <stop offset="100%" stopColor={toColor} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke={`url(#vgrad-${fromColor}-${toColor}`.replace(/#/g, '')} strokeWidth="1.5"
        strokeDasharray="3 3" opacity="0.45" />
      {particles.map((p, i) => (
        <motion.circle
          key={i}
          r={p.r}
          fill={i % 2 === 0 ? fromColor : toColor}
          style={{ filter: `drop-shadow(0 0 4px ${i % 2 === 0 ? fromColor : toColor})` }}
          initial={{ offsetDistance: '0%' }}
        >
          <animateMotion dur={`${p.duration}s`} repeatCount="indefinite" begin={`${p.delay}s`} path={path} />
        </motion.circle>
      ))}
    </svg>
  );
}

/* Throughput metric tile with animated number. */
function MetricTile({ icon: Icon, label, value, decimals, suffix, accent }: {
  icon: LucideIcon; label: string; value: number; decimals: number; suffix: string; accent: Accent;
}) {
  const a = ACCENT[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 22 }}
      whileHover={{ y: -3 }}
      className="relative rounded-2xl p-4 overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${a.raw}26`,
        boxShadow: `0 1px 3px rgba(15,23,42,0.04), 0 10px 40px -10px ${a.raw}26`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${a.raw}1a` }}>
          <Icon size={14} style={{ color: a.raw }} />
        </div>
        <span className="text-[9px] font-mono-data font-bold uppercase tracking-[0.18em] text-slate-400">{label}</span>
      </div>
      <div className="text-[24px] font-extrabold tracking-tight" style={{ color: a.raw }}>
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </div>
      {/* Live sparkline bar */}
      <div className="mt-2 flex items-end gap-0.5 h-5">
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.div
            key={i}
            animate={{ height: [`${20 + ((i * 37) % 60)}%`, `${40 + ((i * 53) % 50)}%`, `${20 + ((i * 37) % 60)}%`] }}
            transition={{ duration: 1.8 + (i % 4) * 0.3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 }}
            className="flex-1 rounded-sm"
            style={{ background: a.raw, opacity: 0.35 }}
          />
        ))}
      </div>
      <div className="absolute -bottom-8 -right-8 w-20 h-20 rounded-full opacity-[0.08] blur-2xl pointer-events-none"
        style={{ background: a.raw }} />
    </motion.div>
  );
}

export default function DataPipeline() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden rounded-3xl"
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.85)',
        boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 24px 60px -16px rgba(15,23,42,0.12)',
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 sm:px-7 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0.8, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(139,92,246,0.12)', boxShadow: '0 0 20px -4px rgba(139,92,246,0.5)' }}
          >
            <Zap size={18} className="text-violet-600" />
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400"
            />
          </motion.div>
          <div>
            <h2 className="text-[14px] font-extrabold tracking-tight text-slate-800">Data Pipeline</h2>
            <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.2em] mt-0.5">
              Real-time oncology inference stream
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <motion.span
              animate={{ scale: [1, 2.4], opacity: [0.7, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inline-flex h-full w-full rounded-full bg-emerald-400"
            />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[9px] font-mono-data font-bold uppercase tracking-[0.18em] text-emerald-600">Streaming</span>
        </div>
      </div>

      {/* ── Pipeline track ── */}
      <div className="relative px-5 sm:px-7 pb-2">
        {/* Scanning light sweep (horizontal) */}
        <motion.div
          animate={{ x: ['-10%', '110%'] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.5 }}
          className="hidden md:block absolute top-0 bottom-0 w-40 pointer-events-none z-20"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.10), transparent)',
          }}
        />

        {/* Desktop: horizontal row */}
        <div className="hidden md:flex items-center justify-center">
          {STAGES.map((stage, i) => (
            <div key={stage.name} className="flex items-center">
              <StageCard stage={stage} index={i} />
              {i < STAGES.length - 1 && (
                <HorizontalConnector
                  fromColor={ACCENT[stage.accent].raw}
                  toColor={ACCENT[STAGES[i + 1].accent].raw}
                />
              )}
            </div>
          ))}
        </div>

        {/* Mobile: vertical stack */}
        <div className="md:hidden flex flex-col items-center">
          {STAGES.map((stage, i) => (
            <div key={stage.name} className="flex flex-col items-center">
              <StageCard stage={stage} index={i} />
              {i < STAGES.length - 1 && (
                <VerticalConnector
                  fromColor={ACCENT[stage.accent].raw}
                  toColor={ACCENT[STAGES[i + 1].accent].raw}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Throughput metrics ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-5 sm:px-7 pb-5 pt-3">
        <MetricTile icon={FileText}  label="Records / min"   value={1284} decimals={0} suffix=""   accent="blue" />
        <MetricTile icon={Clock}     label="Model Latency"   value={42.7} decimals={1} suffix="ms" accent="violet" />
        <MetricTile icon={HeartPulse} label="Pipeline Health" value={99.4} decimals={1} suffix="%" accent="emerald" />
      </div>

      {/* Bottom accent line */}
      <div className="h-px w-full" style={{
        background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.25), rgba(244,63,94,0.25), rgba(16,185,129,0.25), rgba(245,158,11,0.25), transparent)',
      }} />
    </div>
  );
}
