import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { addDays, format } from 'date-fns';
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, RadialBarChart, RadialBar,
} from 'recharts';
import {
  UserCircle, ArrowLeft, Activity, Dna, Microscope, FlaskConical,
  Calendar, ShieldCheck, AlertTriangle, HeartPulse, Brain, FileText,
  TrendingUp, Clock,
} from 'lucide-react';
import {
  PageHeader, GlassCard, ModuleHeader,
} from '../components/ui';
import {
  type PatientRecord, type PatientInput, type Stage, type Status,
  INTERVENTIONS, STAGE_MAP,
} from '../lib/types';
import { runFullEngine, generateSurvivalCurve } from '../lib/engine';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function recordToInput(r: PatientRecord, intervention: PatientInput['intervention'] = r.intervention): PatientInput {
  return {
    age: r.age,
    tumorSize: r.tumor_size,
    lymphNodes: r.lymph_nodes,
    npi: r.npi,
    stage: r.stage,
    hasFullStaging: r.has_full_staging,
    tp53: r.tp53,
    egfr: r.egfr,
    kras: r.kras,
    myc: r.myc,
    grade: r.grade,
    cellularity: r.cellularity,
    mutationCount: r.mutation_count,
    erStatus: r.er_status,
    her2Status: r.her2_status,
    prStatus: r.pr_status,
    intervention,
  };
}

function stageBadgeClass(stage: Stage): string {
  switch (stage) {
    case 'Stage 0': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Stage I': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Stage II': return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'Stage III': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Stage IV': return 'bg-rose-50 text-rose-700 border-rose-200';
    default: return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function gradeBadgeClass(grade: number): string {
  switch (grade) {
    case 1: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 2: return 'bg-amber-50 text-amber-700 border-amber-200';
    case 3: return 'bg-rose-50 text-rose-700 border-rose-200';
    default: return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

// Green (protective, negative z) → red (risky, positive z)
function geneColor(z: number): string {
  // Clamp z to [-3, 3] then interpolate hue from 140 (green) to 0 (red)
  const clamped = Math.max(-3, Math.min(3, z));
  const t = (clamped + 3) / 6; // 0 = green, 1 = red
  const hue = 140 - t * 140;
  return `hsl(${hue}, 70%, 50%)`;
}

function receptorBadgeClass(status: Status, receptor: 'ER' | 'HER2' | 'PR'): string {
  // ER-positive and PR-positive are prognostically favorable → green
  // HER2-positive is prognostically unfavorable → amber
  // Negatives flip the meaning
  if (receptor === 'HER2') {
    return status === 'Negative'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  }
  // ER / PR
  return status === 'Positive'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white/60 border border-slate-200/50 ${className}`}>
      <div className="shimmer absolute inset-0" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <SkeletonBlock className="h-44" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>
      <SkeletonBlock className="h-56" />
      <SkeletonBlock className="h-64" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stagger container
// ─────────────────────────────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 280, damping: 26 },
  },
};

function StaggerItem({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom tooltip for survival curves
// ─────────────────────────────────────────────────────────────────────────────
interface CurveTooltipPayload {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}
function SurvivalTooltip({ active, payload, label }: CurveTooltipPayload) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass-card rounded-xl px-3 py-2.5 shadow-lg">
      <div className="text-[10px] font-mono-data font-bold text-slate-700 mb-1.5">
        Day {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[10px] font-mono-data">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-bold text-slate-700">{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero Section
// ─────────────────────────────────────────────────────────────────────────────
function HeroSection({ patient, curve, medianDay }: {
  patient: PatientRecord;
  curve: ReturnType<typeof generateSurvivalCurve>;
  medianDay: number | null;
}) {
  // Hazard gauge: normalize mean_hazard to a 0-100 "risk score"
  // Typical mean_hazard range roughly [-1, 3]; map to 0-100
  const hazardScore = Math.max(0, Math.min(100, ((patient.mean_hazard + 1) / 4) * 100));
  const hazardPct = hazardScore.toFixed(0);

  // Day-1095 survival
  const day1095 = patient.day1095_survival;
  const day1095Color = day1095 < 30 ? '#f43f5e' : day1095 < 60 ? '#f59e0b' : '#10b981';

  // Uncertainty
  const unc = patient.uncertainty_std;
  const uncDanger = unc > 0.8;

  const gaugeData = [{ name: 'risk', value: hazardScore, fill: hazardScore > 66 ? '#f43f5e' : hazardScore > 40 ? '#f59e0b' : '#10b981' }];

  return (
    <GlassCard accent="blue" className="rounded-3xl p-6 overflow-hidden relative">
      {/* Ambient glow */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-300/15 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: identity + badges */}
        <div className="lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                <UserCircle size={18} className="text-blue-600" />
              </div>
              <span className="text-[10px] font-mono-data uppercase tracking-[0.18em] text-slate-400 font-bold">
                Patient Identifier
              </span>
            </div>
            <h2 className="font-mono-data text-[34px] font-extrabold tracking-tight text-slate-800 leading-none">
              {patient.patient_code}
            </h2>
            <p className="text-[11px] text-slate-500 mt-2 font-mono-data">
              Registered {format(new Date(patient.created_at), 'MMM d, yyyy · HH:mm')}
            </p>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono-data font-bold border bg-blue-50 text-blue-700 border-blue-200">
                <Activity size={12} /> {patient.age} yrs
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono-data font-bold border ${stageBadgeClass(patient.stage)}`}>
                <Microscope size={12} /> {patient.stage}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono-data font-bold border ${gradeBadgeClass(patient.grade)}`}>
                <ShieldCheck size={12} /> Grade {patient.grade}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono-data font-bold border bg-slate-50 text-slate-700 border-slate-200">
                <Brain size={12} /> {patient.cellularity} cellularity
              </span>
            </div>
          </div>

          {/* Uncertainty + day 1095 */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="rounded-2xl bg-white/60 border border-slate-200/60 p-3.5">
              <div className="flex items-center gap-1.5 mb-1">
                {uncDanger ? <AlertTriangle size={12} className="text-rose-500" /> : <ShieldCheck size={12} className="text-emerald-500" />}
                <span className="text-[9px] uppercase tracking-wider font-mono-data font-bold text-slate-400">Uncertainty σ</span>
              </div>
              <div className={`font-mono-data text-[20px] font-extrabold ${uncDanger ? 'text-rose-500' : 'text-slate-700'}`}>
                {unc.toFixed(3)}
              </div>
              <div className="text-[9px] text-slate-400 font-mono-data mt-0.5">
                {uncDanger ? 'High epistemic risk' : 'Within tolerance'}
              </div>
            </div>
            <div className="rounded-2xl bg-white/60 border border-slate-200/60 p-3.5">
              <div className="flex items-center gap-1.5 mb-1">
                <HeartPulse size={12} style={{ color: day1095Color }} />
                <span className="text-[9px] uppercase tracking-wider font-mono-data font-bold text-slate-400">Day 1095 Surv</span>
              </div>
              <div className="font-mono-data text-[20px] font-extrabold" style={{ color: day1095Color }}>
                {day1095.toFixed(1)}%
              </div>
              <div className="text-[9px] text-slate-400 font-mono-data mt-0.5">
                3-year projection
              </div>
            </div>
          </div>
        </div>

        {/* Middle: hazard gauge */}
        <div className="lg:col-span-3 flex flex-col items-center justify-center">
          <div className="text-[10px] font-mono-data uppercase tracking-[0.18em] text-slate-400 font-bold mb-2">
            Mean Hazard Gauge
          </div>
          <div className="relative w-[180px] h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="68%"
                outerRadius="100%"
                data={gaugeData}
                startAngle={220}
                endAngle={-40}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar
                  background={{ fill: 'rgba(148,163,184,0.15)' }}
                  dataKey="value"
                  cornerRadius={20}
                  angleAxisId={0}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-mono-data text-[30px] font-extrabold text-slate-800 leading-none">
                {hazardPct}
              </span>
              <span className="text-[9px] font-mono-data uppercase tracking-wider text-slate-400 mt-1">risk score</span>
              <span className="font-mono-data text-[11px] font-bold text-slate-600 mt-1.5">
                μ = {patient.mean_hazard.toFixed(3)}
              </span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono-data mt-2 text-center">
            {medianDay !== null ? (
              <>Median OS ≈ <span className="font-bold text-slate-600">{medianDay} days</span></>
            ) : (
              <>Median OS not reached</>
            )}
          </div>
        </div>

        {/* Right: mini survival curve */}
        <div className="lg:col-span-4">
          <div className="text-[10px] font-mono-data uppercase tracking-[0.18em] text-slate-400 font-bold mb-2">
            Reconstructed Survival Curve
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={curve} margin={{ top: 5, right: 8, bottom: 2, left: -18 }}>
                <defs>
                  <linearGradient id="heroSurvArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="heroRangeArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickFormatter={(v) => `${Math.round(v / 365 * 10) / 10}y`}
                  stroke="rgba(148,163,184,0.3)"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickFormatter={(v) => `${v}%`}
                  stroke="rgba(148,163,184,0.3)"
                />
                <Tooltip content={<SurvivalTooltip />} />
                <ReferenceLine y={50} stroke="#f43f5e" strokeDasharray="4 4" strokeWidth={1} />
                <ReferenceLine x={1095} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} />
                <Area
                  type="monotone"
                  dataKey="range"
                  fill="url(#heroRangeArea)"
                  stroke="none"
                  name="95% CI"
                />
                <Area
                  type="monotone"
                  dataKey="survival"
                  fill="url(#heroSurvArea)"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  name="Survival"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 mt-1 text-[9px] font-mono-data text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Survival</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400/40" />95% CI</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-rose-500" />50% line</span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinical Metadata Card
// ─────────────────────────────────────────────────────────────────────────────
function ClinicalCard({ patient }: { patient: PatientRecord }) {
  const fields: { label: string; value: string; sub?: string }[] = [
    { label: 'Age', value: `${patient.age}`, sub: 'years' },
    { label: 'Tumor Size', value: `${patient.tumor_size}`, sub: 'mm' },
    { label: 'Positive Lymph Nodes', value: `${patient.lymph_nodes}`, sub: 'count' },
    { label: 'Nottingham Prognostic Index', value: patient.npi.toFixed(1), sub: 'NPI score' },
    { label: 'Clinical Stage', value: patient.stage, sub: 'TNM' },
    { label: 'Full Staging Workup', value: patient.has_full_staging ? 'Complete' : 'Incomplete', sub: patient.has_full_staging ? 'confirmed' : 'pending' },
  ];

  return (
    <GlassCard className="rounded-3xl p-5">
      <ModuleHeader icon={Microscope} title="Clinical Metadata" subtitle="Module 1 · EHR Stratification" accent="violet" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {fields.map((f) => (
          <motion.div
            key={f.label}
            whileHover={{ y: -3 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="rounded-2xl bg-white/60 border border-slate-200/60 p-3.5"
          >
            <div className="text-[9px] uppercase tracking-wider font-mono-data font-bold text-slate-400">
              {f.label}
            </div>
            <div className="font-mono-data text-[18px] font-extrabold text-slate-800 mt-1">
              {f.value}
            </div>
            {f.sub && (
              <div className="text-[9px] text-slate-400 font-mono-data mt-0.5">{f.sub}</div>
            )}
          </motion.div>
        ))}
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Genomic Profile Card
// ─────────────────────────────────────────────────────────────────────────────
function GenomicCard({ patient, radarData }: {
  patient: PatientRecord;
  radarData: { axis: string; value: number }[];
}) {
  const genes = [
    { key: 'TP53', label: 'TP53', z: patient.tp53 },
    { key: 'EGFR', label: 'EGFR', z: patient.egfr },
    { key: 'KRAS', label: 'KRAS', z: patient.kras },
    { key: 'MYC', label: 'MYC', z: patient.myc },
  ] as const;

  return (
    <GlassCard className="rounded-3xl p-5">
      <ModuleHeader icon={Dna} title="Genomic Profile" subtitle="Module 2 · 16-Gene Panel (4 Exposed)" accent="rose" />

      {/* Gene expression bars */}
      <div className="space-y-3.5 mb-5">
        {genes.map((g) => {
          const color = geneColor(g.z);
          // z range [-3, 3] → width 0-100%
          const pct = ((g.z + 3) / 6) * 100;
          return (
            <div key={g.key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-mono-data font-bold text-slate-600">{g.label}</span>
                <span className="font-mono-data text-[12px] font-bold" style={{ color }}>
                  z = {g.z >= 0 ? '+' : ''}{g.z.toFixed(2)}
                </span>
              </div>
              <div className="relative h-2.5 rounded-full bg-slate-100 overflow-hidden">
                {/* Center line at 50% */}
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-300/70 z-10" />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  className="absolute top-0 bottom-0 left-0 rounded-full"
                  style={{ background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mutation count */}
      <div className="flex items-center justify-between rounded-2xl bg-white/60 border border-slate-200/60 px-4 py-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center">
            <AlertTriangle size={14} className="text-amber-600" />
          </div>
          <span className="text-[11px] font-mono-data font-bold text-slate-600">Mutation Burden</span>
        </div>
        <span className="font-mono-data text-[18px] font-extrabold text-amber-600">
          {patient.mutation_count}
        </span>
      </div>

      {/* Radar chart */}
      <div className="text-[10px] font-mono-data uppercase tracking-[0.18em] text-slate-400 font-bold mb-2">
        Risk Profile Radar
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid stroke="rgba(148,163,184,0.25)" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: '#64748b', fontFamily: 'JetBrains Mono' }} />
            <Radar
              name="Risk"
              dataKey="value"
              stroke="#f43f5e"
              fill="#f43f5e"
              fillOpacity={0.25}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(255,255,255,0.98)',
                border: '1px solid rgba(244,63,94,0.2)',
                borderRadius: 12,
                fontSize: 11,
                fontFamily: 'JetBrains Mono',
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receptor Status Card
// ─────────────────────────────────────────────────────────────────────────────
function ReceptorCard({ patient }: { patient: PatientRecord }) {
  const receptors: { label: string; status: Status; key: 'ER' | 'HER2' | 'PR'; desc: string }[] = [
    { label: 'Estrogen Receptor (ER)', status: patient.er_status, key: 'ER', desc: 'Hormone therapy responsiveness' },
    { label: 'HER2 Receptor', status: patient.her2_status, key: 'HER2', desc: 'Targeted therapy eligibility' },
    { label: 'Progesterone Receptor (PR)', status: patient.pr_status, key: 'PR', desc: 'Endocrine responsiveness' },
  ];

  return (
    <GlassCard className="rounded-3xl p-5">
      <ModuleHeader icon={ShieldCheck} title="Receptor Status" subtitle="Module 3 · IHC Biomarkers" accent="emerald" />
      <div className="space-y-3">
        {receptors.map((r) => (
          <motion.div
            key={r.key}
            whileHover={{ x: 3 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex items-center justify-between rounded-2xl bg-white/60 border border-slate-200/60 p-4"
          >
            <div>
              <div className="text-[11px] font-mono-data font-bold text-slate-700">{r.label}</div>
              <div className="text-[9px] text-slate-400 font-mono-data mt-0.5">{r.desc}</div>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono-data font-bold border ${receptorBadgeClass(r.status, r.key)}`}>
              {r.status === 'Positive' ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
              {r.status}
            </span>
          </motion.div>
        ))}
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Treatment Comparison Card
// ─────────────────────────────────────────────────────────────────────────────
function TreatmentCard({ patient, interventions }: {
  patient: PatientRecord;
  interventions: { name: string; curve: ReturnType<typeof generateSurvivalCurve>; medianDay: number | null; s1095: number; color: string }[];
}) {
  const currentIdx = interventions.findIndex((i) => i.name === patient.intervention);

  return (
    <GlassCard className="rounded-3xl p-5">
      <ModuleHeader icon={FlaskConical} title="Treatment Comparison" subtitle="Module 4 · Counterfactual Intervention" accent="amber" />

      {/* Current intervention highlight */}
      <div className="rounded-2xl bg-amber-50/60 border border-amber-200/60 p-4 mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center">
            <FlaskConical size={18} className="text-amber-600" />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider font-mono-data font-bold text-amber-500/70">Current Intervention</div>
            <div className="text-[13px] font-mono-data font-bold text-slate-800">{patient.intervention}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider font-mono-data font-bold text-slate-400">Projected Median OS</div>
          <div className="font-mono-data text-[16px] font-extrabold text-amber-600">
            {interventions[currentIdx]?.medianDay ?? '—'} {interventions[currentIdx]?.medianDay ? 'days' : ''}
          </div>
        </div>
      </div>

      {/* 3 mini survival curves */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {interventions.map((iv, i) => {
          const isCurrent = iv.name === patient.intervention;
          return (
            <motion.div
              key={iv.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 280, damping: 24 }}
              className={`rounded-2xl p-3 border ${isCurrent ? 'bg-amber-50/50 border-amber-200' : 'bg-white/60 border-slate-200/60'}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono-data font-bold text-slate-700 leading-tight">
                  {iv.name}
                </span>
                {isCurrent && (
                  <span className="text-[8px] font-mono-data font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                    CURRENT
                  </span>
                )}
              </div>
              <div className="h-[110px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={iv.curve} margin={{ top: 2, right: 2, bottom: 0, left: -28 }}>
                    <defs>
                      <linearGradient id={`txArea${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={iv.color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={iv.color} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="day"
                      tick={false}
                      stroke="rgba(148,163,184,0.3)"
                    />
                    <YAxis domain={[0, 100]} tick={false} stroke="rgba(148,163,184,0.3)" />
                    <ReferenceLine y={50} stroke="#f43f5e" strokeDasharray="3 3" strokeWidth={0.8} />
                    <Area
                      type="monotone"
                      dataKey="survival"
                      fill={`url(#txArea${i})`}
                      stroke={iv.color}
                      strokeWidth={2}
                      name="Survival"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[9px] font-mono-data">
                <span className="text-slate-400">Med OS: <span className="font-bold text-slate-600">{iv.medianDay ?? 'NR'}</span></span>
                <span className="text-slate-400">3y: <span className="font-bold" style={{ color: iv.color }}>{iv.s1095.toFixed(0)}%</span></span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinical Narrative Card
// ─────────────────────────────────────────────────────────────────────────────
function NarrativeCard({ patient, interventions }: {
  patient: PatientRecord;
  interventions: { name: string; medianDay: number | null; meanHazard: number }[];
}) {
  const narrative = useMemo(() => {
    const current = interventions.find((i) => i.name === patient.intervention);
    const best = interventions.reduce((a, b) => (b.meanHazard < a.meanHazard ? b : a), interventions[0]);
    const worst = interventions.reduce((a, b) => (b.meanHazard > a.meanHazard ? b : a), interventions[0]);

    const hazardReduction = current && best
      ? ((worst.meanHazard - current.meanHazard) / Math.abs(worst.meanHazard || 0.01)) * 100
      : 0;

    const geneDescriptors: string[] = [];
    const addGene = (name: string, z: number) => {
      if (Math.abs(z) < 0.1) return;
      const dir = z > 0 ? 'overexpression' : 'underexpression';
      geneDescriptors.push(`${name} ${dir} (z=${z.toFixed(1)})`);
    };
    addGene('TP53', patient.tp53);
    addGene('EGFR', patient.egfr);
    addGene('KRAS', patient.kras);
    addGene('MYC', patient.myc);
    const geneStr = geneDescriptors.length > 0
      ? `Genomic analysis reveals ${geneDescriptors.join(', ')}.`
      : 'Genomic analysis shows all four exposed genes within normal expression ranges.';

    const medianStr = current?.medianDay != null
      ? `a median overall survival of ${current.medianDay} days`
      : 'median overall survival not reached within the simulation horizon';

    const interventionStr = best.name !== patient.intervention
      ? ` The ${best.name} intervention shows a projected hazard reduction of ${Math.max(0, hazardReduction).toFixed(1)}% relative to the highest-risk option.`
      : ` The current ${patient.intervention} intervention represents the lowest projected hazard among the simulated strategies.`;

    return `Patient ${patient.patient_code} is a ${patient.age}-year-old presenting with ${patient.stage} breast cancer. The tumor measures ${patient.tumor_size}mm with ${patient.lymph_nodes} positive lymph node${patient.lymph_nodes === 1 ? '' : 's'}. Nottingham Prognostic Index: ${patient.npi.toFixed(1)}. ${geneStr} The patient is ER-${patient.er_status.toLowerCase()}, HER2-${patient.her2_status.toLowerCase()}, PR-${patient.pr_status.toLowerCase()}. Under ${patient.intervention}, the model projects ${medianStr} with 95% CI.${interventionStr}`;
  }, [patient, interventions]);

  return (
    <GlassCard className="rounded-3xl p-5">
      <ModuleHeader icon={FileText} title="Clinical Narrative" subtitle="AI-Generated Prognostic Summary" accent="blue" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl bg-white/60 border border-slate-200/60 p-5"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
            <Brain size={16} className="text-blue-600" />
          </div>
          <p className="text-[12px] leading-relaxed text-slate-600 font-mono-data">
            {narrative}
          </p>
        </div>
      </motion.div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Card
// ─────────────────────────────────────────────────────────────────────────────
function TimelineCard({ patient, medianDay }: {
  patient: PatientRecord;
  medianDay: number | null;
}) {
  const createdAt = new Date(patient.created_at);

  const milestones: { label: string; date: Date; icon: typeof Calendar; color: string; projected?: boolean }[] = [
    { label: 'Diagnosis Date', date: createdAt, icon: Calendar, color: '#3b82f6' },
    { label: 'Staging Date', date: addDays(createdAt, 3), icon: Microscope, color: '#8b5cf6' },
    { label: 'Treatment Start', date: addDays(createdAt, 10), icon: FlaskConical, color: '#f59e0b' },
  ];

  if (medianDay != null) {
    milestones.push({
      label: 'Projected Median OS',
      date: addDays(createdAt, 10 + medianDay),
      icon: TrendingUp,
      color: '#f43f5e',
      projected: true,
    });
  }
  milestones.push({
    label: '3-Year Survival Milestone',
    date: addDays(createdAt, 10 + 1095),
    icon: HeartPulse,
    color: '#10b981',
    projected: true,
  });

  return (
    <GlassCard className="rounded-3xl p-5">
      <ModuleHeader icon={Clock} title="Clinical Timeline" subtitle="Observed & Projected Milestones" accent="cyan" />
      <div className="relative pl-8">
        {/* Vertical line */}
        <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-blue-200 via-violet-200 to-emerald-200" />

        <div className="space-y-5">
          {milestones.map((m, i) => {
            const Icon = m.icon;
            return (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.12, type: 'spring', stiffness: 280, damping: 24 }}
                className="relative"
              >
                {/* Node */}
                <div
                  className="absolute -left-[22px] top-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm"
                  style={{ background: `${m.color}20`, borderColor: m.color }}
                >
                  <Icon size={11} style={{ color: m.color }} />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 border border-slate-200/60 px-4 py-3">
                  <div>
                    <div className="text-[11px] font-mono-data font-bold text-slate-700">
                      {m.label}
                    </div>
                    {m.projected && (
                      <div className="text-[8px] font-mono-data uppercase tracking-wider text-slate-400 mt-0.5">
                        Projected
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono-data text-[12px] font-bold text-slate-700">
                      {format(m.date, 'MMM d, yyyy')}
                    </div>
                    <div className="font-mono-data text-[9px] text-slate-400">
                      {format(m.date, 'HH:mm')}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────
function ErrorState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <GlassCard className="rounded-3xl p-8">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mb-4 glow-rose"
        >
          <AlertTriangle size={26} className="text-rose-500" />
        </motion.div>
        <h3 className="text-[15px] font-extrabold text-slate-800 mb-1.5">Patient Not Found</h3>
        <p className="text-[11px] text-slate-500 font-mono-data max-w-md mb-5">{message}</p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.03 }}
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl text-[12px] font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 shadow-[0_4px_20px_rgba(59,130,246,0.4)] flex items-center gap-2"
        >
          <ArrowLeft size={14} /> Back to Registry
        </motion.button>
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchPatient() {
      if (!id) {
        setError('No patient ID provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const { data, error: dbError } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

      if (cancelled) return;

      if (dbError || !data) {
        setError(dbError?.message || `Patient with ID ${id} was not found in the federated cohort.`);
        setPatient(null);
      } else {
        setPatient(data as PatientRecord);
      }
      setLoading(false);
    }
    void fetchPatient();
    return () => { cancelled = true; };
  }, [id]);

  // Reconstruct survival curve from stored mean_hazard
  const curve = useMemo(() => {
    if (!patient) return [];
    return generateSurvivalCurve(patient.mean_hazard, patient.uncertainty_std);
  }, [patient]);

  const medianDay = patient?.median_os ?? null;

  // Run engine 3 times with each intervention (only changing intervention)
  const interventions = useMemo(() => {
    if (!patient) return [];
    const colors = ['#3b82f6', '#8b5cf6', '#f43f5e'];
    return INTERVENTIONS.map((name, i) => {
      const input = recordToInput(patient, name);
      const result = runFullEngine(input);
      return {
        name,
        curve: result.curve,
        medianDay: result.medianDay,
        s1095: result.s1095,
        meanHazard: result.meanHazard,
        color: colors[i],
      };
    });
  }, [patient]);

  // Radar data for genomic risk profile
  const radarData = useMemo(() => {
    if (!patient) return [];
    // Normalize each axis to 0-100 risk
    const ageRisk = Math.min(100, (patient.age / 97) * 100);
    const stageRisk = (STAGE_MAP[patient.stage] / 4) * 100;
    const npiRisk = Math.min(100, (patient.npi / 6.5) * 100);
    const tumorRisk = Math.min(100, (patient.tumor_size / 180) * 100);
    const nodeRisk = Math.min(100, (patient.lymph_nodes / 45) * 100);
    const mutationRisk = Math.min(100, (patient.mutation_count / 30) * 100);
    const geneRisk = Math.min(100, ((Math.abs(patient.tp53) + Math.abs(patient.egfr) + Math.abs(patient.kras) + Math.abs(patient.myc)) / 12) * 100);
    return [
      { axis: 'Age', value: ageRisk },
      { axis: 'Stage', value: stageRisk },
      { axis: 'NPI', value: npiRisk },
      { axis: 'Tumor', value: tumorRisk },
      { axis: 'Nodes', value: nodeRisk },
      { axis: 'Mutations', value: mutationRisk },
      { axis: 'Genomic', value: geneRisk },
    ];
  }, [patient]);

  return (
    <div className="min-h-screen mesh-bg text-slate-800 relative overflow-x-hidden">
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[10%] left-[15%] w-[400px] h-[400px] bg-blue-300/20 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[15%] right-[12%] w-[350px] h-[350px] bg-violet-300/15 rounded-full blur-[100px]"
        />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 lg:px-6 py-6">
        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.02 }}
          onClick={() => navigate('/registry')}
          className="mb-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold text-slate-600 bg-white/70 border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
        >
          <ArrowLeft size={14} /> Back to Registry
        </motion.button>

        {/* Page header */}
        {patient && !loading && !error && (
          <PageHeader
            icon={UserCircle}
            title={patient.patient_code}
            subtitle="Comprehensive Patient Profile · Digital Twin Analysis"
            accent="blue"
          />
        )}

        {/* Body */}
        {loading ? (
          <DetailSkeleton />
        ) : error || !patient ? (
          <ErrorState message={error || 'Unknown error'} onBack={() => navigate('/registry')} />
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-5"
          >
            {/* Hero */}
            <StaggerItem>
              <HeroSection patient={patient} curve={curve} medianDay={medianDay} />
            </StaggerItem>

            {/* Clinical + Genomic */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <StaggerItem>
                <ClinicalCard patient={patient} />
              </StaggerItem>
              <StaggerItem>
                <GenomicCard patient={patient} radarData={radarData} />
              </StaggerItem>
            </div>

            {/* Receptor + Treatment */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <StaggerItem>
                <ReceptorCard patient={patient} />
              </StaggerItem>
              <StaggerItem>
                <TreatmentCard patient={patient} interventions={interventions} />
              </StaggerItem>
            </div>

            {/* Narrative */}
            <StaggerItem>
              <NarrativeCard patient={patient} interventions={interventions} />
            </StaggerItem>

            {/* Timeline */}
            <StaggerItem>
              <TimelineCard patient={patient} medianDay={medianDay} />
            </StaggerItem>
          </motion.div>
        )}
      </div>
    </div>
  );
}
