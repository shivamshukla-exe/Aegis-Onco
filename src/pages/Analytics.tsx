import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, TrendingUp, Users, Activity, Brain, Sparkles,
  AlertTriangle, CheckCircle2, Lightbulb, PieChart as PieIcon, GitBranch,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  PageHeader, ModuleHeader, KpiCard, GlassCard, ACCENT,
} from '../components/ui';
import { POPULATION_STATS } from '../lib/engine';
import { STAGES } from '../lib/types';
import type { Stage } from '../lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Stage color palette (matches POPULATION_STATS.byStage colors)
// ─────────────────────────────────────────────────────────────────────────────
const STAGE_COLORS: Record<Stage, string> = {
  'Stage 0': '#10b981',
  'Stage I': '#3b82f6',
  'Stage II': '#8b5cf6',
  'Stage III': '#f59e0b',
  'Stage IV': '#f43f5e',
};

const TOTAL = POPULATION_STATS.totalPatients;

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic data generators — deterministic, derived from POPULATION_STATS
// ─────────────────────────────────────────────────────────────────────────────

// Survival curves per stage (Stage 0 → IV), synthetic Kaplan-Meier-like decay
const SURVIVAL_CURVES = STAGES.map((stage) => {
  const stageIdx = STAGES.indexOf(stage);
  // Higher stage → faster survival decay
  const baseHazard = 0.15 + stageIdx * 0.22;
  const points = Array.from({ length: 41 }, (_, i) => {
    const day = i * 50; // 0 → 2000
    const h0 = Math.pow(day / 1200, 1.8);
    const surv = Math.exp(-h0 * Math.exp(baseHazard)) * 100;
    return { day, survival: Math.max(Math.min(surv, 100), 0) };
  });
  return { stage, color: STAGE_COLORS[stage], data: points };
});

// Hazard distribution — synthetic log-hazard across population (smooth area)
const HAZARD_DISTRIBUTION = (() => {
  const points: { x: number; density: number }[] = [];
  // Bimodal-ish distribution centered around log-hazard ~0.4
  for (let x = -2; x <= 3; x += 0.1) {
    const v = Math.round(x * 10) / 10;
    const peak1 = Math.exp(-Math.pow(v - 0.4, 2) / 0.5) * 0.85;
    const peak2 = Math.exp(-Math.pow(v + 0.8, 2) / 0.8) * 0.35;
    points.push({ x: v, density: (peak1 + peak2) * 100 });
  }
  return points;
})();

// Mutation burden by stage — synthetic box-plot-like data
const MUTATION_BY_STAGE = STAGES.map((stage) => {
  const idx = STAGES.indexOf(stage);
  const base = 3 + idx * 2.5;
  return {
    stage,
    min: Math.max(0, base - 2.5),
    q1: base - 1.2,
    median: base,
    q3: base + 1.5,
    max: base + 3.5,
    color: STAGE_COLORS[stage],
  };
});

// Correlation matrix data
const CORR_VARS = ['Age', 'Tumor Size', 'Lymph Nodes', 'NPI', 'Mutation Count'];
const CORR_MATRIX: number[][] = [
  [1.00, 0.42, 0.38, 0.55, 0.21],
  [0.42, 1.00, 0.61, 0.78, 0.34],
  [0.38, 0.61, 1.00, 0.72, 0.29],
  [0.55, 0.78, 0.72, 1.00, 0.31],
  [0.21, 0.34, 0.29, 0.31, 1.00],
];

// Key insights
const INSIGHTS = [
  {
    icon: CheckCircle2,
    accent: 'emerald' as const,
    title: 'ER-Positive Survival Advantage',
    finding: 'ER-positive patients show 23% better 5-year survival compared to ER-negative cohorts, validating endocrine therapy responsiveness.',
    metric: '+23%',
    metricLabel: 'Survival Benefit',
  },
  {
    icon: TrendingUp,
    accent: 'violet' as const,
    title: 'Double-Agent Cocktail Efficacy',
    finding: 'Stage IV patients receiving Double-Agent Cocktail demonstrate 45% hazard reduction versus Standard Clinical Routine, with acceptable uncertainty bounds.',
    metric: '-45%',
    metricLabel: 'Hazard Reduction',
  },
  {
    icon: AlertTriangle,
    accent: 'amber' as const,
    title: 'High Mutation Burden Correlation',
    finding: 'Mutation count >12 strongly correlates with Stage III/IV progression (r=0.68), suggesting genomic instability as a late-stage driver.',
    metric: 'r=0.68',
    metricLabel: 'Correlation',
  },
  {
    icon: Brain,
    accent: 'cyan' as const,
    title: 'NPI Predictive Power',
    finding: 'Nottingham Prognostic Index shows the strongest correlation with tumor size (r=0.78) and lymph node involvement (r=0.72), confirming its composite utility.',
    metric: 'r=0.78',
    metricLabel: 'Strongest Link',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Custom Tooltip components
// ─────────────────────────────────────────────────────────────────────────────
function StageDonutTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const pct = ((d.count / TOTAL) * 100).toFixed(1);
  return (
    <div className="glass-card rounded-xl px-4 py-3 min-w-[160px]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
        <span className="text-[11px] font-bold text-slate-700">{d.stage}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-[10px] text-slate-400 font-mono-data">Count</span>
        <span className="font-mono-data text-[12px] font-bold text-slate-800">{d.count.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-6 mt-1">
        <span className="text-[10px] text-slate-400 font-mono-data">Share</span>
        <span className="font-mono-data text-[12px] font-bold text-cyan-600">{pct}%</span>
      </div>
    </div>
  );
}

function GenericTooltip({ active, payload, label, suffix = '' }: { active?: boolean; payload?: any[]; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-xl px-3 py-2 min-w-[120px]">
      {label !== undefined && <div className="text-[10px] text-slate-500 font-mono-data mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill || p.stroke }} />
            {p.name}
          </span>
          <span className="font-mono-data text-[11px] font-bold text-slate-700">
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small receptor donut chart
// ─────────────────────────────────────────────────────────────────────────────
function ReceptorDonut({ title, positive, negative }: { title: string; positive: number; negative: number }) {
  const total = positive + negative;
  const posPct = ((positive / total) * 100).toFixed(1);
  const data = [
    { name: 'Positive', value: positive, color: '#10b981' },
    { name: 'Negative', value: negative, color: '#f43f5e' },
  ];
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[130px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={55} paddingAngle={2} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip content={<GenericTooltip suffix="" />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-mono-data text-[18px] font-extrabold text-emerald-600">{posPct}%</span>
          <span className="text-[8px] text-slate-400 uppercase tracking-wider font-mono-data">Positive</span>
        </div>
      </div>
      <div className="text-[11px] font-bold text-slate-700 mt-1">{title}</div>
      <div className="flex items-center gap-3 mt-1.5">
        <span className="flex items-center gap-1 text-[9px] text-slate-500 font-mono-data">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> {positive.toLocaleString()}
        </span>
        <span className="flex items-center gap-1 text-[9px] text-slate-500 font-mono-data">
          <span className="w-2 h-2 rounded-full bg-rose-500" /> {negative.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Correlation heatmap cell color
// ─────────────────────────────────────────────────────────────────────────────
function corrColor(v: number): string {
  // -1 (rose) → 0 (slate) → 1 (cyan)
  if (v >= 0) {
    const alpha = 0.15 + v * 0.75;
    return `rgba(6, 182, 212, ${alpha})`;
  }
  const alpha = 0.15 + Math.abs(v) * 0.75;
  return `rgba(244, 63, 94, ${alpha})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const stageData = useMemo(() => POPULATION_STATS.byStage, []);
  const ageData = useMemo(() => POPULATION_STATS.byAgeGroup, []);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={BarChart3}
        title="Analytics & Insights"
        subtitle="Population-Level Oncological Intelligence · Cohort Analytics"
        accent="cyan"
      />

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={Users} label="Total Patients" value={TOTAL.toLocaleString()} sub="Across 5 active cohorts" accent="cyan" />
        <KpiCard icon={Activity} label="Median Age" value={`${POPULATION_STATS.medianAge}`} sub="Years at diagnosis" accent="violet" />
        <KpiCard icon={TrendingUp} label="Median Survival" value={`${POPULATION_STATS.medianSurvival.toLocaleString()}`} sub="Days (overall)" accent="emerald" />
        <KpiCard icon={GitBranch} label="Active Cohorts" value="5" sub="Stage-stratified groups" accent="amber" />
      </div>

      {/* ── Row 1: Stage Distribution (donut) + Age Distribution (bar) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Stage Distribution Donut */}
        <GlassCard className="rounded-2xl p-6">
          <ModuleHeader icon={PieIcon} title="Stage Distribution" subtitle="Cohort breakdown by TNM stage" accent="cyan" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="relative h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stageData}
                    dataKey="count"
                    nameKey="stage"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={3}
                    stroke="none"
                  >
                    {stageData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<StageDonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-mono-data text-[28px] font-extrabold text-slate-800">{TOTAL.toLocaleString()}</span>
                <span className="text-[9px] text-slate-400 uppercase tracking-[0.18em] font-mono-data">Total Patients</span>
              </div>
            </div>
            <div className="space-y-2.5">
              {stageData.map((d) => {
                const pct = ((d.count / TOTAL) * 100).toFixed(1);
                return (
                  <motion.div
                    key={d.stage}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: stageData.indexOf(d) * 0.06 }}
                    className="flex items-center gap-3"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-[11px] font-semibold text-slate-600 w-16 shrink-0">{d.stage}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: 0.2 + stageData.indexOf(d) * 0.06, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{ background: d.color }}
                      />
                    </div>
                    <span className="font-mono-data text-[11px] font-bold text-slate-700 w-12 text-right">{d.count}</span>
                    <span className="font-mono-data text-[10px] text-slate-400 w-10 text-right">{pct}%</span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </GlassCard>

        {/* Age Distribution Bar */}
        <GlassCard className="rounded-2xl p-6">
          <ModuleHeader icon={Users} title="Age Distribution" subtitle="Population by age group at diagnosis" accent="violet" />
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="range" stroke="#94a3b8" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip content={<GenericTooltip suffix="" />} cursor={{ fill: 'rgba(139,92,246,0.06)' }} />
                <Bar dataKey="count" name="Patients" radius={[6, 6, 0, 0]}>
                  {ageData.map((_, i) => (
                    <Cell key={i} fill={`url(#ageGrad${i})`} />
                  ))}
                </Bar>
                <defs>
                  {ageData.map((_, i) => (
                    <linearGradient key={i} id={`ageGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.35} />
                    </linearGradient>
                  ))}
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2">
            <span className="text-[10px] text-slate-400 font-mono-data">
              Peak cohort: <span className="text-violet-600 font-bold">60-70</span> ({ageData.find(a => a.range === '60-70')?.count} patients)
            </span>
          </div>
        </GlassCard>
      </div>

      {/* ── Row 2: Receptor Status Breakdown (3 small donuts) ── */}
      <GlassCard className="rounded-2xl p-6 mb-6">
        <ModuleHeader icon={Activity} title="Receptor Status Breakdown" subtitle="ER / HER2 / PR positive-negative ratios across population" accent="emerald" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ReceptorDonut title="ER Status" positive={POPULATION_STATS.byER.positive} negative={POPULATION_STATS.byER.negative} />
          <ReceptorDonut title="HER2 Status" positive={POPULATION_STATS.byHER2.positive} negative={POPULATION_STATS.byHER2.negative} />
          <ReceptorDonut title="PR Status" positive={POPULATION_STATS.byPR.positive} negative={POPULATION_STATS.byPR.negative} />
        </div>
      </GlassCard>

      {/* ── Row 3: Survival by Stage (multi-line) ── */}
      <GlassCard className="rounded-2xl p-6 mb-6">
        <ModuleHeader icon={TrendingUp} title="Survival by Stage" subtitle="Synthetic Kaplan-Meier curves · Stage 0 through IV" accent="cyan" />
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={SURVIVAL_CURVES[0].data.map((_, i) => {
              const point: Record<string, number> = { day: SURVIVAL_CURVES[0].data[i].day };
              SURVIVAL_CURVES.forEach((sc) => { point[sc.stage] = sc.data[i].survival; });
              return point;
            })} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="day"
                stroke="#94a3b8"
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Days', position: 'insideBottom', offset: -2, style: { fontSize: 9, fill: '#94a3b8' } }}
              />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                label={{ value: 'Survival %', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 9, fill: '#94a3b8' } }} />
              <Tooltip content={<GenericTooltip suffix="%" />} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} iconType="circle" />
              {SURVIVAL_CURVES.map((sc) => (
                <Line
                  key={sc.stage}
                  type="monotone"
                  dataKey={sc.stage}
                  stroke={sc.color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  animationDuration={800}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* ── Row 4: Hazard Distribution (area) + Mutation Burden by Stage (box-plot-like) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Hazard Distribution */}
        <GlassCard className="rounded-2xl p-6">
          <ModuleHeader icon={Brain} title="Hazard Distribution" subtitle="Synthetic log-hazard density across population" accent="rose" />
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={HAZARD_DISTRIBUTION} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="hazardGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.7} />
                    <stop offset="60%" stopColor="#f43f5e" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="x" stroke="#94a3b8" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                  label={{ value: 'Log-Hazard', position: 'insideBottom', offset: -2, style: { fontSize: 9, fill: '#94a3b8' } }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                  label={{ value: 'Density', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 9, fill: '#94a3b8' } }} />
                <Tooltip content={<GenericTooltip suffix="" />} />
                <Area type="monotone" dataKey="density" name="Density" stroke="#f43f5e" strokeWidth={2} fill="url(#hazardGrad)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 mt-1">
            <span className="text-[10px] text-slate-400 font-mono-data">
              Mean: <span className="text-rose-500 font-bold">0.42</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono-data">
              σ: <span className="text-rose-500 font-bold">0.71</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono-data">
              Range: <span className="text-rose-500 font-bold">[-2.0, 3.0]</span>
            </span>
          </div>
        </GlassCard>

        {/* Mutation Burden by Stage — box-plot-like */}
        <GlassCard className="rounded-2xl p-6">
          <ModuleHeader icon={GitBranch} title="Mutation Burden by Stage" subtitle="Synthetic mutation count ranges per stage" accent="amber" />
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MUTATION_BY_STAGE} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="stage" stroke="#94a3b8" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                  label={{ value: 'Mutation Count', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 9, fill: '#94a3b8' } }} />
                <Tooltip content={<GenericTooltip suffix="" />} cursor={{ fill: 'rgba(245,158,11,0.06)' }} />
                {/* IQR box (q1 → q3) */}
                <Bar dataKey="q3" name="Q3" stackId="a" fill="none" />
                <Bar dataKey="q1" name="Q1" stackId="a" radius={[4, 4, 0, 0]}>
                  {MUTATION_BY_STAGE.map((d, i) => (
                    <Cell key={i} fill={d.color} fillOpacity={0.35} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Custom box-plot overlay using CSS */}
          <div className="mt-3 space-y-1.5">
            {MUTATION_BY_STAGE.map((d) => {
              const range = d.max - d.min;
              const medPct = ((d.median - d.min) / range) * 100;
              const q1Pct = ((d.q1 - d.min) / range) * 100;
              const q3Pct = ((d.q3 - d.min) / range) * 100;
              return (
                <div key={d.stage} className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-slate-500 w-16 shrink-0">{d.stage}</span>
                  <div className="relative flex-1 h-6 flex items-center">
                    {/* whisker line */}
                    <div className="absolute inset-x-0 h-px bg-slate-200" />
                    {/* IQR box */}
                    <div
                      className="absolute h-4 rounded-sm border"
                      style={{
                        left: `${q1Pct}%`,
                        width: `${q3Pct - q1Pct}%`,
                        background: `${d.color}30`,
                        borderColor: d.color,
                      }}
                    />
                    {/* median tick */}
                    <div
                      className="absolute w-0.5 h-5 rounded-full"
                      style={{ left: `${medPct}%`, background: d.color }}
                    />
                    {/* min dot */}
                    <div className="absolute w-1.5 h-1.5 rounded-full -translate-x-1/2" style={{ left: '0%', background: d.color }} />
                    {/* max dot */}
                    <div className="absolute w-1.5 h-1.5 rounded-full -translate-x-1/2" style={{ left: '100%', background: d.color }} />
                  </div>
                  <span className="font-mono-data text-[10px] font-bold text-slate-600 w-12 text-right shrink-0">{d.median.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      {/* ── Row 5: Correlation Matrix (heatmap) ── */}
      <GlassCard className="rounded-2xl p-6 mb-6">
        <ModuleHeader icon={Sparkles} title="Correlation Matrix" subtitle="Pearson correlations between clinical variables" accent="cyan" />
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            {/* Header row */}
            <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `100px repeat(${CORR_VARS.length}, 1fr)` }}>
              <div />
              {CORR_VARS.map((v) => (
                <div key={v} className="text-[9px] font-mono-data font-bold text-slate-500 text-center uppercase tracking-wide py-1">
                  {v}
                </div>
              ))}
            </div>
            {/* Matrix rows */}
            {CORR_VARS.map((rowVar, i) => (
              <div key={rowVar} className="grid gap-1 mb-1" style={{ gridTemplateColumns: `100px repeat(${CORR_VARS.length}, 1fr)` }}>
                <div className="text-[10px] font-mono-data font-bold text-slate-600 flex items-center pr-2 uppercase tracking-wide">
                  {rowVar}
                </div>
                {CORR_MATRIX[i].map((val, j) => (
                  <motion.div
                    key={j}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: (i * 5 + j) * 0.02 }}
                    whileHover={{ scale: 1.08, zIndex: 10 }}
                    className="relative rounded-lg flex items-center justify-center cursor-default transition-all"
                    style={{
                      background: corrColor(val),
                      minHeight: '44px',
                      border: i === j ? '2px solid rgba(6,182,212,0.5)' : '1px solid rgba(255,255,255,0.4)',
                    }}
                    title={`${rowVar} ↔ ${CORR_VARS[j]}: r=${val.toFixed(2)}`}
                  >
                    <span className={`font-mono-data text-[12px] font-bold ${Math.abs(val) > 0.5 ? 'text-white' : 'text-slate-700'}`}>
                      {val.toFixed(2)}
                    </span>
                  </motion.div>
                ))}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center justify-end gap-3 mt-4">
              <span className="text-[9px] text-slate-400 font-mono-data">-1.0</span>
              <div className="flex h-3 w-32 rounded-full overflow-hidden">
                {Array.from({ length: 20 }, (_, i) => {
                  const v = -1 + (i / 19) * 2;
                  return <div key={i} className="flex-1" style={{ background: corrColor(v) }} />;
                })}
              </div>
              <span className="text-[9px] text-slate-400 font-mono-data">+1.0</span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Row 6: Key Insights ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {INSIGHTS.map((ins, i) => {
          const a = ACCENT[ins.accent];
          const Icon = ins.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <GlassCard accent={ins.accent} className="rounded-2xl p-5 h-full">
                <div className="flex items-start gap-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 + i * 0.1 }}
                    className={`w-11 h-11 rounded-xl ${a.bgSoft} flex items-center justify-center shrink-0 ${a.glow}`}
                  >
                    <Icon size={20} className={a.text} />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Lightbulb size={12} className={a.text} />
                      <h4 className={`text-[13px] font-bold tracking-tight ${a.text}`}>{ins.title}</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-3">{ins.finding}</p>
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-100/80">
                      <div>
                        <div className={`font-mono-data text-[20px] font-extrabold ${a.text}`}>{ins.metric}</div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono-data">{ins.metricLabel}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
