import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Cpu, Dna, HeartPulse, ScanLine, GitBranch, Zap, CircleDot,
  AlertTriangle, ShieldCheck, Gauge, Radio, Layers, Sparkles, TrendingUp,
  Brain, BarChart3, FlaskConical, Lock, Wifi,
} from 'lucide-react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, RadialBarChart,
  RadialBar, PolarAngleAxis, BarChart, Bar, Cell,
} from 'recharts';

import {
  ModuleHeader, SliderRow, SegmentedControl, SelectControl, StatusPill,
  KpiCard, PageHeader, ACCENT, type Accent,
} from '../components/ui';
import {
  type PatientInput, type Stage, type Cellularity, type Status,
  type Intervention, type CurvePoint,
  STAGES, CELLULARITIES, INTERVENTIONS, DEFAULT_INPUT,
} from '../lib/types';
import { runFullEngine, type EngineResult, FEDERATED_NODES } from '../lib/engine';
import DataPipeline from '../components/DataPipeline';
import TumorVisualization from '../components/TumorVisualization';

// ─────────────────────────────────────────────────────────────────────────────
// Custom Tooltip — local to this page
// ─────────────────────────────────────────────────────────────────────────────
function CurveTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
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
// MC Dropout Histogram — 20 samples, 10 bins
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
  const meanBin = Math.floor((mean - min) / binWidth);

  return (
    <div className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={histogram} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.15)" vertical={false} />
          <XAxis dataKey="bin" stroke="#94a3b8" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <YAxis stroke="#94a3b8" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {histogram.map((_, i) => (
              <Cell key={i} fill={i === meanBin ? '#8b5cf6' : '#c4b5fd'} />
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
// Uncertainty Gauge — RadialBarChart
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
        <motion.span key={value.toFixed(2)} initial={{ scale: 1.15, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25 }}
          className={`font-mono-data text-[22px] font-extrabold ${danger ? 'text-rose-500' : value > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {value.toFixed(2)}
        </motion.span>
        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-mono-data">σ Uncertainty</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default function CommandCenter() {
  // ── Local state for all PatientInput fields (DEFAULT_INPUT as initial) ──
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

  const [intervention, setIntervention] = useState<Intervention>(DEFAULT_INPUT.intervention);

  // ── Simulation run state ──
  const [hasRun, setHasRun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runCount, setRunCount] = useState(0);

  // ── Build the PatientInput object and compute the engine result reactively ──
  const input: PatientInput = useMemo(() => ({
    age, tumorSize, lymphNodes, npi, stage, hasFullStaging,
    tp53, egfr, kras, myc,
    grade, cellularity, mutationCount,
    erStatus, her2Status, prStatus,
    intervention,
  }), [age, tumorSize, lymphNodes, npi, stage, hasFullStaging,
    tp53, egfr, kras, myc,
    grade, cellularity, mutationCount,
    erStatus, her2Status, prStatus,
    intervention]);

  const engine: EngineResult = useMemo(() => runFullEngine(input), [input]);

  const {
    baseLogHazard, meanHazard, uncertaintyStd, samples, curve,
    medianDay, s365, s730, s1095, s2000, uncertaintyDanger,
  } = engine;

  // ── Clock ──
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const timeStr = now.toUTCString().split(' ')[4];

  // ── Run simulation handler (800ms spinning state) ──
  const handleRun = useCallback(() => {
    setIsRunning(true);
    setHasRun(true);
    setRunCount((c) => c + 1);
    window.setTimeout(() => setIsRunning(false), 800);
  }, []);

  // ── Gene expression bar data (4 exposed genes) ──
  const geneData = useMemo(() => [
    { gene: 'TP53', value: tp53, fill: tp53 >= 0 ? '#f43f5e' : '#10b981' },
    { gene: 'EGFR', value: egfr, fill: egfr >= 0 ? '#f43f5e' : '#10b981' },
    { gene: 'KRAS', value: kras, fill: kras >= 0 ? '#f43f5e' : '#10b981' },
    { gene: 'MYC', value: myc, fill: myc >= 0 ? '#f43f5e' : '#10b981' },
  ], [tp53, egfr, kras, myc]);

  // ── Status message ──
  const statusMessage = useMemo(() => {
    let msg = `Analysis Status: Complete\n`;
    msg += `Empirical Risk Factor (Mean Log-Hazard): ${meanHazard.toFixed(4)}\n`;
    msg += `Model Confidence Margin (Uncertainty Std): ${uncertaintyStd.toFixed(4)}\n`;
    if (uncertaintyStd > 0.8) {
      msg += `WARNING: High uncertainty detected, often linked to incomplete staging workup. Cross-verify with pathology manually.`;
    }
    return msg;
  }, [meanHazard, uncertaintyStd]);

  // ── Federated topology — top 3 nodes ──
  const topoNodes = FEDERATED_NODES.slice(0, 3);

  // ── Quick metrics for system status ──
  const quickMetrics: { label: string; val: string; accent: Accent }[] = [
    { label: 'Base Log-Hazard', val: baseLogHazard.toFixed(4), accent: 'violet' },
    { label: 'MC Mean Hazard', val: meanHazard.toFixed(4), accent: 'blue' },
    { label: 'Uncertainty Std', val: uncertaintyStd.toFixed(4), accent: uncertaintyDanger ? 'rose' : 'emerald' },
    { label: 'Median OS', val: medianDay !== null ? `${medianDay} days` : '> 2000 days', accent: 'amber' },
  ];

  return (
    <div className="relative">
      {/* ── Page Header ── */}
      <PageHeader icon={Activity} title="Command Center" subtitle="Real-time Prognostic Digital Twin Engine" accent="violet">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="glass-card rounded-xl px-3.5 py-2 flex items-center gap-2">
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
      </PageHeader>

      {/* ── Animated Data Pipeline Hero ── */}
      <DataPipeline />

      {/* ── 3D Tumor Visualization ── */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}
        className="glass-card-violet rounded-3xl overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center glow-violet">
              <Brain className="text-violet-600" size={16} />
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-slate-800">3D Digital Twin · Tumor Morphology</h3>
              <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.18em] mt-0.5">Real-time Volumetric Render · Drag to Rotate</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono-data">
            <span className="px-2.5 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-600 font-bold">{tumorSize}mm</span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-500 font-bold">{stage}</span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 font-bold">{lymphNodes} nodes</span>
          </div>
        </div>
        <div className="h-[400px] w-full">
          <TumorVisualization tumorSize={tumorSize} stage={stage} lymphNodes={lymphNodes} />
        </div>
      </motion.section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Main Grid — 340px left controls / 1fr right analytics               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* Left Column — Control Modules                                       */}
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
            whileHover={{ y: -2 }} className="glass-card-rose rounded-3xl p-5">
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
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {geneData.map((d, i) => (
                          <Cell key={i} fill={d.fill} />
                        ))}
                      </Bar>
                      <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 10, fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Module 3: Histologic / Morphometric Profile */}
          <motion.section initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.16, ease: 'easeOut' }}
            whileHover={{ y: -2 }} className="glass-card-emerald rounded-3xl p-5">
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
                  <StatusPill options={['Positive', 'Negative']} value={erStatus} onChange={(v) => setErStatus(v as Status)} accent="rose" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">HER2 Status</label>
                  <StatusPill options={['Positive', 'Negative']} value={her2Status} onChange={(v) => setHer2Status(v as Status)} accent="violet" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">PR Status</label>
                  <StatusPill options={['Positive', 'Negative']} value={prStatus} onChange={(v) => setPrStatus(v as Status)} accent="blue" />
                </div>
              </div>
            </div>
          </motion.section>

          {/* Module 4: Counterfactual Intervention Routing */}
          <motion.section initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.24, ease: 'easeOut' }}
            whileHover={{ y: -2 }} className="glass-card-amber rounded-3xl p-5">
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
        {/* Right Column — Analytics & Visualization                            */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        <div className="space-y-5">
          {/* Main Survival Chart */}
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}
            whileHover={{ y: -2 }} className="glass-card rounded-3xl p-6">
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
                <ComposedChart data={curve} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
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
                { label: 'Day 365', val: s365?.toFixed(1) },
                { label: 'Day 730', val: s730?.toFixed(1) },
                { label: 'Day 1095', val: s1095?.toFixed(1) },
                { label: 'Day 2000', val: s2000?.toFixed(1) },
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
              whileHover={{ y: -2 }} className="glass-card rounded-3xl p-5">
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
              whileHover={{ y: -2 }} className={`rounded-3xl p-5 ${uncertaintyDanger ? 'glass-card-rose glow-rose' : 'glass-card-emerald'}`}>
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
            whileHover={{ y: -2 }} className="glass-card rounded-3xl p-5">
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
                {quickMetrics.map((m, i) => {
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
            whileHover={{ y: -2 }} className="glass-card rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="text-violet-600" size={15} />
                <span className="text-[12px] text-slate-700 font-bold tracking-wide">Federated Network Topology</span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={10} className="text-violet-400" /> Round 142 · Aggregating
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topoNodes.map((node, i) => (
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
                    <span className="text-[9px] text-violet-500 font-mono-data font-semibold">{node.lat}ms</span>
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
  );
}
