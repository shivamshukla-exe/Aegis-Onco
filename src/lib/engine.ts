import type { PatientInput, MCHazard, CurvePoint, Intervention } from './types';
import { STAGE_MAP, CELLULARITY_MAP } from './types';

// Deterministic PRNG (mulberry32) for reproducible MC samples
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

export function computeLogHazard(input: PatientInput): number {
  const { age, tumorSize, lymphNodes, npi, stage, hasFullStaging,
    tp53, egfr, kras, myc, grade, cellularity, mutationCount,
    erStatus, her2Status, prStatus, intervention } = input;

  const stageValue = hasFullStaging ? STAGE_MAP[stage] : 0.0;

  let logHazard =
    (age / 100) * 1.2 +
    (tumorSize / 180) * 0.8 +
    (lymphNodes / 45) * 1.1 +
    (npi / 6.5) * 0.9 +
    (stageValue / 4) * 1.5;

  if (!hasFullStaging) logHazard += 0.3;

  logHazard += tp53 * 0.35 + egfr * 0.28 + kras * 0.18 + myc * 0.22;

  if (intervention === 'Targeted Kinase Inhibition') logHazard -= 0.9;
  else if (intervention === 'Double-Agent Cocktail') { logHazard -= 1.6; logHazard += 0.1; }

  logHazard += (grade - 2) * 0.3;
  logHazard += (CELLULARITY_MAP[cellularity] - 2) * 0.15;
  logHazard += (mutationCount / 30) * 0.4;

  if (erStatus === 'Positive') logHazard -= 0.25;
  if (her2Status === 'Positive') logHazard += 0.2;
  if (prStatus === 'Positive') logHazard -= 0.15;

  return logHazard;
}

export function runMCDropout(
  baseLogHazard: number,
  hasFullStaging: boolean,
  intervention: Intervention,
  numSamples = 20,
): MCHazard {
  const rng = mulberry32(Math.floor(baseLogHazard * 10000) + intervention.length);
  let baseUncertainty = hasFullStaging ? 0.25 : 0.65;
  if (intervention !== 'Standard Clinical Routine') baseUncertainty += 0.12;

  const samples: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    const dropoutNoise = gaussian(rng) * baseUncertainty;
    const featureNoise = gaussian(rng) * 0.08;
    samples.push(baseLogHazard + dropoutNoise + featureNoise);
  }

  const meanHazard = samples.reduce((a, b) => a + b, 0) / numSamples;
  const variance = samples.reduce((a, b) => a + (b - meanHazard) ** 2, 0) / numSamples;
  const uncertaintyStd = Math.sqrt(variance);

  return { meanHazard, uncertaintyStd, samples };
}

export function generateSurvivalCurve(meanHazard: number, uncertaintyStd: number): CurvePoint[] {
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

export interface EngineResult {
  baseLogHazard: number;
  meanHazard: number;
  uncertaintyStd: number;
  samples: number[];
  curve: CurvePoint[];
  medianDay: number | null;
  s365: number;
  s730: number;
  s1095: number;
  s2000: number;
  uncertaintyDanger: boolean;
}

export function runFullEngine(input: PatientInput): EngineResult {
  const baseLogHazard = computeLogHazard(input);
  const mc = runMCDropout(baseLogHazard, input.hasFullStaging, input.intervention, 20);
  const curve = generateSurvivalCurve(mc.meanHazard, mc.uncertaintyStd);

  const findSurv = (day: number) => curve.find((d) => d.day === day)?.survival ?? 0;
  const crossed = curve.find((d) => d.survival <= 50);
  const medianDay = crossed ? crossed.day : null;

  return {
    baseLogHazard,
    meanHazard: mc.meanHazard,
    uncertaintyStd: mc.uncertaintyStd,
    samples: mc.samples,
    curve,
    medianDay,
    s365: findSurv(365),
    s730: findSurv(730),
    s1095: findSurv(1095),
    s2000: curve[curve.length - 1]?.survival ?? 0,
    uncertaintyDanger: mc.uncertaintyStd > 0.8,
  };
}

// 16-gene panel (4 exposed + 12 background at mean z-score=0)
export const GENE_PANEL = [
  'TP53', 'EGFR', 'KRAS', 'MYC',
  'PIK3CA', 'PTEN', 'BRCA1', 'BRCA2',
  'CDH1', 'GATA3', 'MAP3K1', 'TBX3',
  'RUNX1', 'MLL3', 'NCOR1', 'STAG2',
];

// Synthetic federated learning node data
export const FEDERATED_NODES = [
  { name: 'Mayo Clinic', location: 'Rochester, MN', load: 87, lat: 12, samples: 12480, accuracy: 0.892, rounds: 142, status: 'active' as const },
  { name: 'Johns Hopkins', location: 'Baltimore, MD', load: 64, lat: 8, samples: 9340, accuracy: 0.901, rounds: 142, status: 'active' as const },
  { name: 'MD Anderson', location: 'Houston, TX', load: 92, lat: 15, samples: 15620, accuracy: 0.885, rounds: 142, status: 'active' as const },
  { name: 'Stanford Med', location: 'Palo Alto, CA', load: 45, lat: 22, samples: 7210, accuracy: 0.907, rounds: 141, status: 'syncing' as const },
  { name: 'Cleveland Clinic', location: 'Cleveland, OH', load: 73, lat: 11, samples: 10890, accuracy: 0.894, rounds: 142, status: 'active' as const },
  { name: 'Dana-Farber', location: 'Boston, MA', load: 58, lat: 9, samples: 8450, accuracy: 0.912, rounds: 140, status: 'syncing' as const },
];

// Synthetic training round history (for loss curve)
export const TRAINING_HISTORY = Array.from({ length: 50 }, (_, i) => ({
  round: i + 1,
  loss: 2.5 * Math.exp(-i / 12) + 0.15 + Math.random() * 0.05,
  valLoss: 2.6 * Math.exp(-i / 14) + 0.18 + Math.random() * 0.06,
  accuracy: 0.5 + 0.4 * (1 - Math.exp(-i / 10)) + Math.random() * 0.02,
}));

// Synthetic pathway interaction data
export const PATHWAY_DATA = [
  { pathway: 'PI3K/AKT', activation: 0.72, genes: 8 },
  { pathway: 'MAPK/ERK', activation: 0.58, genes: 6 },
  { pathway: 'p53 Signaling', activation: 0.34, genes: 5 },
  { pathway: 'Cell Cycle', activation: 0.81, genes: 7 },
  { pathway: 'Apoptosis', activation: 0.29, genes: 4 },
  { pathway: 'DNA Repair', activation: 0.45, genes: 6 },
  { pathway: 'EMT', activation: 0.63, genes: 5 },
  { pathway: 'HER2 Signaling', activation: 0.22, genes: 3 },
];

// Synthetic population distribution data
export const POPULATION_STATS = {
  byStage: [
    { stage: 'Stage 0', count: 145, color: '#10b981' },
    { stage: 'Stage I', count: 892, color: '#3b82f6' },
    { stage: 'Stage II', count: 1240, color: '#8b5cf6' },
    { stage: 'Stage III', count: 680, color: '#f59e0b' },
    { stage: 'Stage IV', count: 312, color: '#f43f5e' },
  ],
  byAgeGroup: [
    { range: '30-40', count: 180 },
    { range: '40-50', count: 420 },
    { range: '50-60', count: 680 },
    { range: '60-70', count: 890 },
    { range: '70-80', count: 640 },
    { range: '80+', count: 280 },
  ],
  byER: { positive: 1780, negative: 1290 },
  byHER2: { positive: 640, negative: 2430 },
  byPR: { positive: 1620, negative: 1450 },
  totalPatients: 3070,
  medianAge: 61,
  medianSurvival: 1840,
};
