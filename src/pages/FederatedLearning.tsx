import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Server, Wifi, Activity, Cpu, Gauge, Layers, Sparkles,
  TrendingUp, Zap, Lock, Radio, GitBranch,
} from 'lucide-react';
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, AreaChart, Area, ComposedChart,
} from 'recharts';
import {
  PageHeader, ModuleHeader, KpiCard, GlassCard, ACCENT,
} from '../components/ui';
import { FEDERATED_NODES, TRAINING_HISTORY } from '../lib/engine';

type ChartTooltipValue = number | string | ReadonlyArray<number | string> | undefined;
type ChartTooltipName = number | string | undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip style (emerald-tinted to match page accent)
// ─────────────────────────────────────────────────────────────────────────────
const tooltipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid rgba(16,185,129,0.18)',
  borderRadius: 12,
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 24px -6px rgba(16,185,129,0.18)',
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#334155',
  padding: '8px 12px',
};

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic gradient norm data (decreasing over rounds — training stabilizes)
// ─────────────────────────────────────────────────────────────────────────────
const GRADIENT_NORM = Array.from({ length: 50 }, (_, i) => ({
  round: i + 1,
  gradNorm: 3.2 * Math.exp(-i / 9) + 0.08 + Math.sin(i / 3) * 0.04,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic aggregation round timeline (last 10 rounds)
// ─────────────────────────────────────────────────────────────────────────────
const AGGREGATION_ROUNDS = Array.from({ length: 10 }, (_, i) => {
  const roundNum = 133 + i;
  const statuses = ['completed', 'completed', 'completed', 'completed', 'completed',
    'completed', 'completed', 'syncing', 'completed', 'active'];
  return {
    round: roundNum,
    status: statuses[i],
    duration: (8 + Math.random() * 14).toFixed(1),
    nodes: 5 + Math.floor(Math.random() * 2),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Derived model metrics
// ─────────────────────────────────────────────────────────────────────────────
const TOTAL_SAMPLES = FEDERATED_NODES.reduce((sum, n) => sum + n.samples, 0);
const GLOBAL_ACCURACY =
  FEDERATED_NODES.reduce((sum, n) => sum + n.accuracy, 0) / FEDERATED_NODES.length;
const CURRENT_ROUND = Math.max(...FEDERATED_NODES.map((n) => n.rounds));

// ─────────────────────────────────────────────────────────────────────────────
// Network topology — node positions around central server
// ─────────────────────────────────────────────────────────────────────────────
// Container is 100% wide × 360px tall. Server at center (50%, 50%).
// 6 nodes evenly distributed on an ellipse around the center.
const TOPOLOGY_H = 360; // px
const CENTER = { x: 50, y: 50 }; // percentage for x, percentage for y
const NODE_POSITIONS = [
  { x: 15, y: 18 },
  { x: 85, y: 18 },
  { x: 8, y: 50 },
  { x: 92, y: 50 },
  { x: 15, y: 82 },
  { x: 85, y: 82 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Pulsing status dot
// ─────────────────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: 'active' | 'syncing' }) {
  const color = status === 'active' ? 'bg-emerald-500' : 'bg-amber-500';
  const ringColor = status === 'active' ? 'bg-emerald-400' : 'bg-amber-400';
  return (
    <span className="relative flex h-2.5 w-2.5">
      <motion.span
        animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        className={`absolute inline-flex h-full w-full rounded-full ${ringColor}`}
      />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated load progress bar
// ─────────────────────────────────────────────────────────────────────────────
function LoadBar({ load, status }: { load: number; status: 'active' | 'syncing' }) {
  const barColor = status === 'active' ? 'from-emerald-400 to-teal-500' : 'from-amber-400 to-orange-500';
  return (
    <div className="h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${load}%` }}
        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
        className={`h-full rounded-full bg-gradient-to-r ${barColor} relative`}
      >
        <motion.div
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
        />
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Network topology connection line (SVG path with animated dash)
// ─────────────────────────────────────────────────────────────────────────────
function ConnectionLine({
  from, to, index, active,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  index: number;
  active: boolean;
}) {
  // Convert percentage coords to SVG viewBox coords (0-100 x, 0-100 y)
  const x1 = from.x;
  const y1 = (from.y / 100) * 100;
  const x2 = to.x;
  const y2 = (to.y / 100) * 100;
  const midX = (x1 + x2) / 2;
  // Slight curve via quadratic bezier
  const path = `M ${x1} ${y1} Q ${midX} ${y1} ${x2} ${y2}`;

  return (
    <motion.path
      d={path}
      fill="none"
      stroke={active ? 'rgba(16,185,129,0.5)' : 'rgba(245,158,11,0.5)'}
      strokeWidth={0.4}
      strokeDasharray="2 2"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 1.2, delay: 0.3 + index * 0.1, ease: 'easeInOut' }}
    />
  );
}

// Animated data flow particle along the connection
function DataFlowParticle({
  from, to, index, active,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  index: number;
  active: boolean;
}) {
  const x1 = from.x;
  const y1 = (from.y / 100) * 100;
  const x2 = to.x;
  const y2 = (to.y / 100) * 100;
  const midX = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} Q ${midX} ${y1} ${x2} ${y2}`;

  return (
    <motion.circle
      r={0.8}
      fill={active ? '#10b981' : '#f59e0b'}
      initial={{ opacity: 0 }}
      animate={{
        offsetDistance: ['0%', '100%'],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        delay: 1 + index * 0.15,
        ease: 'easeInOut',
      }}
      style={{
        offsetPath: `path('${path}')`,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function FederatedLearning() {
  // Format training history for the composed chart
  const chartData = useMemo(() => TRAINING_HISTORY, []);

  const gradientData = useMemo(() => GRADIENT_NORM, []);

  return (
    <div className="space-y-6">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <PageHeader
        icon={Server}
        title="Federated Learning Monitor"
        subtitle="Multi-Center Model Aggregation · Real-time Training Telemetry"
        accent="emerald"
      >
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass-card-emerald">
          <Radio className="text-emerald-500" size={14} />
          <span className="text-[10px] font-mono-data text-emerald-600 font-bold uppercase tracking-wider">
            Aggregation Live
          </span>
          <span className="relative flex h-2 w-2">
            <motion.span
              animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inline-flex h-full w-full rounded-full bg-emerald-400"
            />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        </div>
      </PageHeader>

      {/* ── Row 1: Model Metrics KPIs ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={Gauge}
          label="Global Accuracy"
          value={`${(GLOBAL_ACCURACY * 100).toFixed(1)}%`}
          sub="weighted across 6 nodes"
          accent="emerald"
        />
        <KpiCard
          icon={Layers}
          label="Total Samples"
          value={TOTAL_SAMPLES.toLocaleString()}
          sub="distributed training data"
          accent="violet"
        />
        <KpiCard
          icon={GitBranch}
          label="Current Round"
          value={`R${CURRENT_ROUND}`}
          sub="federated aggregation cycle"
          accent="amber"
        />
        <KpiCard
          icon={Lock}
          label="Privacy Budget"
          value="ε = 4.2"
          sub="differential privacy · ε-DP"
          accent="rose"
        />
      </div>

      {/* ── Row 2: Training Loss Chart (dual-axis) ────────────────────────── */}
      <GlassCard accent="emerald" className="p-6">
        <ModuleHeader
          icon={TrendingUp}
          title="Training Telemetry"
          subtitle="Loss Curves · Accuracy · 50 Rounds"
          accent="emerald"
        />
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis
                dataKey="round"
                tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#94a3b8' }}
                axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                tickLine={false}
                label={{ value: 'Round', position: 'insideBottom', offset: -2, style: { fontSize: 9, fill: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" } }}
              />
              <YAxis
                yAxisId="loss"
                domain={[0, 3]}
                tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#94a3b8' }}
                axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                tickLine={false}
                label={{ value: 'Loss', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 9, fill: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" } }}
              />
              <YAxis
                yAxisId="acc"
                orientation="right"
                domain={[0, 1]}
                tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#10b981' }}
                axisLine={{ stroke: 'rgba(16,185,129,0.25)' }}
                tickLine={false}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                label={{ value: 'Accuracy', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 9, fill: '#10b981', fontFamily: "'JetBrains Mono', monospace" } }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: ChartTooltipValue, name: ChartTooltipName) => {
                  if (name === 'Accuracy') return [`${(Number(value) * 100).toFixed(2)}%`, name];
                  return [Number(value).toFixed(4), name];
                }}
              />
              <ReferenceLine y={2.5} yAxisId="loss" stroke="rgba(139,92,246,0.2)" strokeDasharray="4 4" />
              <Line
                yAxisId="loss"
                type="monotone"
                dataKey="loss"
                name="Train Loss"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                dot={false}
                animationDuration={900}
              />
              <Line
                yAxisId="loss"
                type="monotone"
                dataKey="valLoss"
                name="Val Loss"
                stroke="#f43f5e"
                strokeWidth={2.5}
                dot={false}
                strokeDasharray="5 3"
                animationDuration={900}
              />
              <Area
                yAxisId="acc"
                type="monotone"
                dataKey="accuracy"
                name="Accuracy"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#accGrad)"
                animationDuration={900}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 rounded-full bg-violet-500" />
            <span className="text-[10px] font-mono-data text-slate-500">Training Loss</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 rounded-full bg-rose-500" style={{ borderTop: '2px dashed #f43f5e' }} />
            <span className="text-[10px] font-mono-data text-slate-500">Validation Loss</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500" />
            <span className="text-[10px] font-mono-data text-slate-500">Accuracy</span>
          </div>
        </div>
      </GlassCard>

      {/* ── Row 3: Network Topology + Gradient Norm ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Network Topology Visualization */}
        <GlassCard accent="violet" className="p-6">
          <ModuleHeader
            icon={Wifi}
            title="Network Topology"
            subtitle="Central Aggregator · 6 Edge Nodes"
            accent="violet"
          />
          <div className="relative w-full" style={{ height: TOPOLOGY_H }}>
            {/* SVG layer for connection lines */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {FEDERATED_NODES.map((node, i) => {
                const pos = NODE_POSITIONS[i];
                const centerPos = { x: CENTER.x, y: (CENTER.y / 100) * 100 };
                const nodePos = { x: pos.x, y: (pos.y / 100) * 100 };
                return (
                  <ConnectionLine
                    key={`line-${i}`}
                    from={centerPos}
                    to={nodePos}
                    index={i}
                    active={node.status === 'active'}
                  />
                );
              })}
              {/* Data flow particles */}
              {FEDERATED_NODES.map((node, i) => {
                const pos = NODE_POSITIONS[i];
                const centerPos = { x: CENTER.x, y: CENTER.y };
                const nodePos = { x: pos.x, y: pos.y };
                return (
                  <DataFlowParticle
                    key={`particle-${i}`}
                    from={centerPos}
                    to={nodePos}
                    index={i}
                    active={node.status === 'active'}
                  />
                );
              })}
            </svg>

            {/* Central aggregation server */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${CENTER.x}%`, top: `${CENTER.y}%` }}
            >
              <div className="relative">
                {/* Pulsing rings */}
                <motion.div
                  animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                  className="absolute inset-0 rounded-full bg-violet-500/30"
                  style={{ width: 64, height: 64, left: -32, top: -32 }}
                />
                <motion.div
                  animate={{ scale: [1, 2.4], opacity: [0.25, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
                  className="absolute inset-0 rounded-full bg-violet-500/20"
                  style={{ width: 64, height: 64, left: -32, top: -32 }}
                />
                {/* Server circle */}
                <div
                  className="relative w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 shadow-[0_0_30px_rgba(139,92,246,0.5)]"
                >
                  <Server className="text-white" size={22} />
                </div>
                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <span className="text-[10px] font-mono-data font-bold text-violet-600">Aggregator</span>
                </div>
              </div>
            </motion.div>

            {/* Node circles */}
            {FEDERATED_NODES.map((node, i) => {
              const pos = NODE_POSITIONS[i];
              const isActive = node.status === 'active';
              return (
                <motion.div
                  key={`topo-${node.name}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.3 + i * 0.08 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div className="relative flex flex-col items-center">
                    <div
                      className={`relative w-11 h-11 rounded-full flex items-center justify-center border-2 ${
                        isActive
                          ? 'bg-emerald-50 border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.35)]'
                          : 'bg-amber-50 border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.35)]'
                      }`}
                    >
                      <Cpu
                        size={16}
                        className={isActive ? 'text-emerald-600' : 'text-amber-600'}
                      />
                      {/* status dot on node */}
                      <div className="absolute -top-0.5 -right-0.5">
                        <StatusDot status={node.status} />
                      </div>
                    </div>
                    <div className="mt-1.5 whitespace-nowrap">
                      <span className="text-[8.5px] font-mono-data font-bold text-slate-600">
                        {node.name.split(' ')[0]}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
          {/* Topology legend */}
          <div className="flex items-center justify-center gap-5 mt-2 pt-3 border-t border-slate-200/50">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-violet-500 to-purple-600" />
              <span className="text-[9px] font-mono-data text-slate-500">Central Server</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-50 border border-emerald-400" />
              <span className="text-[9px] font-mono-data text-slate-500">Active Node</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-50 border border-amber-400" />
              <span className="text-[9px] font-mono-data text-slate-500">Syncing Node</span>
            </div>
          </div>
        </GlassCard>

        {/* Gradient Norm Chart */}
        <GlassCard accent="emerald" className="p-6">
          <ModuleHeader
            icon={Activity}
            title="Gradient Norm Decay"
            subtitle="Optimization Convergence · 50 Rounds"
            accent="emerald"
          />
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={gradientData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="gradNormFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis
                  dataKey="round"
                  tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#94a3b8' }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                  tickLine={false}
                  label={{ value: 'Round', position: 'insideBottom', offset: -2, style: { fontSize: 9, fill: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" } }}
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#94a3b8' }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
                  tickLine={false}
                  label={{ value: '‖∇‖', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 9, fill: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" } }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: ChartTooltipValue) => [Number(v).toFixed(4), 'Gradient Norm']}
                />
                <ReferenceLine y={0.1} stroke="rgba(16,185,129,0.3)" strokeDasharray="4 4" label={{ value: 'converged', position: 'right', style: { fontSize: 8, fill: '#10b981', fontFamily: "'JetBrains Mono', monospace" } }} />
                <Area
                  type="monotone"
                  dataKey="gradNorm"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#gradNormFill)"
                  animationDuration={900}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-2 mt-2 px-1">
            <Sparkles className="text-emerald-500" size={11} />
            <p className="text-[9px] text-slate-400 font-mono-data">
              Gradient norm decreases exponentially — model approaching optimal convergence.
            </p>
          </div>
        </GlassCard>
      </div>

      {/* ── Row 4: Node Status Grid ──────────────────────────────────────── */}
      <div>
        <ModuleHeader
          icon={Cpu}
          title="Node Status Grid"
          subtitle="6 Federated Edge Nodes · Live Telemetry"
          accent="emerald"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEDERATED_NODES.map((node, i) => {
            const isActive = node.status === 'active';
            const accent = isActive ? 'emerald' : 'amber';
            const a = ACCENT[accent];
            return (
              <motion.div
                key={node.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 300, damping: 24 }}
                whileHover={{ y: -4 }}
                className={`relative rounded-2xl p-5 overflow-hidden glass-card-${accent}`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl ${a.bgSoft} flex items-center justify-center`}>
                      <Cpu size={16} className={a.text} />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-bold tracking-tight text-slate-800">{node.name}</h4>
                      <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider mt-0.5">
                        {node.location}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={node.status} />
                    <span className={`text-[9px] font-mono-data font-bold uppercase tracking-wider ${a.text}`}>
                      {node.status}
                    </span>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="rounded-lg bg-slate-50/80 px-2.5 py-2 border border-slate-200/40">
                    <div className="text-[8px] text-slate-400 font-mono-data uppercase tracking-wider mb-0.5">Samples</div>
                    <div className="text-[14px] font-mono-data font-bold text-slate-700">
                      {node.samples.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50/80 px-2.5 py-2 border border-slate-200/40">
                    <div className="text-[8px] text-slate-400 font-mono-data uppercase tracking-wider mb-0.5">Accuracy</div>
                    <div className={`text-[14px] font-mono-data font-bold ${a.text}`}>
                      {(node.accuracy * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50/80 px-2.5 py-2 border border-slate-200/40">
                    <div className="text-[8px] text-slate-400 font-mono-data uppercase tracking-wider mb-0.5">Latency</div>
                    <div className="text-[14px] font-mono-data font-bold text-slate-700 flex items-center gap-1">
                      <Wifi size={10} className="text-slate-400" />
                      {node.lat}ms
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50/80 px-2.5 py-2 border border-slate-200/40">
                    <div className="text-[8px] text-slate-400 font-mono-data uppercase tracking-wider mb-0.5">Rounds</div>
                    <div className="text-[14px] font-mono-data font-bold text-slate-700">
                      R{node.rounds}
                    </div>
                  </div>
                </div>

                {/* Load bar */}
                <div>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-[9px] text-slate-400 font-mono-data uppercase tracking-wider">Load</span>
                    <span className={`text-[11px] font-mono-data font-bold ${a.text}`}>{node.load}%</span>
                  </div>
                  <LoadBar load={node.load} status={node.status} />
                </div>

                {/* Decorative glow */}
                <div className={`absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${a.gradient} opacity-[0.06] blur-2xl`} />
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Row 5: Aggregation Round Timeline ────────────────────────────── */}
      <GlassCard accent="violet" className="p-6">
        <ModuleHeader
          icon={GitBranch}
          title="Aggregation Round Timeline"
          subtitle="Last 10 Federated Cycles · Duration & Participation"
          accent="violet"
        />
        <div className="relative overflow-x-auto pb-2">
          {/* Timeline base line */}
          <div className="relative flex items-start justify-between min-w-[640px] gap-2 pt-6">
            {/* Horizontal connecting line */}
            <div className="absolute top-[34px] left-0 right-0 h-0.5 bg-gradient-to-r from-violet-200 via-violet-300 to-violet-200" />

            {AGGREGATION_ROUNDS.map((round, i) => {
              const isCompleted = round.status === 'completed';
              const isSyncing = round.status === 'syncing';
              const isActive = round.status === 'active';
              const dotColor = isCompleted
                ? 'bg-emerald-500 border-emerald-400'
                : isSyncing
                  ? 'bg-amber-500 border-amber-400'
                  : 'bg-violet-500 border-violet-400';
              const accentText = isCompleted
                ? 'text-emerald-600'
                : isSyncing
                  ? 'text-amber-600'
                  : 'text-violet-600';
              return (
                <motion.div
                  key={round.round}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 22 }}
                  className="relative flex-1 flex flex-col items-center"
                >
                  {/* Round label above */}
                  <div className="text-[10px] font-mono-data font-bold text-slate-500 mb-2">
                    R{round.round}
                  </div>

                  {/* Timeline dot */}
                  <div className="relative z-10">
                    {isActive && (
                      <motion.div
                        animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                        className="absolute inset-0 rounded-full bg-violet-400"
                        style={{ width: 18, height: 18, left: -1, top: -1 }}
                      />
                    )}
                    {isSyncing && (
                      <motion.div
                        animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                        className="absolute inset-0 rounded-full bg-amber-400"
                        style={{ width: 18, height: 18, left: -1, top: -1 }}
                      />
                    )}
                    <div
                      className={`relative w-4 h-4 rounded-full border-2 ${dotColor} bg-white shadow-sm`}
                    />
                  </div>

                  {/* Detail card below */}
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <div className={`px-2.5 py-1 rounded-lg ${isCompleted ? 'bg-emerald-50' : isSyncing ? 'bg-amber-50' : 'bg-violet-50'} border ${isCompleted ? 'border-emerald-200' : isSyncing ? 'border-amber-200' : 'border-violet-200'}`}>
                      <span className={`text-[9px] font-mono-data font-bold uppercase tracking-wider ${accentText}`}>
                        {round.status}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono-data text-slate-500 mt-1">
                      {round.duration}s
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono-data">
                      <Cpu size={9} />
                      {round.nodes} nodes
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Timeline legend */}
        <div className="flex items-center justify-center gap-5 mt-4 pt-3 border-t border-slate-200/50">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white border-2 border-emerald-400" />
            <span className="text-[9px] font-mono-data text-slate-500">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white border-2 border-amber-400" />
            <span className="text-[9px] font-mono-data text-slate-500">Syncing</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white border-2 border-violet-400" />
            <span className="text-[9px] font-mono-data text-slate-500">Active</span>
          </div>
        </div>
      </GlassCard>

      {/* ── Footer summary strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Zap, label: 'Avg Latency', value: `${Math.round(FEDERATED_NODES.reduce((s, n) => s + n.lat, 0) / FEDERATED_NODES.length)}ms`, sub: 'network round-trip', accent: 'violet' as const },
          { icon: Cpu, label: 'Active Nodes', value: `${FEDERATED_NODES.filter((n) => n.status === 'active').length}/6`, sub: 'currently training', accent: 'emerald' as const },
          { icon: Activity, label: 'Avg Load', value: `${Math.round(FEDERATED_NODES.reduce((s, n) => s + n.load, 0) / FEDERATED_NODES.length)}%`, sub: 'compute utilization', accent: 'amber' as const },
          { icon: Sparkles, label: 'Convergence', value: '94.2%', sub: 'loss reduction vs R1', accent: 'rose' as const },
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
