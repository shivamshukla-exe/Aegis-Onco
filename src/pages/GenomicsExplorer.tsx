import { useState, useMemo, Fragment } from 'react';
import { motion } from 'framer-motion';
import {
  Dna, Microscope, GitBranch, AlertTriangle, Activity, Layers, Scan, FlaskConical,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell,
} from 'recharts';
import {
  PageHeader, ModuleHeader, SliderRow, GlassCard, ACCENT,
} from '../components/ui';
import { GENE_PANEL, PATHWAY_DATA } from '../lib/engine';

// ─────────────────────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────────────────────

// Map a z-score in [-3, 3] to a green → yellow → red color (low/protective → high/risky).
function zScoreColor(z: number): string {
  const clamped = Math.max(-3, Math.min(3, z));
  const t = (clamped + 3) / 6; // 0 (green) .. 1 (red)
  // green #22c55e (34,197,94) → yellow #eab308 (234,179,8) → red #ef4444 (239,68,68)
  let r: number, g: number, b: number;
  if (t <= 0.5) {
    const k = t / 0.5;
    r = Math.round(34 + (234 - 34) * k);
    g = Math.round(197 + (179 - 197) * k);
    b = Math.round(94 + (8 - 94) * k);
  } else {
    const k = (t - 0.5) / 0.5;
    r = Math.round(234 + (239 - 234) * k);
    g = Math.round(179 + (68 - 179) * k);
    b = Math.round(8 + (68 - 8) * k);
  }
  return `rgb(${r}, ${g}, ${b})`;
}

// Map a correlation coefficient in [-1, 1] to a blue → white → red color.
function correlationColor(c: number): string {
  const t = (c + 1) / 2; // 0 (blue) .. 1 (red)
  // blue #3b82f6 (59,130,246) → neutral #f8fafc (248,250,252) → red #ef4444 (239,68,68)
  let r: number, g: number, b: number;
  if (t <= 0.5) {
    const k = t / 0.5;
    r = Math.round(59 + (248 - 59) * k);
    g = Math.round(130 + (250 - 130) * k);
    b = Math.round(246 + (252 - 246) * k);
  } else {
    const k = (t - 0.5) / 0.5;
    r = Math.round(248 + (239 - 248) * k);
    g = Math.round(250 + (68 - 250) * k);
    b = Math.round(252 + (68 - 252) * k);
  }
  return `rgb(${r}, ${g}, ${b})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static synthetic datasets
// ─────────────────────────────────────────────────────────────────────────────

// 4 exposed genes used for sliders + correlation matrix
const EXPOSED_GENES = ['TP53', 'EGFR', 'KRAS', 'MYC'] as const;

// Synthetic 4×4 correlation matrix between exposed genes (symmetric, diagonal = 1)
const CORRELATION_MATRIX: number[][] = [
  [1.00, 0.62, -0.41, 0.55], // TP53
  [0.62, 1.00, -0.28, 0.71], // EGFR
  [-0.41, -0.28, 1.00, -0.33], // KRAS
  [0.55, 0.71, -0.33, 1.00], // MYC
];

// Synthetic mutation burden distribution (histogram bins across a population)
const MUTATION_BURDEN = [
  { bin: '0-2', count: 412, range: '0-2' },
  { bin: '3-5', count: 856, range: '3-5' },
  { bin: '6-8', count: 1024, range: '6-8' },
  { bin: '9-11', count: 743, range: '9-11' },
  { bin: '12-14', count: 521, range: '12-14' },
  { bin: '15-17', count: 318, range: '15-17' },
  { bin: '18-20', count: 187, range: '18-20' },
  { bin: '21-23', count: 94, range: '21-23' },
  { bin: '24+', count: 41, range: '24+' },
];

// Pathway bar colors (rose / amber / violet palette)
const PATHWAY_COLORS = [
  '#f43f5e', '#f59e0b', '#8b5cf6', '#fb7185',
  '#fbbf24', '#a78bfa', '#f43f5e', '#f59e0b',
];

// Mutation burden bar colors (gradient from emerald to rose by burden)
const BURDEN_COLORS = [
  '#10b981', '#22c55e', '#84cc16', '#eab308',
  '#f59e0b', '#f97316', '#ef4444', '#f43f5e', '#dc2626',
];

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip style (shared)
// ─────────────────────────────────────────────────────────────────────────────
const tooltipStyle = {
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid rgba(244,63,94,0.18)',
  borderRadius: 12,
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 24px -6px rgba(244,63,94,0.18)',
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#334155',
  padding: '8px 12px',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function GenomicsExplorer() {
  // Z-score state for the 4 exposed genes (sliders, -3 to 3)
  const [tp53, setTp53] = useState(1.8);
  const [egfr, setEgfr] = useState(2.2);
  const [kras, setKras] = useState(-0.6);
  const [myc, setMyc] = useState(1.4);

  // Build the full 16-gene z-score vector (first 4 from sliders, rest at 0)
  const geneScores = useMemo(() => {
    const exposed: Record<string, number> = { TP53: tp53, EGFR: egfr, KRAS: kras, MYC: myc };
    return GENE_PANEL.map((g) => exposed[g] ?? 0);
  }, [tp53, egfr, kras, myc]);

  // Derive radar scores from the live gene z-scores so the radar reacts to sliders
  const radarData = useMemo(() => {
    const proliferation = Math.min(100, Math.max(0, 50 + (myc + egfr) * 9));
    const invasion = Math.min(100, Math.max(0, 45 + (tp53 * -4) + (kras * 6)));
    const mutationBurden = Math.min(100, Math.max(0, 55 + (tp53 + egfr + kras + myc) * 6));
    const pathwayActivation = Math.min(100, Math.max(0, 50 + (egfr + kras) * 8));
    const hormoneReceptor = 44; // synthetic fixed
    const immuneResponse = Math.min(100, Math.max(0, 58 + (tp53 * -3)));
    return [
      { dimension: 'Proliferation', score: Math.round(proliferation), fullMark: 100 },
      { dimension: 'Invasion', score: Math.round(invasion), fullMark: 100 },
      { dimension: 'Mutation Burden', score: Math.round(mutationBurden), fullMark: 100 },
      { dimension: 'Pathway Activation', score: Math.round(pathwayActivation), fullMark: 100 },
      { dimension: 'Hormone Receptor', score: hormoneReceptor, fullMark: 100 },
      { dimension: 'Immune Response', score: Math.round(immuneResponse), fullMark: 100 },
    ];
  }, [tp53, egfr, kras, myc]);

  const fmt = (v: number) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

  return (
    <div className="space-y-6">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <PageHeader
        icon={Dna}
        title="Genomics Explorer"
        subtitle="16-Gene Panel · Pathway Analysis · Mutation Landscape"
        accent="rose"
      >
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass-card-rose">
          <Scan className="text-rose-500" size={14} />
          <span className="text-[10px] font-mono-data text-rose-600 font-bold uppercase tracking-wider">
            Panel Scanned
          </span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
        </div>
      </PageHeader>

      {/* ── Row 1: Heatmap + Sliders ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Gene Expression Heatmap */}
        <GlassCard accent="rose" className="xl:col-span-2 p-6">
          <ModuleHeader
            icon={Layers}
            title="Gene Expression Heatmap"
            subtitle="16-Gene Z-Score Landscape · 4×4 Grid"
            accent="rose"
          />

          {/* 4×4 CSS grid heatmap */}
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {GENE_PANEL.map((gene, i) => {
              const z = geneScores[i];
              const bg = zScoreColor(z);
              const isExposed = i < 4;
              return (
                <motion.div
                  key={gene}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.025, type: 'spring', stiffness: 380, damping: 22 }}
                  whileHover={{ scale: 1.06, zIndex: 10 }}
                  className="relative rounded-xl p-2.5 aspect-square flex flex-col justify-between border border-white/40 shadow-sm overflow-hidden"
                  style={{ background: bg }}
                >
                  {/* sheen */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent pointer-events-none" />
                  <div className="relative flex items-center justify-between">
                    <span className={`text-[9px] font-mono-data font-bold tracking-tight ${Math.abs(z) > 1.5 ? 'text-white' : 'text-slate-700/80'}`}>
                      {gene}
                    </span>
                    {isExposed && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-sm" />
                    )}
                  </div>
                  <div className={`relative font-mono-data text-[13px] font-extrabold ${Math.abs(z) > 1.5 ? 'text-white' : 'text-slate-800'}`}>
                    {fmt(z)}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Color legend: green → yellow → red gradient bar */}
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider">Protective</span>
            <div
              className="flex-1 h-2.5 rounded-full border border-white/40 shadow-inner"
              style={{ background: 'linear-gradient(to right, rgb(34,197,94), rgb(234,179,8), rgb(239,68,68))' }}
            />
            <span className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider">Risky</span>
            <div className="flex items-center gap-1 ml-2 px-2 py-1 rounded-lg bg-slate-100/70 border border-slate-200/60">
              <span className="text-[9px] text-slate-400 font-mono-data">z</span>
              <span className="text-[9px] font-mono-data font-bold text-slate-600">-3 → +3</span>
            </div>
          </div>
        </GlassCard>

        {/* Slider controls for the 4 exposed genes */}
        <GlassCard accent="rose" className="p-6">
          <ModuleHeader
            icon={FlaskConical}
            title="Expression Controls"
            subtitle="Tune 4 Key Drivers · Z-Score"
            accent="rose"
          />
          <div className="space-y-5">
            <SliderRow label="TP53" value={tp53} display={fmt(tp53)} min={-3} max={3} step={0.1} onChange={setTp53} accent="rose" />
            <SliderRow label="EGFR" value={egfr} display={fmt(egfr)} min={-3} max={3} step={0.1} onChange={setEgfr} accent="rose" />
            <SliderRow label="KRAS" value={kras} display={fmt(kras)} min={-3} max={3} step={0.1} onChange={setKras} accent="rose" />
            <SliderRow label="MYC" value={myc} display={fmt(myc)} min={-3} max={3} step={0.1} onChange={setMyc} accent="rose" />
          </div>
          <div className="mt-5 pt-4 border-t border-slate-200/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={12} />
              <p className="text-[9px] text-slate-400 font-mono-data leading-relaxed">
                Remaining 12 genes held at mean (z=0). Adjusting drivers updates the heatmap, correlation readouts, and risk radar in real time.
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* ── Row 2: Pathway Activation + Mutation Burden ────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Pathway Activation Chart */}
        <GlassCard accent="rose" className="p-6">
          <ModuleHeader
            icon={GitBranch}
            title="Pathway Activation Chart"
            subtitle="8 Signaling Pathways · Activation Score 0–1"
            accent="rose"
          />
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={PATHWAY_DATA}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#94a3b8' }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="pathway"
                  tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#64748b' }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                  tickLine={false}
                  width={96}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'rgba(244,63,94,0.06)' }}
                  formatter={(v) => [Number(v).toFixed(2), 'Activation']}
                />
                <Bar dataKey="activation" radius={[0, 6, 6, 0]} barSize={22} animationDuration={700}>
                  {PATHWAY_DATA.map((_, i) => (
                    <Cell key={i} fill={PATHWAY_COLORS[i % PATHWAY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Mutation Burden Distribution */}
        <GlassCard accent="amber" className="p-6">
          <ModuleHeader
            icon={Microscope}
            title="Mutation Burden Distribution"
            subtitle="Synthetic Population · Count per Bin"
            accent="amber"
          />
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={MUTATION_BURDEN}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis
                  dataKey="bin"
                  tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#94a3b8' }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#94a3b8' }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'rgba(245,158,11,0.06)' }}
                  formatter={(v) => [`${v} patients`, 'Count']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={28} animationDuration={700}>
                  {MUTATION_BURDEN.map((_, i) => (
                    <Cell key={i} fill={BURDEN_COLORS[i % BURDEN_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* ── Row 3: Correlation Matrix + Risk Radar ────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Gene Correlation Matrix */}
        <GlassCard accent="blue" className="p-6">
          <ModuleHeader
            icon={GitBranch}
            title="Gene Correlation Matrix"
            subtitle="4 Key Drivers · Pearson Coefficient"
            accent="blue"
          />
          <div className="flex flex-col items-center">
            {/* Matrix grid with header row/column */}
            <div className="inline-grid gap-1.5" style={{ gridTemplateColumns: `48px repeat(4, minmax(0, 1fr))` }}>
              {/* Top-left empty corner */}
              <div />
              {/* Column headers */}
              {EXPOSED_GENES.map((g) => (
                <div key={`col-${g}`} className="flex items-center justify-center pb-1">
                  <span className="text-[10px] font-mono-data font-bold text-slate-500 tracking-tight">{g}</span>
                </div>
              ))}
              {/* Rows */}
              {EXPOSED_GENES.map((rowGene, r) => (
                <Fragment key={`row-${rowGene}`}>
                  {/* Row header */}
                  <div className="flex items-center justify-center pr-1">
                    <span className="text-[10px] font-mono-data font-bold text-slate-500 tracking-tight">{rowGene}</span>
                  </div>
                  {/* Cells */}
                  {EXPOSED_GENES.map((colGene, c) => {
                    const corr = CORRELATION_MATRIX[r][c];
                    const bg = correlationColor(corr);
                    const isDiagonal = r === c;
                    const textColor = Math.abs(corr) > 0.5 ? 'text-white' : 'text-slate-700';
                    return (
                      <motion.div
                        key={`cell-${rowGene}-${colGene}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: (r * 4 + c) * 0.03, type: 'spring', stiffness: 380, damping: 22 }}
                        whileHover={{ scale: 1.08, zIndex: 10 }}
                        className="relative rounded-xl aspect-square flex items-center justify-center border border-white/40 shadow-sm overflow-hidden"
                        style={{ background: bg }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
                        {isDiagonal && (
                          <div className="absolute inset-0 ring-2 ring-white/60 rounded-xl pointer-events-none" />
                        )}
                        <span className={`relative font-mono-data text-[12px] font-extrabold ${textColor}`}>
                          {corr.toFixed(2)}
                        </span>
                      </motion.div>
                    );
                  })}
                </Fragment>
              ))}
            </div>

            {/* Correlation color legend */}
            <div className="flex items-center gap-3 mt-5 w-full max-w-[280px]">
              <span className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider">Neg</span>
              <div
                className="flex-1 h-2.5 rounded-full border border-white/40 shadow-inner"
                style={{ background: 'linear-gradient(to right, rgb(59,130,246), rgb(248,250,252), rgb(239,68,68))' }}
              />
              <span className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider">Pos</span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Activity className="text-blue-500" size={11} />
              <p className="text-[9px] text-slate-400 font-mono-data">
                Diagonal = self-correlation (1.00). Blue = anti-correlated, red = co-activated.
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Risk Stratification Radar */}
        <GlassCard accent="rose" className="p-6">
          <ModuleHeader
            icon={AlertTriangle}
            title="Risk Stratification Radar"
            subtitle="6 Dimensions · Composite Risk Score"
            accent="rose"
          />
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="rgba(148,163,184,0.25)" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", fill: '#64748b' }}
                />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", fill: '#cbd5e1' }}
                  axisLine={false}
                  tickCount={5}
                />
                <Radar
                  name="Risk Score"
                  dataKey="score"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fill="#f43f5e"
                  fillOpacity={0.28}
                  animationDuration={700}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${v} / 100`, 'Risk']}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-2 mt-1 px-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            <p className="text-[9px] text-slate-400 font-mono-data">
              Radar responds live to expression controls — higher driver z-scores inflate risk dimensions.
            </p>
          </div>
        </GlassCard>
      </div>

      {/* ── Footer summary strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Dna, label: 'Genes Profiled', value: '16', sub: '4 drivers + 12 background', accent: 'rose' as const },
          { icon: GitBranch, label: 'Pathways', value: '8', sub: 'PI3K · MAPK · p53 · …', accent: 'amber' as const },
          { icon: Microscope, label: 'Pop. Samples', value: '4,196', sub: 'synthetic cohort', accent: 'blue' as const },
          { icon: AlertTriangle, label: 'High-Risk Genes', value: String(geneScores.filter((z) => z > 1.5).length), sub: 'z-score > +1.5', accent: 'rose' as const },
        ].map((s, i) => {
          const a = ACCENT[s.accent];
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              whileHover={{ y: -3 }}
              className={`relative rounded-2xl p-4 overflow-hidden glass-card-${s.accent}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg ${a.bgSoft} flex items-center justify-center`}>
                  <s.icon size={14} className={a.text} />
                </div>
                <span className="text-[9px] uppercase tracking-[0.16em] font-mono-data font-bold text-slate-400">{s.label}</span>
              </div>
              <div className={`font-mono-data text-[22px] font-extrabold tracking-tight ${a.text}`}>{s.value}</div>
              <div className="text-[9px] text-slate-400 mt-0.5 font-mono-data">{s.sub}</div>
              <div className={`absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${a.gradient} opacity-[0.06] blur-2xl`} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
