import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  GitCompare, Activity, ShieldCheck, AlertTriangle, TrendingUp,
  Zap, FlaskConical, CheckCircle2, ArrowRight, BarChart3,
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
function CurveTooltip({ active, payload, theme }: { active?: boolean; payload?: any[]; theme: InterventionTheme }) {
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
        <span className="text-[11px] text-slate-500">95% CI</span>
        <span className="font-mono-data text-[12px] text-slate-600">{p.range[0].toFixed(1)}–{p.range[1].toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay tooltip — shows all three interventions at a given day
// ─────────────────────────────────────────────────────────────────────────────
function OverlayTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: number }) {
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

  // ── Hazard reduction table: deltas relative to Standard Clinical Routine ──
  const hazardTable = useMemo(() => {
    const baseline = results.standard.meanHazard;
    return THEME_ORDER.map((theme) => {
      const r = results[theme.key];
      const delta = r.meanHazard - baseline;
      const pctImprovement = baseline !== 0 ? (Math.abs(delta) / Math.abs(baseline)) * 100 : 0;
      // Approximate 95% CI for the delta: ±1.96 * sqrt(σ_a^2 + σ_b^2)
      const ciWidth = 1.96 * Math.sqrt(r.uncertaintyStd ** 2 + results.standard.uncertaintyStd ** 2);
      return {
        theme,
        meanHazard: r.meanHazard,
        delta,
        pctImprovement,
        ciLow: delta - ciWidth,
        ciHigh: delta + ciWidth,
        uncertainty: r.uncertaintyStd,
      };
    });
  }, [results]);

  // ── Recommendation: lowest mean hazard with acceptable uncertainty (σ ≤ 0.8) ──
  const recommendation = useMemo(() => {
    const ranked = [...THEME_ORDER].sort((a, b) => results[a.key].meanHazard - results[b.key].meanHazard);
    const best = ranked[0];
    const bestResult = results[best.key];
    const acceptable = bestResult.uncertaintyStd <= 0.8;
    // If the best by hazard has unacceptable uncertainty, flag it but still recommend it
    return { theme: best, result: bestResult, acceptable, ranked };
  }, [results]);

  return (
    <div className="relative">
      {/* ── Page Header ── */}
      <PageHeader
        icon={GitCompare}
        title="Treatment Simulator"
        subtitle="Counterfactual Intervention Analysis · Comparative Outcomes"
        accent="amber"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="glass-card rounded-xl px-3.5 py-2 flex items-center gap-2">
            <FlaskConical className="text-amber-600" size={14} />
            <span className="text-[9px] uppercase tracking-wider text-amber-700 font-bold">Counterfactual Mode</span>
          </div>
          <div className="glass-card-emerald rounded-xl px-3.5 py-2 flex items-center gap-2 glow-emerald">
            <ShieldCheck className="text-emerald-600" size={14} />
            <span className="text-[9px] uppercase tracking-wider text-emerald-700 font-bold">3-Arm Comparison</span>
          </div>
        </div>
      </PageHeader>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Shared Patient Profile — compact horizontal controls                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        whileHover={{ y: -2 }} className="glass-card rounded-3xl p-5 mb-5"
      >
        <ModuleHeader icon={Activity} title="Shared Patient Profile" subtitle="Counterfactual Baseline · Applied to All 3 Arms" accent="amber" />

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
              <SegmentedControl options={['Yes', 'No'] as any} value={hasFullStaging ? 'Yes' : 'No'} onChange={(v) => setHasFullStaging(v === 'Yes')} columns={2} />
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
                <MetricCell label="Mean Hazard" value={r.meanHazard.toFixed(4)} accent={theme.accent} />
                <MetricCell label="Uncertainty σ" value={r.uncertaintyStd.toFixed(4)} accent={r.uncertaintyStd > 0.8 ? 'rose' : theme.accent} danger={r.uncertaintyStd > 0.8} />
                <MetricCell label="Median OS" value={r.medianDay !== null ? `${r.medianDay} d` : '> 2000 d'} accent={theme.accent} />
                <MetricCell label="Day 1095 Surv." value={`${r.s1095.toFixed(1)}%`} accent={theme.accent} />
              </div>

              {/* Uncertainty flag */}
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-semibold">
                {r.uncertaintyStd > 0.8 ? (
                  <span className="flex items-center gap-1.5 text-rose-500">
                    <AlertTriangle size={12} /> High uncertainty — verify pathology
                  </span>
                ) : (
                  <span className={`flex items-center gap-1.5 ${a.text}`}>
                    <CheckCircle2 size={12} /> Confidence bounds verified
                  </span>
                )}
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
                All 3 Interventions · Same Patient Profile · Counterfactual Overlay
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
      {/* Hazard reduction table                                              */}
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
            <h2 className="text-[15px] font-bold text-slate-800">Hazard Reduction Matrix</h2>
            <p className="text-[10px] text-slate-400 font-mono-data uppercase tracking-[0.15em] mt-0.5">
              Δ Log-Hazard vs. Standard Clinical Routine · 95% Confidence Intervals
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/70">
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data">Intervention</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">Mean Hazard</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">Δ vs. Standard</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">Improvement</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">95% CI (Δ)</th>
                <th className="py-3 px-3 text-[9px] text-slate-400 uppercase tracking-[0.15em] font-bold font-mono-data text-right">σ</th>
              </tr>
            </thead>
            <tbody>
              {hazardTable.map((row, i) => {
                const a = ACCENT[row.theme.accent];
                const isBaseline = row.theme.key === 'standard';
                const beneficial = row.delta < 0;
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
                      {row.meanHazard.toFixed(4)}
                    </td>
                    <td className={`py-3.5 px-3 text-right font-mono-data text-[12px] font-bold ${isBaseline ? 'text-slate-400' : beneficial ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {isBaseline ? '—' : (row.delta >= 0 ? '+' : '') + row.delta.toFixed(4)}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {isBaseline ? (
                        <span className="text-slate-400 font-mono-data text-[12px]">—</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 font-mono-data text-[12px] font-bold ${beneficial ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {beneficial ? <TrendingUp size={11} /> : <AlertTriangle size={11} />}
                          {row.pctImprovement.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-data text-[11px] text-slate-500">
                      {isBaseline ? '—' : `[${row.ciLow.toFixed(3)}, ${row.ciHigh.toFixed(3)}]`}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <span className={`font-mono-data text-[12px] font-bold ${row.uncertainty > 0.8 ? 'text-rose-500' : row.uncertainty > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {row.uncertainty.toFixed(3)}
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
            Negative Δ indicates hazard reduction (benefit) relative to the Standard Clinical Routine baseline.
            CI width derived from combined epistemic uncertainty of both arms (±1.96 · √(σ²ₐ + σ²ᵦ)).
          </span>
        </div>
      </motion.section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Recommendation card                                                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.44, ease: 'easeOut' }}
        whileHover={{ y: -2 }}
        className={`rounded-3xl p-6 mb-5 ${recommendation.theme.headerClass}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <motion.div
              initial={{ scale: 0.7, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className={`w-12 h-12 rounded-2xl ${ACCENT[recommendation.theme.accent].bgSoft} ${ACCENT[recommendation.theme.accent].border} border flex items-center justify-center shrink-0`}
            >
              <CheckCircle2 className={ACCENT[recommendation.theme.accent].text} size={24} />
            </motion.div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[9px] uppercase tracking-[0.18em] font-mono-data font-bold ${ACCENT[recommendation.theme.accent].text}`}>
                  Projected Optimal Arm
                </span>
                <ArrowRight size={12} className={ACCENT[recommendation.theme.accent].text} />
              </div>
              <h2 className={`text-[18px] font-extrabold tracking-tight ${ACCENT[recommendation.theme.accent].text}`}>
                {recommendation.theme.label}
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xl leading-relaxed">
                Based on counterfactual simulation across the shared patient profile, this intervention
                projects the lowest mean log-hazard (
                <span className={`font-mono-data font-bold ${ACCENT[recommendation.theme.accent].text}`}>
                  {recommendation.result.meanHazard.toFixed(4)}
                </span>
                ) with a Day-1095 survival of{' '}
                <span className={`font-mono-data font-bold ${ACCENT[recommendation.theme.accent].text}`}>
                  {recommendation.result.s1095.toFixed(1)}%
                </span>{' '}
                and median OS of{' '}
                <span className={`font-mono-data font-bold ${ACCENT[recommendation.theme.accent].text}`}>
                  {recommendation.result.medianDay !== null ? `${recommendation.result.medianDay} days` : '> 2000 days'}
                </span>.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {recommendation.acceptable ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                <ShieldCheck className="text-emerald-600" size={13} />
                <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Uncertainty Acceptable</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200">
                <AlertTriangle className="text-rose-500" size={13} />
                <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">High Uncertainty — Verify</span>
              </div>
            )}
            <span className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider">
              σ = {recommendation.result.uncertaintyStd.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Ranking summary */}
        <div className="mt-5 pt-5 border-t border-slate-200/60">
          <div className="text-[9px] text-slate-400 uppercase tracking-[0.15em] font-mono-data font-bold mb-3">Projected Outcome Ranking</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recommendation.ranked.map((theme, i) => {
              const r = results[theme.key];
              const a = ACCENT[theme.accent];
              return (
                <motion.div
                  key={theme.key}
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 + i * 0.08 }}
                  className={`p-3.5 rounded-2xl border ${i === 0 ? `${a.border} ${a.bgSoft}` : 'border-slate-200/60 bg-white/50'}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: theme.line }} />
                      <span className={`text-[11px] font-bold ${i === 0 ? a.text : 'text-slate-600'}`}>{theme.shortLabel}</span>
                    </span>
                    <span className={`text-[9px] font-mono-data font-bold ${i === 0 ? a.text : 'text-slate-400'}`}>
                      Rank #{i + 1}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono-data">
                    <span className="text-slate-400">Hazard</span>
                    <span className={`font-bold ${i === 0 ? a.text : 'text-slate-600'}`}>{r.meanHazard.toFixed(4)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono-data mt-1">
                    <span className="text-slate-400">Day 1095</span>
                    <span className={`font-bold ${i === 0 ? a.text : 'text-slate-600'}`}>{r.s1095.toFixed(1)}%</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Footer KPIs                                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          icon={GitCompare}
          label="Arms Compared"
          value="3"
          sub="Counterfactual intervention pathways"
          accent="amber"
        />
        <KpiCard
          icon={TrendingUp}
          label="Best Δ Hazard"
          value={`${Math.min(...THEME_ORDER.filter((t) => t.key !== 'standard').map((t) => results[t.key].meanHazard - results.standard.meanHazard)).toFixed(3)}`}
          sub="Reduction vs. standard baseline"
          accent="emerald"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Confidence"
          value={recommendation.acceptable ? 'Verified' : 'Caution'}
          sub={recommendation.acceptable ? 'Uncertainty within tolerance' : 'Epistemic limit flagged'}
          danger={!recommendation.acceptable}
          accent="emerald"
        />
      </div>

      {/* Footer */}
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.15em] pb-4">
        <div className="flex items-center gap-2">
          <GitCompare size={11} className="text-amber-500" />
          <span>AegisOnco DTC · Counterfactual Treatment Simulator</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Activity size={10} className="text-amber-500" /> Cox PH · MC Dropout</span>
          <span>·</span>
          <span className="flex items-center gap-1"><ShieldCheck size={10} className="text-emerald-500" /> Same Profile · 3 Arms</span>
          <span>·</span>
          <span>Synthetic Data — No PHI Transmitted</span>
        </div>
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
