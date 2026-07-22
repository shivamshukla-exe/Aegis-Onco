import type { PatientInput, SeededVariation, CurvePoint, Intervention } from './types';
import { STAGE_MAP, CELLULARITY_MAP } from './types';

// Deterministic PRNG (mulberry32) for reproducible research-demo calculations.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const MODEL_METADATA = {
  status: 'research-demo',
  clinicalUseAllowed: false,
  intendedUse: 'Research and user-interface demonstration only; not for clinical decision-making.',
  implementation: 'Deterministic browser-side UI surrogate with arbitrary scenario offsets; it does not load notebook weights or estimate treatment effects.',
  dataset: {
    name: 'METABRIC record-count reference (rows are not loaded by this UI)',
    totalPatients: 1904,
    partitions: [
      { name: 'Synthetic UI Partition 1', patients: 318 },
      { name: 'Synthetic UI Partition 2', patients: 317 },
      { name: 'Synthetic UI Partition 3', patients: 317 },
      { name: 'Synthetic UI Partition 4', patients: 318 },
      { name: 'Synthetic UI Partition 5', patients: 317 },
      { name: 'Synthetic UI Partition 6', patients: 317 },
    ],
  },
  metricProvenance: {
    sampleCounts: 'Illustrative equal-sized UI partitions summing to the 1,904-row METABRIC reference count; not actual cohort counts.',
    predictions: 'Hand-authored deterministic browser-surrogate outputs.',
    federatedOperations: 'Synthetic UI telemetry; no notebook artifacts or live institutions are connected.',
  },
} as const;

export function isResearchDemoModel(
  metadata: { status: string } = MODEL_METADATA,
): boolean {
  return metadata.status === 'research-demo';
}

export function computeBaseSurrogateScore(input: PatientInput): number {
  const {
    age, tumorSize, lymphNodes, npi, stage, hasFullStaging,
    tp53, egfr, kras, myc, grade, cellularity, mutationCount,
    erStatus, her2Status, prStatus, intervention,
  } = input;

  const stageValue = hasFullStaging ? STAGE_MAP[stage] : 0;
  let score =
    (age / 100) * 1.2
    + (tumorSize / 180) * 0.8
    + (lymphNodes / 45) * 1.1
    + (npi / 6.5) * 0.9
    + (stageValue / 4) * 1.5;

  if (!hasFullStaging) score += 0.3;
  score += tp53 * 0.35 + egfr * 0.28 + kras * 0.18 + myc * 0.22;

  if (intervention === 'Targeted Kinase Inhibition') score -= 0.9;
  else if (intervention === 'Double-Agent Cocktail') score -= 1.5;

  score += (grade - 2) * 0.3;
  score += (CELLULARITY_MAP[cellularity] - 2) * 0.15;
  score += (mutationCount / 30) * 0.4;

  if (erStatus === 'Positive') score -= 0.25;
  if (her2Status === 'Positive') score += 0.2;
  if (prStatus === 'Positive') score -= 0.15;
  return score;
}

export function runSeededVariation(
  baseSurrogateScore: number,
  hasFullStaging: boolean,
  intervention: Intervention,
  numSamples = 20,
): SeededVariation {
  const rng = mulberry32(Math.floor(baseSurrogateScore * 10000) + intervention.length);
  let baseUncertainty = hasFullStaging ? 0.25 : 0.65;
  if (intervention !== 'Standard Clinical Routine') baseUncertainty += 0.12;

  const samples: number[] = [];
  for (let index = 0; index < numSamples; index++) {
    const dropoutNoise = gaussian(rng) * baseUncertainty;
    const featureNoise = gaussian(rng) * 0.08;
    samples.push(baseSurrogateScore + dropoutNoise + featureNoise);
  }

  const meanSurrogateScoreValue = samples.reduce((sum, sample) => sum + sample, 0) / numSamples;
  const variance = samples.reduce(
    (sum, sample) => sum + (sample - meanSurrogateScoreValue) ** 2,
    0,
  ) / numSamples;
  return { meanSurrogateScore: meanSurrogateScoreValue, variationStd: Math.sqrt(variance), samples };
}

export function generateSurvivalCurve(
  surrogateScore: number,
  variationStd: number,
): CurvePoint[] {
  const chartData: CurvePoint[] = [];
  for (let day = 0; day <= 2000; day += 20) {
    const baselineCurveShape = Math.pow(day / 1200, 1.8);
    const clampPercentage = (value: number) => Math.min(Math.max(value, 0), 100);
    const survival = clampPercentage(Math.exp(-baselineCurveShape * Math.exp(surrogateScore)) * 100);
    const upper = clampPercentage(
      Math.exp(-baselineCurveShape * Math.exp(surrogateScore - 1.96 * variationStd)) * 100,
    );
    const lower = clampPercentage(
      Math.exp(-baselineCurveShape * Math.exp(surrogateScore + 1.96 * variationStd)) * 100,
    );
    chartData.push({ day, survival, range: [lower, upper] });
  }
  return chartData;
}

/** Linear lookup for milestones that fall between generated 20-day curve points. */
export function interpolateSurvival(curve: CurvePoint[], day: number): number {
  if (curve.length === 0) return 0;
  if (day <= curve[0].day) return curve[0].survival;

  for (let index = 1; index < curve.length; index++) {
    const upper = curve[index];
    if (day <= upper.day) {
      const lower = curve[index - 1];
      const interval = upper.day - lower.day;
      if (interval <= 0) return upper.survival;
      const ratio = (day - lower.day) / interval;
      return lower.survival + (upper.survival - lower.survival) * ratio;
    }
  }

  return curve[curve.length - 1].survival;
}

export interface EngineResult {
  baseSurrogateScore: number;
  meanSurrogateScore: number;
  variationStd: number;
  samples: number[];
  curve: CurvePoint[];
  medianDay: number | null;
  s365: number;
  s730: number;
  s1095: number;
  s2000: number;
  variationWarning: boolean;
}

export function runFullEngine(input: PatientInput): EngineResult {
  const baseSurrogateScore = computeBaseSurrogateScore(input);
  const mc = runSeededVariation(baseSurrogateScore, input.hasFullStaging, input.intervention, 20);
  const curve = generateSurvivalCurve(mc.meanSurrogateScore, mc.variationStd);
  const crossed = curve.find((point) => point.survival <= 50);

  return {
    baseSurrogateScore,
    meanSurrogateScore: mc.meanSurrogateScore,
    variationStd: mc.variationStd,
    samples: mc.samples,
    curve,
    medianDay: crossed?.day ?? null,
    s365: interpolateSurvival(curve, 365),
    s730: interpolateSurvival(curve, 730),
    s1095: interpolateSurvival(curve, 1095),
    s2000: interpolateSurvival(curve, 2000),
    variationWarning: mc.variationStd > 0.8,
  };
}

export const GENE_PANEL = [
  'TP53', 'EGFR', 'KRAS', 'MYC',
  'PIK3CA', 'PTEN', 'BRCA1', 'BRCA2',
  'CDH1', 'GATA3', 'MAP3K1', 'TBX3',
  'RUNX1', 'MLL3', 'NCOR1', 'STAG2',
];

// Synthetic research-demo telemetry for METABRIC partitions, not real hospital nodes.
export const FEDERATED_NODES = MODEL_METADATA.dataset.partitions.map((partition, index) => ({
  name: partition.name,
  location: `Research demo partition ${index + 1}`,
  load: [87, 64, 92, 45, 73, 58][index],
  lat: [12, 8, 15, 22, 11, 9][index],
  samples: partition.patients,
  accuracy: [0.892, 0.901, 0.885, 0.907, 0.894, 0.912][index],
  rounds: [142, 142, 142, 141, 142, 140][index],
  status: (index === 3 || index === 5 ? 'syncing' : 'active') as 'active' | 'syncing',
}));

// Seeded synthetic history keeps research-demo charts reproducible across reloads.
const trainingHistoryRng = mulberry32(0x4d455441);
export const TRAINING_HISTORY = Array.from({ length: 50 }, (_, index) => ({
  round: index + 1,
  loss: 2.5 * Math.exp(-index / 12) + 0.15 + trainingHistoryRng() * 0.05,
  valLoss: 2.6 * Math.exp(-index / 14) + 0.18 + trainingHistoryRng() * 0.06,
  accuracy: 0.5 + 0.4 * (1 - Math.exp(-index / 10)) + trainingHistoryRng() * 0.02,
}));

// Synthetic research-demo pathway interactions; not clinical evidence.
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

// Illustrative UI population totals sum to the 1,904-row METABRIC reference count;
// category distributions are synthetic and are not computed from notebook outputs.
export const POPULATION_STATS = {
  byStage: [
    { stage: 'Stage 0', count: 0, color: '#10b981' },
    { stage: 'Stage I', count: 475, color: '#3b82f6' },
    { stage: 'Stage II', count: 761, color: '#8b5cf6' },
    { stage: 'Stage III', count: 475, color: '#f59e0b' },
    { stage: 'Stage IV', count: 193, color: '#f43f5e' },
  ],
  byAgeGroup: [
    { range: '30-40', count: 114 },
    { range: '40-50', count: 286 },
    { range: '50-60', count: 438 },
    { range: '60-70', count: 514 },
    { range: '70-80', count: 362 },
    { range: '80+', count: 190 },
  ],
  byER: { positive: 1445, negative: 459 },
  byHER2: { positive: 247, negative: 1657 },
  byPR: { positive: 1009, negative: 895 },
  totalPatients: MODEL_METADATA.dataset.totalPatients,
  medianAge: 61,
  medianSurvival: 1250,
};
