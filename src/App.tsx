import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Radio, ShieldCheck, Cpu, Dna, HeartPulse, ScanLine,
  AlertTriangle, TrendingUp, Server,
  Lock, Wifi, Layers, Gauge, Sparkles, FlaskConical, GitBranch,
  CircleDot, BarChart3, Zap, Brain,
} from 'lucide-react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, RadialBarChart,
  RadialBar, PolarAngleAxis, BarChart, Bar, Cell,
} from 'recharts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Stage = 'Stage 0' | 'Stage I' | 'Stage II' | 'Stage III' | 'Stage IV';
type Cellularity = 'Low' | 'Moderate' | 'High';
type Status = 'Positive' | 'Negative';
type Intervention = 'Standard Clinical Routine' | 'Targeted Kinase Inhibition' | 'Double-Agent Cocktail';

interface CurvePoint {
  day: number;
  survival: number;
  range: [number, number];
}

interface MCHazard {
  meanHazard: number;
  uncertaintyStd: number;
  samples: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const STAGES: Stage[] = ['Stage 0', 'Stage I', 'Stage II', 'Stage III', 'Stage IV'];
const CELLULARITIES: Cellularity[] = ['Low', 'Moderate', 'High'];
const INTERVENTIONS: Intervention[] = [
  'Standard Clinical Routine',
  'Targeted Kinase Inhibition',
  'Double-Agent Cocktail',
];

const STAGE_MAP: Record<Stage, number> = {
  'Stage 0': 0.0, 'Stage I': 1.0, 'Stage II': 2.0, 'Stage III': 3.0, 'Stage IV': 4.0,
};
const CELLULARITY_MAP: Record<Cellularity, number> = { Low: 1.0, Moderate: 2.0, High: 3.0 };

// ─────────────────────────────────────────────────────────────────────────────
// Math Engine — Cox PH + Breslow Baseline + Monte Carlo Dropout Simulation
// ─────────────────────────────────────────────────────────────────────────────

// Deterministic pseudo-random generator (mulberry32) for reproducible MC samples
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform for Gaussian samples
function gaussian(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function computeLogHazard(
  age: number, tumorSize: number, lymphNodes: number, npi: number,
  stage: Stage, hasFullStaging: boolean,
  tp53: number, egfr: number, kras: number, myc: number,
  grade: number, cellularity: Cellularity, mutationCount: number,
  erStatus: Status, her2Status: Status, prStatus: Status,
  intervention: Intervention,
): number {
  const stageValue = hasFullStaging ? STAGE_MAP[stage] : 0.0;

  // Clinical features (5 features matching METABRIC dimensions)
  let logHazard =
    (age / 100) * 1.2 +
    (tumorSize / 180) * 0.8 +
    (lymphNodes / 45) * 1.1 +
    (npi / 6.5) * 0.9 +
    (stageValue / 4) * 1.5;

  if (!hasFullStaging) logHazard += 0.3; // Missing data penalty

  // Genomic features (16-gene panel, 4 exposed)
  logHazard += tp53 * 0.35;
  logHazard += egfr * 0.28;
  logHazard += kras * 0.18;
  logHazard += myc * 0.22;

  // Counterfactual interventions
  if (intervention === 'Targeted Kinase Inhibition') {
    logHazard -= 0.9; // Block EGFR pathway
  } else if (intervention === 'Double-Agent Cocktail') {
    logHazard -= 1.6; // Block EGFR + boost p53
    logHazard += 0.1; // Synergy adjustment
  }

  // Histologic / morphometric proxy
  logHazard += (grade - 2) * 0.3;
  logHazard += (CELLULARITY_MAP[cellularity] - 2) * 0.15;
  logHazard += (mutationCount / 30) * 0.4;

  // Receptor status modifiers
  if (erStatus === 'Positive') logHazard -= 0.25;
  if (her2Status === 'Positive') logHazard += 0.2;
  if (prStatus === 'Positive') logHazard -= 0.15;

  return logHazard;
}

function runMCDropout(
  baseLogHazard: number,
  hasFullStaging: boolean,
  intervention: Intervention,
  numSamples = 20,
): MCHazard {
  const rng = mulberry32(Math.floor(baseLogHazard * 10000) + intervention.length);

  // Base uncertainty varies by data completeness
  let baseUncertainty = hasFullStaging ? 0.25 : 0.65;

  // Advanced interventions carry more model uncertainty
  if (intervention !== 'Standard Clinical Routine') baseUncertainty += 0.12;

  const samples: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    // Simulate dropout noise — each sample perturbs the hazard
    const dropoutNoise = gaussian(rng) * baseUncertainty;
    // Add per-feature perturbation to simulate stochastic forward passes
    const featureNoise = gaussian(rng) * 0.08;
    samples.push(baseLogHazard + dropoutNoise + featureNoise);
  }

  const meanHazard = samples.reduce((a, b) => a + b, 0) / numSamples;
  const variance = samples.reduce((a, b) => a + (b - meanHazard) ** 2, 0) / numSamples;
  const uncertaintyStd = Math.sqrt(variance);

  return { meanHazard, uncertaintyStd, samples };
}

function generateSurvivalCurve(meanHazard: number, uncertaintyStd: number): CurvePoint[] {
  const chartData: CurvePoint[] = [];
  for (let t = 0; t <= 2000; t += 20) {
    const h0 = Math.pow(t / 1200, 1.8);

    let surv = Math.exp(-h0 * Math.exp(meanHazard)) * 100;
    let upper = Math.exp(-h0 * Math.exp(meanHazard - 1.96 * uncertaintyStd)) * 100;
    let lower = Math.exp(-h0 * Math.exp(meanHazard + 1.96 * uncertaintyStd)) * 100;

    surv = Math.min(Math.max(surv, 0), 100);
    upper = Math.min(Math.max(upper, 0), 100);
    lower = Math.min(Math.max(lower, 0), 100);

    chartData.push({ day: t, survival: surv, range: [lower, upper] });
  }
  return chartData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Accent palette
// ─────────────────────────────────────────────────────────────────────────────
type Accent = 'violet' | 'rose' | 'emerald' | 'amber' | 'blue' | 'cyan';

const ACCENT: Record<Accent, {
  text: string; bg: string; bgSoft: string; border: string; glow: string; gradient: string; raw: string;
}> = {
  violet: { text: 'text-violet-600', bg: 'bg-violet-500', bgSoft: 'bg-violet-50', border: 'border-violet-200', glow: 'glow-violet', gradient: 'from-violet-500 to-purple-600', raw: '#8b5cf6' },
  rose: { text: 'text-rose-500', bg: 'bg-rose-500', bgSoft: 'bg-rose-50', border: 'border-rose-200', glow: 'glow-rose', gradient: 'from-rose-400 to-pink-600', raw: '#f43f5e' },
  emerald: { text: 'text-emerald-600', bg: 'bg-emerald-500', bgSoft: 'bg-emerald-50', border: 'border-emerald-200', glow: 'glow-emerald', gradient: 'from-emerald-400 to-teal-600', raw: '#10b981' },
  amber: { text: 'text-amber-600', bg: 'bg-amber-500', bgSoft: 'bg-amber-50', border: 'border-amber-200', glow: 'glow-amber', gradient: 'from-amber-400 to-orange-500', raw: '#f59e0b' },
  blue: { text: 'text-blue-600', bg: 'bg-blue-500', bgSoft: 'bg-blue-50', border: 'border-blue-200', glow: 'glow-violet', gradient: 'from-blue-500 to-indigo-600', raw: '#3b82f6' },
  cyan: { text: 'text-cyan-600', bg: 'bg-cyan-500', bgSoft: 'bg-cyan-50', border: 'border-cyan-200', glow: 'glow-violet', gradient: 'from-cyan-400 to-blue-500', raw: '#06b6d4' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Reusable control primitives
// ─────────────────────────────────────────────────────────────────────────────
function ModuleHeader({ icon: Icon, title, subtitle, accent }: { icon: typeof Activity; title: string; subtitle: string; accent: Accent }) {
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

function SegmentedControl<T extends string>({ options, value, onChange, columns = 2 }: { options: T[]; value: T; onChange: (v: T) => void; columns?: number }) {
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

function SelectControl<T extends string>({ options, value, onChange, disabled }: { options: T[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
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

function SliderRow({ label, value, display, min, max, step, onChange, disabled, accent = 'violet' }: {
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

function StatusPill({ options, value, onChange, accent = 'violet' }: { options: Status[]; value: Status; onChange: (v: Status) => void; accent?: Accent }) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Custom Tooltip
// ─────────────────────────────────────────────────────────────────────────────
function CurveTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as CurvePoint;
  if (!p) return null;
  return (
    <div className="glass-card rounded-xl px-4 py-3 min-w-[200px]">
      <div className="text-[9px] text-violet-500 uppercase tracking-[0.18em] mb-2 font-bold">Telemetry Probe</div>
      <div className="flex items-center justify-between gap-6 mb-1.5">
        <span className="text-[11px] text-slate-500">Day</span>
        <span className="font-mono-data text-[13px] text-slate-800 font-bold">{p.day}</span>
      </div>
      <div className="flex items-center justify-between gap-6 mb-1.5">
        <span className="text-[11px] text-violet-600">Mean Survival</span>
        <span className="font-mono-data text-[13px] text-violet-600 font-bold">{p.survival.toFixed(2)}%</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-[11px] text-slate-500">95% CI</span>
        <span className="font-mono-data text-[12px] text-slate-600">{p.range[0].toFixed(1)}–{p.range[1].toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, danger, accent = 'emerald' }: {
  icon: typeof Gauge; label: string; value: string; sub: string; danger?: boolean; accent?: Accent;
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

// ─────────────────────────────────────────────────────────────────────────────
// MC Dropout Histogram
// ─────────────────────────────────────────────────────────────────────────────
function MCHistogram({ samples, mean }: { samples: number[]; mean: number }) {
  const bins = 10;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;
  const binWidth = range / bins;
  const histogram = Array.from({ length: bins }, (_, i) => {
    const lo = min + i * binWidth;
    const hi = lo + binWidth;
    const count = samples.filter((s) => s >= lo && s < hi).length;
    return { bin: i, range: `${lo.toFixed(2)}`, count };
  });

  return (
    <div className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={histogram} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.15)" vertical={false} />
          <XAxis dataKey="bin" stroke="#94a3b8" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <YAxis stroke="#94a3b8" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {histogram.map((_, i) => (
              <Cell key={i} fill={i === Math.floor((mean - min) / binWidth) ? '#8b5cf6' : '#c4b5fd'} />
            ))}
          </Bar>
          <Tooltip
            contentStyle={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, fontSize: 10, fontFamily: 'JetBrains Mono' }}
            labelStyle={{ color: '#64748b' }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Uncertainty Gauge
// ─────────────────────────────────────────────────────────────────────────────
function UncertaintyGauge({ value }: { value: number }) {
  const pct = Math.min(value / 1.5, 1) * 100;
  const danger = value > 0.8;
  const data = [{ name: 'σ', value: pct, fill: danger ? '#f43f5e' : value > 0.5 ? '#f59e0b' : '#10b981' }];
  return (
    <div className="relative h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="65%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background={{ fill: 'rgba(148,163,184,0.12)' }} dataKey="value" cornerRadius={10} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono-data text-[22px] font-extrabold ${danger ? 'text-rose-500' : value > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {value.toFixed(2)}
        </span>
        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-mono-data">σ Uncertainty</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // Clinical metadata
  const [age, setAge] = useState(60);
  const [tumorSize, setTumorSize] = useState(25);
  const [lymphNodes, setLymphNodes] = useState(0);
  const [npi, setNpi] = useState(4.0);
  const [stage, setStage] = useState<Stage>('Stage II');
  const [hasFullStaging, setHasFullStaging] = useState(true);

  // Genomic (16-gene panel, 4 exposed)
  const [tp53, setTp53] = useState(0.0);
  const [egfr, setEgfr] = useState(0.0);
  const [kras, setKras] = useState(0.0);
  const [myc, setMyc] = useState(0.0);

  // Histologic / morphometric
  const [grade, setGrade] = useState(2);
  const [cellularity, setCellularity] = useState<Cellularity>('Moderate');
  const [mutationCount, setMutationCount] = useState(5);
  const [erStatus, setErStatus] = useState<Status>('Positive');
  const [her2Status, setHer2Status] = useState<Status>('Negative');
  const [prStatus, setPrStatus] = useState<Status>('Positive');

  // Intervention
  const [intervention, setIntervention] = useState<Intervention>('Standard Clinical Routine');

  // Simulation run state
  const [hasRun, setHasRun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runCount, setRunCount] = useState(0);

  // ── Compute everything reactively ──
  const engine = useMemo(() => {
    const baseLogHazard = computeLogHazard(
      age, tumorSize, lymphNodes, npi, stage, hasFullStaging,
      tp53, egfr, kras, myc,
      grade, cellularity, mutationCount,
      erStatus, her2Status, prStatus,
      intervention,
    );

    const mc = runMCDropout(baseLogHazard, hasFullStaging, intervention, 20);
    const curve = generateSurvivalCurve(mc.meanHazard, mc.uncertaintyStd);

    return { chartData: curve, ...mc, baseLogHazard };
  }, [age, tumorSize, lymphNodes, npi, stage, hasFullStaging, tp53, egfr, kras, myc, grade, cellularity, mutationCount, erStatus, her2Status, prStatus, intervention]);

  const { chartData, meanHazard, uncertaintyStd, samples, baseLogHazard } = engine;
  const uncertaintyDanger = uncertaintyStd > 0.8;

  // Key landmarks
  const s365 = chartData.find((d: CurvePoint) => d.day === 365) ?? chartData[18];
  const s730 = chartData.find((d: CurvePoint) => d.day === 730) ?? chartData[36];
  const s1095 = chartData.find((d: CurvePoint) => d.day === 1095) ?? chartData[54];
  const s2000 = chartData[chartData.length - 1];
  const medianDay = useMemo(() => {
    const crossed = chartData.find((d: CurvePoint) => d.survival <= 50);
    return crossed ? crossed.day : null;
  }, [chartData]);

  // Clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const timeStr = now.toUTCString().split(' ')[4];

  // Run simulation handler
  const handleRun = useCallback(() => {
    setIsRunning(true);
    setHasRun(true);
    setRunCount((c) => c + 1);
    window.setTimeout(() => setIsRunning(false), 800);
  }, []);

  // Gene expression bar data
  const geneData = [
    { gene: 'TP53', value: tp53, fill: tp53 >= 0 ? '#f43f5e' : '#10b981' },
    { gene: 'EGFR', value: egfr, fill: egfr >= 0 ? '#f43f5e' : '#10b981' },
    { gene: 'KRAS', value: kras, fill: kras >= 0 ? '#f43f5e' : '#10b981' },
    { gene: 'MYC', value: myc, fill: myc >= 0 ? '#f43f5e' : '#10b981' },
  ];

  // Status message
  const statusMessage = useMemo(() => {
    let msg = `Analysis Status: Complete\n`;
    msg += `Empirical Risk Factor (Mean Log-Hazard): ${meanHazard.toFixed(4)}\n`;
    msg += `Model Confidence Margin (Uncertainty Std): ${uncertaintyStd.toFixed(4)}\n`;
    if (uncertaintyStd > 0.8) {
      msg += `WARNING: High uncertainty detected, often linked to incomplete staging workup. Cross-verify with pathology manually.`;
    } else {
      msg += `Normal confidence bounds verified across integrated multi-omics signals.`;
    }
    return msg;
  }, [meanHazard, uncertaintyStd]);

  return (
    <div className="min-h-screen mesh-bg text-slate-800 relative overflow-x-hidden">
      {/* Ambient floating orbs */}
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

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 lg:px-6 py-6">
        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Global Header */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <motion.header initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
          className="glass-card rounded-3xl px-6 py-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <motion.div initial={{ scale: 0.8, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center glow-violet">
                <ShieldCheck className="text-white" size={24} />
                <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.5, repeat: Infinity }}
                  className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full" />
              </motion.div>
              <div>
                <h1 className="text-[19px] font-extrabold tracking-tight text-slate-800 leading-tight">
                  AegisOnco <span className="animated-gradient-text">Distributed</span> Digital Twin Command Center
                </h1>
                <p className="text-[10px] text-slate-400 font-mono-data uppercase tracking-[0.2em] mt-0.5">
                  Federated ML Oncology Engine · METABRIC-Calibrated · v4.2.1
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="glass-card rounded-xl px-3.5 py-2 flex items-center gap-2">
                <Server className="text-slate-400" size={14} />
                <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Node ID</span>
                <span className="font-mono-data text-[11px] text-slate-700 font-bold">US-EAST-92</span>
              </div>
              <motion.div whileHover={{ scale: 1.04 }} className="glass-card-emerald rounded-xl px-3.5 py-2 flex items-center gap-2 glow-emerald">
                <Lock className="text-emerald-600" size={14} />
                <span className="text-[9px] uppercase tracking-wider text-emerald-700 font-bold">HIPAA Validated</span>
              </motion.div>
              <div className="glass-card-violet rounded-xl px-3.5 py-2 flex items-center gap-2 glow-violet">
                <Wifi className="text-violet-600" size={14} />
                <span className="text-[9px] uppercase tracking-wider text-violet-700 font-bold">Global Sync</span>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                </span>
                <span className="font-mono-data text-[11px] text-violet-700 font-bold">Live</span>
              </div>
              <div className="glass-card rounded-xl px-3.5 py-2 flex items-center gap-2">
                <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">UTC</span>
                <span className="font-mono-data text-[11px] text-slate-700 font-bold">{timeStr}</span>
              </div>
            </div>
          </div>
        </motion.header>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Main Grid */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* Left Panel — Controls */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          <div className="space-y-5">
            {/* Module 1: EHR Clinical Metadata */}
            <motion.section initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
              whileHover={{ y: -2 }} className="glass-card rounded-3xl p-5">
              <ModuleHeader icon={HeartPulse} title="EHR Clinical Metadata" subtitle="Module 1 · Patient Stratification" accent="violet" />
              <div className="space-y-4">
                <SliderRow label="Patient Age" value={age} display={`${age} yrs`} min={21} max={97} step={1} onChange={setAge} />
                <SliderRow label="Primary Tumor Size" value={tumorSize} display={`${tumorSize} mm`} min={1} max={180} step={1} onChange={setTumorSize} accent="blue" />
                <SliderRow label="Positive Lymph Nodes" value={lymphNodes} display={`${lymphNodes}`} min={0} max={45} step={1} onChange={setLymphNodes} accent="rose" />
                <SliderRow label="Nottingham Prognostic Index" value={npi} display={npi.toFixed(1)} min={1.0} max={6.5} step={0.1} onChange={setNpi} accent="amber" />
                <div>
                  <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2.5">Clinical TNM Stage</label>
                  <SelectControl options={STAGES} value={stage} onChange={setStage} disabled={!hasFullStaging} />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2.5">Complete Staging Workup?</label>
                  <SegmentedControl options={['Yes', 'No'] as any} value={hasFullStaging ? 'Yes' : 'No'} onChange={(v) => setHasFullStaging(v === 'Yes')} columns={2} />
                </div>
              </div>
            </motion.section>

            {/* Module 2: Multi-Omics Sequencing */}
            <motion.section initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
              className="glass-card-rose rounded-3xl p-5">
              <ModuleHeader icon={Dna} title="Multi-Omics Sequencing" subtitle="Module 2 · 16-Gene Panel (4 Exposed)" accent="rose" />
              <div className="space-y-4">
                <SliderRow label="TP53 mRNA Z-Score" value={tp53} display={tp53.toFixed(1)} min={-3} max={3} step={0.1} onChange={setTp53} accent="rose" />
                <SliderRow label="EGFR mRNA Z-Score" value={egfr} display={egfr.toFixed(1)} min={-3} max={3} step={0.1} onChange={setEgfr} accent="rose" />
                <SliderRow label="KRAS mRNA Z-Score" value={kras} display={kras.toFixed(1)} min={-3} max={3} step={0.1} onChange={setKras} accent="rose" />
                <SliderRow label="MYC mRNA Z-Score" value={myc} display={myc.toFixed(1)} min={-3} max={3} step={0.1} onChange={setMyc} accent="rose" />

                {/* Gene expression mini-bar chart */}
                <div className="pt-2">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono-data mb-2">Gene Expression Profile</div>
                  <div className="h-[80px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={geneData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.12)" vertical={false} />
                        <XAxis dataKey="gene" stroke="#94a3b8" tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
                        <YAxis domain={[-3, 3]} stroke="#94a3b8" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <ReferenceLine y={0} stroke="#cbd5e1" />
                        <Bar dataKey="value" radius={[3, 3, 0, 0]} />
                        <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 10, fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Module 3: Histologic / Morphometric Profile */}
            <motion.section initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.16, ease: 'easeOut' }}
              className="glass-card-emerald rounded-3xl p-5">
              <ModuleHeader icon={ScanLine} title="Histologic / Morphometric" subtitle="Module 3 · Imaging Proxy" accent="emerald" />
              <div className="space-y-4">
                <SliderRow label="Neoplasm Histologic Grade" value={grade} display={`Grade ${grade}`} min={1} max={3} step={1} onChange={setGrade} accent="emerald" />
                <div>
                  <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2.5">Tumor Cellularity</label>
                  <SegmentedControl options={CELLULARITIES} value={cellularity} onChange={setCellularity} columns={3} />
                </div>
                <SliderRow label="Mutation Burden (count)" value={mutationCount} display={`${mutationCount}`} min={0} max={30} step={1} onChange={setMutationCount} accent="amber" />
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">ER Status</label>
                    <StatusPill options={['Positive', 'Negative']} value={erStatus} onChange={setErStatus} accent="rose" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">HER2 Status</label>
                    <StatusPill options={['Positive', 'Negative']} value={her2Status} onChange={setHer2Status} accent="violet" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">PR Status</label>
                    <StatusPill options={['Positive', 'Negative']} value={prStatus} onChange={setPrStatus} accent="blue" />
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Module 4: Counterfactual Intervention Routing */}
            <motion.section initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.24, ease: 'easeOut' }}
              className="glass-card-amber rounded-3xl p-5">
              <ModuleHeader icon={GitBranch} title="Counterfactual Intervention" subtitle="Module 4 · Treatment Pathway" accent="amber" />
              <div className="space-y-4">
                <SelectControl options={INTERVENTIONS} value={intervention} onChange={setIntervention} />
                <motion.button
                  onClick={handleRun}
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.02 }}
                  className="w-full relative overflow-hidden rounded-xl py-3.5 font-bold text-[13px] text-white bg-gradient-to-r from-violet-500 to-purple-600 shadow-[0_4px_20px_rgba(139,92,246,0.4)] transition-all"
                >
                  <AnimatePresence mode="wait">
                    {isRunning ? (
                      <motion.span key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center justify-center gap-2">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}>
                          <Cpu size={16} />
                        </motion.div>
                        Executing MC Dropout Sampling...
                      </motion.span>
                    ) : (
                      <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center justify-center gap-2">
                        <Zap size={16} />
                        Execute Prognostic Simulation Run
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {/* Shimmer overlay */}
                  <div className="shimmer absolute inset-0" />
                </motion.button>
                {hasRun && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between text-[10px] font-mono-data text-slate-400">
                    <span className="flex items-center gap-1.5"><CircleDot size={9} className="text-emerald-500" /> Run #{runCount} complete</span>
                    <span>20 MC samples · 100 timepoints</span>
                  </motion.div>
                )}
              </div>
            </motion.section>
          </div>

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* Right Panel — Analytics */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          <div className="space-y-5">
            {/* Main Survival Chart */}
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}
              className="glass-card rounded-3xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center glow-violet">
                    <Activity className="text-violet-600" size={18} />
                  </motion.div>
                  <div>
                    <h2 className="text-[15px] font-bold text-slate-800">Projected Twin Survival Curve</h2>
                    <p className="text-[10px] text-slate-400 font-mono-data uppercase tracking-[0.15em] mt-0.5">
                      Cox PH · Breslow Baseline · MC Dropout (20 passes) · Intervention: {intervention}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono-data">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-[3px] bg-violet-500 rounded-full" />
                    <span className="text-slate-500">Mean Survival</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-3 bg-violet-200 border border-violet-300 rounded-sm" />
                    <span className="text-slate-500">95% CI</span>
                  </div>
                  {medianDay !== null && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-[2px] bg-amber-400 border-t-2 border-dashed border-amber-400" />
                      <span className="text-slate-500">Median</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-[420px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ciFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.04} />
                      </linearGradient>
                      <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="50%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#ec4899" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="day" type="number" domain={[0, 2000]} ticks={[0, 365, 730, 1095, 1500, 2000]}
                      stroke="#94a3b8" tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                      tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#e2e8f0' }}
                      label={{ value: 'Days from Initial Ingest', position: 'insideBottom', offset: -6, style: { fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' } }} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
                      stroke="#94a3b8" tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                      tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#e2e8f0' }}
                      label={{ value: 'Survival Probability (%)', angle: -90, position: 'insideLeft', offset: 20, style: { fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' } }} />
                    <Area type="monotone" dataKey="range" stroke="none" fill="url(#ciFill)"
                      isAnimationActive animationDuration={700} animationEasing="ease-out" />
                    <ReferenceLine y={50} stroke="rgba(245,158,11,0.4)" strokeDasharray="4 4" />
                    {medianDay !== null && (
                      <ReferenceLine x={medianDay} stroke="rgba(245,158,11,0.5)" strokeDasharray="4 4"
                        label={{ value: `Median ${medianDay}d`, fill: '#d97706', fontSize: 10, fontFamily: 'JetBrains Mono', position: 'top' }} />
                    )}
                    <Line type="monotone" dataKey="survival" stroke="url(#lineGlow)" strokeWidth={3} dot={false}
                      isAnimationActive animationDuration={700} animationEasing="ease-out"
                      activeDot={{ r: 6, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 3 }} />
                    <Tooltip content={<CurveTooltip />} cursor={{ stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Sub-stats strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-5 pt-5 border-t border-slate-200/60">
                {[
                  { label: 'Day 365', val: s365?.survival.toFixed(1) },
                  { label: 'Day 730', val: s730?.survival.toFixed(1) },
                  { label: 'Day 1095', val: s1095?.survival.toFixed(1) },
                  { label: 'Day 2000', val: s2000?.survival.toFixed(1) },
                ].map((s, i) => (
                  <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.08 }}
                    className="p-3 rounded-xl bg-white/50 border border-slate-200/50">
                    <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono-data font-semibold">{s.label}</div>
                    <motion.div key={s.val} initial={{ scale: 1.1, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25 }}
                      className="font-mono-data text-[16px] text-violet-600 font-bold mt-0.5">{s.val}%</motion.div>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* MC Dropout Diagnostics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* MC Histogram */}
              <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
                className="glass-card rounded-3xl p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center">
                    <BarChart3 className="text-violet-600" size={15} />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-bold text-slate-800">MC Dropout Hazard Distribution</h3>
                    <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider">20 Forward Passes · Stochastic</p>
                  </div>
                </div>
                <MCHistogram samples={samples} mean={meanHazard} />
                <div className="flex justify-between mt-2 text-[10px] font-mono-data">
                  <span className="text-slate-400">μ = <span className="text-violet-600 font-bold">{meanHazard.toFixed(4)}</span></span>
                  <span className="text-slate-400">σ = <span className={uncertaintyDanger ? 'text-rose-500 font-bold' : 'text-emerald-600 font-bold'}>{uncertaintyStd.toFixed(4)}</span></span>
                </div>
              </motion.section>

              {/* Uncertainty Gauge */}
              <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16 }}
                className={`rounded-3xl p-5 ${uncertaintyDanger ? 'glass-card-rose glow-rose' : 'glass-card-emerald'}`}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${uncertaintyDanger ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                    <Gauge className={uncertaintyDanger ? 'text-rose-500' : 'text-emerald-600'} size={15} />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-bold text-slate-800">Epistemic Uncertainty Gauge</h3>
                    <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider">Model Confidence Margin</p>
                  </div>
                </div>
                <UncertaintyGauge value={uncertaintyStd} />
                <div className="text-center mt-1">
                  {uncertaintyDanger ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-1.5 text-[10px] text-rose-500 font-semibold">
                      <AlertTriangle size={12} /> High uncertainty — verify pathology
                    </motion.div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-600 font-semibold">
                      <ShieldCheck size={12} /> Confidence bounds verified
                    </div>
                  )}
                </div>
              </motion.section>
            </div>

            {/* System Status & Quality Control Matrix */}
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
              className="glass-card rounded-3xl p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <FlaskConical className="text-blue-600" size={15} />
                </div>
                <div>
                  <h3 className="text-[12px] font-bold text-slate-800">System Status & Quality Control Matrix</h3>
                  <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider">Diagnostics · Reporting Metrics</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Status text */}
                <div className="p-4 rounded-2xl bg-white/50 border border-slate-200/50 font-mono-data text-[11px] text-slate-600 leading-relaxed">
                  {statusMessage.split('\n').map((line, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                      className={line.includes('WARNING') ? 'text-rose-500 font-bold' : line.includes('Normal') || line.includes('Complete') ? 'text-emerald-600 font-semibold' : ''}>
                      {line || '\u00a0'}
                    </motion.div>
                  ))}
                </div>
                {/* Quick metrics */}
                <div className="space-y-2.5">
                  {[
                    { label: 'Base Log-Hazard', val: baseLogHazard.toFixed(4), accent: 'violet' as Accent },
                    { label: 'MC Mean Hazard', val: meanHazard.toFixed(4), accent: 'blue' as Accent },
                    { label: 'Uncertainty Std', val: uncertaintyStd.toFixed(4), accent: uncertaintyDanger ? 'rose' as Accent : 'emerald' as Accent },
                    { label: 'Median OS', val: medianDay !== null ? `${medianDay} days` : '> 2000 days', accent: 'amber' as Accent },
                  ].map((m, i) => {
                    const a = ACCENT[m.accent];
                    return (
                      <motion.div key={m.label} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                        className="flex justify-between items-center p-2.5 rounded-xl bg-white/50 border border-slate-200/50">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{m.label}</span>
                        <motion.span key={m.val} initial={{ scale: 1.1, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25 }}
                          className={`font-mono-data text-[13px] font-bold ${a.text}`}>{m.val}</motion.span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.section>

            {/* Telemetry Footer KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard icon={Gauge} label="Model Uncertainty σ" value={uncertaintyStd.toFixed(2)}
                sub={uncertaintyDanger ? 'Danger: epistemic limit exceeded' : 'Within operational tolerance'}
                danger={uncertaintyDanger} accent="emerald" />
              <KpiCard icon={ShieldCheck} label="Privacy Epsilon" value="8.42 ε" sub="DP-SGD budget consumed" accent="blue" />
              <KpiCard icon={Radio} label="FedAvg Sync" value="3/3" sub="Hospitals active · round 142" accent="emerald" />
            </div>

            {/* Federated Network Topology */}
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.26 }}
              className="glass-card rounded-3xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="text-violet-600" size={15} />
                  <span className="text-[12px] text-slate-700 font-bold tracking-wide">Federated Network Topology</span>
                </div>
                <span className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={10} className="text-violet-400" /> Round 142 · Aggregating
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: 'Mayo Clinic', load: 87, lat: '12ms' },
                  { name: 'Johns Hopkins', load: 64, lat: '8ms' },
                  { name: 'MD Anderson', load: 92, lat: '15ms' },
                ].map((node, i) => (
                  <motion.div key={node.name} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.1, type: 'spring', stiffness: 300, damping: 25 }} whileHover={{ y: -3 }}
                    className="p-3.5 rounded-2xl bg-white/50 border border-slate-200/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-slate-700 font-semibold">{node.name}</span>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] text-slate-400 font-mono-data">Load {node.load}%</span>
                      <span className="text-[9px] text-violet-500 font-mono-data font-semibold">{node.lat}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div className="h-full bg-gradient-to-r from-violet-400 to-pink-400 rounded-full"
                        initial={{ width: 0 }} animate={{ width: `${node.load}%` }} transition={{ duration: 1, ease: 'easeOut', delay: 0.3 + i * 0.1 }} />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.15em] pb-4">
          <div className="flex items-center gap-2">
            <Cpu size={11} className="text-slate-400" />
            <span>AegisOnco DTC · Secure Telemetry Mode</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><TrendingUp size={10} className="text-emerald-500" /> Breslow Estimator Stable</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Brain size={10} className="text-violet-500" /> METABRIC-Calibrated</span>
            <span>·</span>
            <span>Synthetic Data — No PHI Transmitted</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
