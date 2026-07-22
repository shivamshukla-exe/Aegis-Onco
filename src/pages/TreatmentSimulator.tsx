import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  GitCompare, Activity, ShieldCheck, AlertTriangle, TrendingUp,
  Zap, FlaskConical, BarChart3,
} from 'lucide-react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

import {
  ModuleHeader, SliderRow, SegmentedControl, SelectControl, StatusPill,
  KpiCard, PageHeader, ACCENT, type Accent,
} from '../components/ui';
import {
  type PatientInput, type Stage, type Cellularity, type Status,
  type Intervention, type CurvePoint,
  STAGES, CELLULARITIES, DEFAULT_INPUT,
} from '../lib/types';
import { runFullEngine, type EngineResult } from '../lib/engine';

// ─────────────────────────────────────────────────────────────────────────────
// Per-intervention visual identity
// ─────────────────────────────────────────────────────────────────────────────
type InterventionKey = 'standard' | 'targeted' | 'cocktail';

interface InterventionTheme {
  key: InterventionKey;
  label: Intervention;
  shortLabel: string;
  accent: Accent;
  line: string;      // hex for the survival line
  ciFill: string;    // hex for the CI band
  gradientId: string;
  headerClass: string;
}

const THEMES: Record<InterventionKey, InterventionTheme> = {
  standard: {
    key: 'standard',
    label: 'Standard Clinical Routine',
    shortLabel: 'Standard',
    accent: 'emerald',
    line: '#10b981',
    ciFill: '#10b981',
    gradientId: 'ciStandard',
    headerClass: 'glass-card-emerald',
  },
  targeted: {
    key: 'targeted',
    label: 'Targeted Kinase Inhibition',
    shortLabel: 'Targeted',
    accent: 'amber',
    line: '#f59e0b',
    ciFill: '#f59e0b',
    gradientId: 'ciTargeted',
    headerClass: 'glass-card-amber',
  },
  cocktail: {
    key: 'cocktail',
    label: 'Double-Agent Cocktail',
    shortLabel: 'Cocktail',
    accent: 'rose',
    line: '#f43f5e',
    ciFill: '#f43f5e',
    gradientId: 'ciCocktail',
    headerClass: 'glass-card-rose',
  },
};

const THEME_ORDER: InterventionTheme[] = [THEMES.standard, THEMES.targeted, THEMES.cocktail];

// ─────────────────────────────────────────────────────────────────────────────
// Custom tooltip for an individual intervention curve
// ─────────────────────────────────────────────────────────────────────────────
interface CurveTooltipEntry { payload?: CurvePoint }
interface OverlayTooltipEntry { dataKey?: string | number; value?: string | number }

function CurveTooltip({ active, payload, theme }: { active?: boolean; payload?: CurveTooltipEntry[]; theme: InterventionTheme }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as CurvePoint;
  if (!p) return null;
  const a = ACCENT[theme.accent];
  return (
    <div className="glass-card rounded-xl px-4 py-3 min-w-[200px]">
      <div className={`text-[9px] uppercase tracking-[0.18em] mb-2 font-bold ${a.text}`}>{theme.shortLabel} Probe</div>
      <div className="flex items-center justify-between gap-6 mb-1.5">
        <span className="text-[11px] text-slate-500">Day</span>
        <span className="font-mono-data text-[13px] text-slate-800 font-bold">{p.day}</span>
      </div>
      <div className="flex items-center justify-between gap-6 mb-1.5">
        <span className={`text-[11px] ${a.text}`}>Mean Survival</span>
        <span className={`font-mono-data text-[13px] font-bold ${a.text}`}>{p.survival.toFixed(2)}%</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-[11px] text-slate-500">Simulation range</span>
        <span className="font-mono-data text-[12px] text-slate-600">{p.range[0].toFixed(1)}–{p.range[1].toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay tooltip — shows all three interventions at a given day
// ─────────────────────────────────────────────────────────────────────────────
function OverlayTooltip({ active, payload, label }: { active?: boolean; payload?: OverlayTooltipEntry[]; label?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-xl px-4 py-3 min-w-[240px]">
      <div className="text-[9px] text-slate-400 uppercase tracking-[0.18em] mb-2 font-bold">Day {label}</div>
      <div className="space-y-1.5">
        {THEME_ORDER.map((theme) => {
          const entry = payload.find((e) => e.dataKey === theme.key);
          if (!entry) return null;
          const a = ACCENT[theme.accent];
          return (
            <div key={theme.key} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: theme.line }} />
                <span className={`text-[11px] ${a.text} font-semibold`}>{theme.shortLabel}</span>
              </span>
              <span className="font-mono-data text-[12px] text-slate-700 font-bold">
                {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small per-intervention survival curve
// ─────────────────────────────────────────────────────────────────────────────
function MiniSurvivalChart({ result, theme }: { result: EngineResult; theme: InterventionTheme }) {
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={result.curve} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={theme.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.ciFill} stopOpacity={0.26} />
              <stop offset="100%" stopColor={theme.ciFill} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.18)" vertical={false} />
          <XAxis dataKey="day" type="number" domain={[0, 2000]} ticks={[0, 500, 1000, 1500, 2000]}
            stroke="#94a3b8" tick={{ fontSize: 8, fill: '#94a3b8', fontFamily: 'JetBrains Mono' }}
            tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
            stroke="#94a3b8" tick={{ fontSize: 8, fill: '#94a3b8', fontFamily: 'JetBrains Mono' }}
            tickLine={false} axisLine={false} />
          <Area type="monotone" dataKey="range" stroke="none" fill={`url(#${theme.gradientId})`}
            isAnimationActive animationDuration={600} animationEasing="ease-out" />
          <ReferenceLine y={50} stroke="rgba(148,163,184,0.4)" strokeDasharray="3 3" />
          {result.medianDay !== null && (
            <ReferenceLine x={result.medianDay} stroke={theme.line} strokeDasharray="4 4" strokeOpacity={0.45}
              label={{ value: `${result.medianDay}d`, fill: theme.line, fontSize: 8, fontFamily: 'JetBrains Mono', position: 'top' }} />
          )}
          <Line type="monotone" dataKey="survival" stroke={theme.line} strokeWidth={2.5} dot={false}
            isAnimationActive animationDuration={600} animationEasing="ease-out"
            activeDot={{ r: 5, fill: theme.line, stroke: '#fff', strokeWidth: 2 }} />
          <Tooltip content={<CurveTooltip theme={theme} />} cursor={{ stroke: theme.line, strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function TreatmentSimulator() {
  // ── Shared patient profile state (compact horizontal controls) ──
  const [age, setAge] = useState(DEFAULT_INPUT.age);
  const [tumorSize, setTumorSize] = useState(DEFAULT_INPUT.tumorSize);
  const [lymphNodes, setLymphNodes] = useState(DEFAULT_INPUT.lymphNodes);
  const [npi, setNpi] = useState(DEFAULT_INPUT.npi);
  const [stage, setStage] = useState<Stage>(DEFAULT_INPUT.stage);
  const [hasFullStaging, setHasFullStaging] = useState(DEFAULT_INPUT.hasFullStaging);

  const [tp53, setTp53] = useState(DEFAULT_INPUT.tp53);
  const [egfr, setEgfr] = useState(DEFAULT_INPUT.egfr);
  const [kras, setKras] = useState(DEFAULT_INPUT.kras);
  const [myc, setMyc] = useState(DEFAULT_INPUT.myc);

  const [grade, setGrade] = useState(DEFAULT_INPUT.grade);
  const [cellularity, setCellularity] = useState<Cellularity>(DEFAULT_INPUT.cellularity);
  const [mutationCount, setMutationCount] = useState(DEFAULT_INPUT.mutationCount);
  const [erStatus, setErStatus] = useState<Status>(DEFAULT_INPUT.erStatus);
  const [her2Status, setHer2Status] = useState<Status>(DEFAULT_INPUT.her2Status);
  const [prStatus, setPrStatus] = useState<Status>(DEFAULT_INPUT.prStatus);

  // ── Build the shared base input (intervention field is overridden per run) ──
  const baseInput: Omit<PatientInput, 'intervention'> = useMemo(() => ({
    age, tumorSize, lymphNodes, npi, stage, hasFullStaging,
    tp53, egfr, kras, myc,
    grade, cellularity, mutationCount,
    erStatus, her2Status, prStatus,
  }), [age, tumorSize, lymphNodes, npi, stage, hasFullStaging,
    tp53, egfr, kras, myc,
    grade, cellularity, mutationCount,
    erStatus, her2Status, prStatus]);

  // ── Run the engine for each intervention against the same patient profile ──
  const results: Record<InterventionKey, EngineResult> = useMemo(() => ({
    standard: runFullEngine({ ...baseInput, intervention: 'Standard Clinical Routine' }),
    targeted: runFullEngine({ ...baseInput, intervention: 'Targeted Kinase Inhibition' }),
    cocktail: runFullEngine({ ...baseInput, intervention: 'Double-Agent Cocktail' }),
  }), [baseInput]);

  // ── Overlay chart data: merge the three curves on `day` ──
  const overlayData = useMemo(() => {
    return results.standard.curve.map((pt, i) => ({
      day: pt.day,
      standard: results.standard.curve[i].survival,
      targeted: results.targeted.curve[i].survival,
      cocktail: results.cocktail.curve[i].survival,
    }));
  }, [results]);

  // ── Surrogate-score sensitivity table: deltas relative to the reference scenario ──
  const scoreTable = useMemo(() => {
    const baseline = results.standard.meanSurrogateScore;
    return THEME_ORDER.map((theme) => {
      const r = results[theme.key];
      const delta = r.meanSurrogateScore - baseline;
      const relativeMagnitude = baseline !== 0 ? (Math.abs(delta) / Math.abs(baseline)) * 100 : 0;
      const variationBand = 1.96 * Math.sqrt(r.variationStd ** 2 + results.standard.variationStd ** 2);
      return {
        theme,
        surrogateScore: r.meanSurrogateScore,
        delta,
        relativeMagnitude,
        variabilityLow: delta - variationBand,
        variabilityHigh: delta + variationBand,
        variation: r.variationStd,
      };
    });
  }, [results]);

  const scenarioOrdering = useMemo(() => {
    const ordered = [...THEME_ORDER].sort((a, b) => results[a.key].meanSurrogateScore - results[b.key].meanSurrogateScore);
    const first = ordered[0];
    const firstResult = results[first.key];
    return { first, firstResult, ordered, highVariation: firstResult.variationStd > 0.8 };
  }, [results]);

  return (
    <div className="relative">
      {/* ── Page Header ── */}
      <PageHeader
        icon={GitCompare}
        title="Scenario Explorer"
        subtitle="Non-Causal Sensitivity Demo · Arbitrary UI Surrogate Offsets"
        accent="amber"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="glass-card rounded-xl px-3.5 py-2 flex items-center gap-2">
            <FlaskConical className="text-amber-600" size={14} />
            <span className="text-[9px] uppercase tracking-wider text-amber-700 font-bold">Research Demo Only</span>
          </div>
          <div className="glass-card-emerald rounded-xl px-3.5 py-2 flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" size={14} />
            <span className="text-[9px] uppercase tracking-wider text-emerald-700 font-bold">No Treatment Effect Estimate</span>
          </div>
        </div>
      </PageHeader>

      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[11px] leading-relaxed text-amber-900 font-mono-data">
        <strong>Non-causal sensitivity view:</strong> these curves come from a deterministic browser surrogate with hand-authored offsets—not notebook weights, clinical evidence, or a treatment model. Do not use them for diagnosis, prognosis, or therapy selection.
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Shared Patient Profile — compact horizontal controls                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        whileHover={{ y: -2 }} className="glass-card rounded-3xl p-5 mb-5"
      >
        <ModuleHeader icon={Activity} title="Shared Synthetic Profile" subtitle="Identical Demo Inputs · Applied to All 3 Scenarios" accent="amber" />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-x-6 gap-y-4">
          {/* Column 1 — Clinical metadata */}
          <div className="space-y-3">
            <SliderRow label="Patient Age" value={age} display={`${age} yrs`} min={21} max={97} step={1} onChange={setAge} />
            <SliderRow label="Tumor Size" value={tumorSize} display={`${tumorSize} mm`} min={1} max={180} step={1} onChange={setTumorSize} accent="blue" />
            <SliderRow label="Positive Lymph Nodes" value={lymphNodes} display={`${lymphNodes}`} min={0} max={45} step={1} onChange={setLymphNodes} accent="rose" />
          </div>

          {/* Column 2 — Staging & NPI */}
          <div className="space-y-3">
            <SliderRow label="Nottingham Prognostic Index" value={npi} display={npi.toFixed(1)} min={1.0} max={6.5} step={0.1} onChange={setNpi} accent="amber" />
            <div>
              <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">TNM Stage</label>
              <SelectControl options={STAGES} value={stage} onChange={setStage} disabled={!hasFullStaging} />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">Complete Staging Workup?</label>
              <SegmentedControl<'Yes' | 'No'> options={['Yes', 'No']} value={hasFullStaging ? 'Yes' : 'No'} onChange={(v) => setHasFullStaging(v === 'Yes')} columns={2} />
            </div>
          </div>

          {/* Column 3 — Genomic sliders */}
          <div className="space-y-3">
            <SliderRow label="TP53 mRNA Z-Score" value={tp53} display={tp53.toFixed(1)} min={-3} max={3} step={0.1} onChange={setTp53} accent="rose" />
            <SliderRow label="EGFR mRNA Z-Score" value={egfr} display={egfr.toFixed(1)} min={-3} max={3} step={0.1} onChange={setEgfr} accent="rose" />
            <SliderRow label="KRAS mRNA Z-Score" value={kras} display={kras.toFixed(1)} min={-3} max={3} step={0.1} onChange={setKras} accent="rose" />
            <SliderRow label="MYC mRNA Z-Score" value={myc} display={myc.toFixed(1)} min={-3} max={3} step={0.1} onChange={setMyc} accent="rose" />
          </div>

          {/* Column 4 — Histologic fields */}
          <div className="space-y-3">
            <SliderRow label="Histologic Grade" value={grade} display={`Grade ${grade}`} min={1} max={3} step={1} onChange={setGrade} accent="emerald" />
            <div>
              <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">Tumor Cellularity</label>
              <SegmentedControl options={CELLULARITIES} value={cellularity} onChange={setCellularity} columns={3} />
            </div>
            <SliderRow label="Mutation Burden" value={mutationCount} display={`${mutationCount}`} min={0} max={30} step={1} onChange={setMutationCount} accent="amber" />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-slate-500 font-semibold tracking-wide block mb-1.5">ER</label>
                <StatusPill options={['Positive', 'Negative']} value={erStatus} onChange={(v) => setErStatus(v as Status)} accent="rose" />
              </div>
              <div>
                <label className="text-[9px] text-slate-500 font-semibold tracking-wide block mb-1.5">HER2</label>
                <StatusPill options={['Positive', 'Negative']} value={her2Status} onChange={(v) => setHer2Status(v as Status)} accent="violet" />
              </div>
              <div>
                <label className="text-[9px] text-slate-500 font-semibold tracking-wide block mb-1.5">PR</label>
                <StatusPill options={['Positive', 'Negative']} value={prStatus} onChange={(v) => setPrStatus(v as Status)} accent="blue" />
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Three-column comparison                                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {THEME_ORDER.map((theme, i) => {
          const r = results[theme.key];
          const a = ACCENT[theme.accent];
          return (
            <motion.section
              key={theme.key}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.12, ease: 'easeOut' }}
              whileHover={{ y: -4 }}
              className={`rounded-3xl p-5 ${theme.headerClass}`}
            >
              {/* Colored header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl ${a.bgSoft} ${a.border} border flex items-center justify-center`}>
                    {theme.key === 'standard' && <ShieldCheck className={a.text} size={16} />}
                    {theme.key === 'targeted' && <Zap className={a.text} size={16} />}
                    {theme.key === 'cocktail' && <FlaskConical className={a.text} size={16} />}
                  </div>
                  <div>
                    <h3 className={`text-[13px] font-bold tracking-tight ${a.text}`}>{theme.shortLabel}</h3>
                    <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.15em] mt-0.5">{theme.label}</p>
                  </div>
                </div>
                <span className={`text-[9px] uppercase tracking-[0.18em] font-mono-data font-bold ${a.text} opacity-70`}>Arm {i + 1}</span>
              </div>

              {/* Mini survival curve */}
              <MiniSurvivalChart result={r} theme={theme} />

              {/* Key metrics */}
              <div className="grid grid-cols-2 gap-2.5 mt-4">
                <MetricCell label="Surrogate Score" value={r.meanSurrogateScore.toFixed(4)} accent={theme.accent} />
                <MetricCell label="Seeded Variation σ" value={r.variationStd.toFixed(4)} accent={r.variationStd > 0.8 ? 'rose' : theme.accent} danger={r.variationStd > 0.8} />
                <MetricCell label="Demo Median Day" value={r.medianDay !== null ? `${r.medianDay} d` : '> 2000 d'} accent={theme.accent} />
                <MetricCell label="Day 1095 Surv." value={`${r.s1095.toFixed(1)}%`} accent={theme.accent} />
              </div>

              {/* Seeded variation flag */}
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-semibold">
                <span className={`flex items-center gap-1.5 ${r.variationStd > 0.8 ? 'text-rose-500' : a.text}`}>
                  {r.variationStd > 0.8 && <AlertTriangle size={12} />}
                  {r.variationStd > 0.8 ? 'High demo variation' : 'Demo variation below display threshold'}
                </span>
              </div>
            </motion.section>
          );
        })}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Overlay comparison chart                                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
        whileHover={{ y: -2 }} className="glass-card rounded-3xl p-6 mb-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center glow-amber">
              <BarChart3 className="text-amber-600" size={18} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800">Overlay Survival Comparison</h2>
              <p className="text-[10px] text-slate-400 font-mono-data uppercase tracking-[0.15em] mt-0.5">
                Three Arbitrary Scenarios · Same Synthetic Profile · Non-Causal Overlay
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono-data">
            {THEME_ORDER.map((t) => (
              <div key={t.key} className="flex items-center gap-1.5">
                <span className="w-4 h-[3px] rounded-full" style={{ background: t.line }} />
                <span className="text-slate-500">{t.shortLabel}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={overlayData} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
              <defs>
                {THEME_ORDER.map((t) => (
                  <linearGradient key={t.gradientId} id={`ov-${t.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={t.ciFill} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={t.ciFill} stopOpacity={0.01} />
                  </linearGradient>
                ))}
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
              <ReferenceLine y={50} stroke="rgba(148,163,184,0.5)" strokeDasharray="4 4"
                label={{ value: 'Median threshold', fill: '#94a3b8', fontSize: 9, fontFamily: 'JetBrains Mono', position: 'insideTopLeft' }} />
              {THEME_ORDER.map((t) => (
                <Line key={t.key} type="monotone" dataKey={t.key} name={t.shortLabel} stroke={t.line} strokeWidth={2.5} dot={false}
                  isAnimationActive animationDuration={800} animationEasing="ease-out"
                  activeDot={{ r: 5, fill: t.line, stroke: '#fff', strokeWidth: 2 }} />
              ))}
              <Legend
                wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono', paddingTop: 8 }}
                iconType="plainline"
                formatter={(value) => {
                  const theme = THEME_ORDER.find((t) => t.key === value);
                  return <span style={{ color: theme ? ACCENT[theme.accent].text : '#64748b', fontWeight: 600 }}>{theme?.shortLabel ?? value}</span>;
                }}
              />
              <Tooltip content={<OverlayTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Surrogate-score sensitivity table */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.36, ease: 'easeOut' }}
        whileHover={{ y: -2 }} className="glass-card rounded-3xl p-6 mb-5"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center glow-violet">
            <TrendingUp className="text-violet-600" size={18} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">Surrogate Score Sensitivity</h2>
            <p className="text-[10px] text-slate-400 font-mono-data uppercase tracking-[0.15em] mt-0.5">
              Δ Demo Score vs. Reference · Simulation Variation Range
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/70">
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data">Intervention</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">Surrogate Score</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">Δ vs. Standard</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">Absolute change</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">Variation range</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">σ</th>
              </tr>
            </thead>
            <tbody>
              {scoreTable.map((row, i) => {
                const a = ACCENT[row.theme.accent];
                const isBaseline = row.theme.key === 'standard';
                const lowerScore = row.delta < 0;
                return (
                  <motion.tr
                    key={row.theme.key}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.08 }}
                    className="border-b border-slate-100/70 hover:bg-white/40 transition-colors"
                  >
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: row.theme.line }} />
                        <div>
                          <div className={`text-[12px] font-bold ${a.text}`}>{row.theme.shortLabel}</div>
                          <div className="text-[9px] text-slate-400 font-mono-data">{row.theme.label}</div>
                        </div>
                        {isBaseline && <span className="text-[8px] text-slate-400 font-mono-data uppercase tracking-wider border border-slate-200 rounded px-1.5 py-0.5">ref</span>}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-data text-[12px] text-slate-700 font-bold">
                      {row.surrogateScore.toFixed(4)}
                    </td>
                    <td className={`py-3.5 px-3 text-right font-mono-data text-[12px] font-bold ${isBaseline ? 'text-slate-400' : lowerScore ? 'text-violet-600' : 'text-amber-700'}`}>
                      {isBaseline ? '—' : (row.delta >= 0 ? '+' : '') + row.delta.toFixed(4)}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {isBaseline ? (
                        <span className="text-slate-400 font-mono-data text-[12px]">—</span>
                      ) : (
                        <span className="font-mono-data text-[12px] font-bold text-slate-600">
                          {row.relativeMagnitude.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-data text-[11px] text-slate-500">
                      {isBaseline ? '—' : `[${row.variabilityLow.toFixed(3)}, ${row.variabilityHigh.toFixed(3)}]`}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <span className={`font-mono-data text-[12px] font-bold ${row.variation > 0.8 ? 'text-rose-500' : row.variation > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {row.variation.toFixed(3)}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-start gap-2 text-[10px] text-slate-400 font-mono-data">
          <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
          <span>
            Negative Δ means only that the arbitrary demo offset lowered this browser surrogate score. It does not indicate treatment benefit. The displayed range is a seeded simulation variation band, not a confidence interval.
          </span>
        </div>
      </motion.section>

      {/* Descriptive sensitivity ordering — never a treatment recommendation. */}
      <motion.section
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.44, ease: 'easeOut' }}
        className="glass-card-amber rounded-3xl p-6 mb-5"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-amber-600" size={24} />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-mono-data font-bold text-amber-700">Descriptive sensitivity ordering</div>
            <h2 className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-800">Not a treatment recommendation</h2>
            <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-slate-600">
              The browser surrogate applies arbitrary, hand-authored offsets to illustrate interface behavior. It has no causal treatment model and cannot estimate benefit, select therapy, or support a medical decision. In this demo calculation only, <strong>{scenarioOrdering.first.label}</strong> produces the lowest numeric surrogate score ({scenarioOrdering.firstResult.meanSurrogateScore.toFixed(4)}).
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-200/60 pt-5 md:grid-cols-3">
          {scenarioOrdering.ordered.map((theme, index) => {
            const result = results[theme.key];
            return (
              <div key={theme.key} className="rounded-2xl border border-slate-200/60 bg-white/50 p-3.5">
                <div className="flex items-center justify-between text-[10px] font-mono-data">
                  <span className="font-bold text-slate-700">{theme.shortLabel}</span>
                  <span className="text-slate-400">Demo order {index + 1}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-mono-data">
                  <span className="text-slate-400">Surrogate score</span>
                  <span className="font-bold text-slate-600">{result.meanSurrogateScore.toFixed(4)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Footer KPIs                                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon={GitCompare} label="Scenarios Compared" value="3" sub="Arbitrary non-causal offsets" accent="amber" />
        <KpiCard icon={TrendingUp} label="Score Spread" value={(Math.max(...THEME_ORDER.map((t) => results[t.key].meanSurrogateScore)) - Math.min(...THEME_ORDER.map((t) => results[t.key].meanSurrogateScore))).toFixed(3)} sub="Descriptive surrogate variation" accent="violet" />
        <KpiCard icon={ShieldCheck} label="Use Boundary" value="Research only" sub={scenarioOrdering.highVariation ? 'High simulation variation flagged' : 'No clinical interpretation'} danger={scenarioOrdering.highVariation} accent="emerald" />
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.15em] pb-4">
        <div className="flex items-center gap-2"><GitCompare size={11} className="text-amber-500" /><span>AegisOnco · Non-Causal Scenario Explorer</span></div>
        <span>Deterministic UI Surrogate · Synthetic Data · No PHI · Not Medical Advice</span>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small metric cell used inside the per-intervention columns
// ─────────────────────────────────────────────────────────────────────────────
function MetricCell({ label, value, accent, danger }: { label: string; value: string; accent: Accent; danger?: boolean }) {
  const a = ACCENT[danger ? 'rose' : accent];
  return (
    <div className="p-2.5 rounded-xl bg-white/50 border border-slate-200/50">
      <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono-data font-semibold">{label}</div>
      <motion.div
        key={value}
        initial={{ scale: 1.1, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25 }}
        className={`font-mono-data text-[15px] font-bold mt-0.5 ${a.text}`}
      >
        {value}
      </motion.div>
    </div>
  );
}
