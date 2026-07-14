export type Stage = 'Stage 0' | 'Stage I' | 'Stage II' | 'Stage III' | 'Stage IV';
export type Cellularity = 'Low' | 'Moderate' | 'High';
export type Status = 'Positive' | 'Negative';
export type Intervention = 'Standard Clinical Routine' | 'Targeted Kinase Inhibition' | 'Double-Agent Cocktail';

export interface CurvePoint {
  day: number;
  survival: number;
  range: [number, number];
}

export interface MCHazard {
  meanHazard: number;
  uncertaintyStd: number;
  samples: number[];
}

export interface PatientInput {
  age: number;
  tumorSize: number;
  lymphNodes: number;
  npi: number;
  stage: Stage;
  hasFullStaging: boolean;
  tp53: number;
  egfr: number;
  kras: number;
  myc: number;
  grade: number;
  cellularity: Cellularity;
  mutationCount: number;
  erStatus: Status;
  her2Status: Status;
  prStatus: Status;
  intervention: Intervention;
}

export interface PatientRecord {
  id: string;
  patient_code: string;
  age: number;
  tumor_size: number;
  lymph_nodes: number;
  npi: number;
  stage: Stage;
  has_full_staging: boolean;
  tp53: number;
  egfr: number;
  kras: number;
  myc: number;
  grade: number;
  cellularity: Cellularity;
  mutation_count: number;
  er_status: Status;
  her2_status: Status;
  pr_status: Status;
  intervention: Intervention;
  mean_hazard: number;
  uncertainty_std: number;
  median_os: number | null;
  day1095_survival: number;
  created_at: string;
}

export const STAGES: Stage[] = ['Stage 0', 'Stage I', 'Stage II', 'Stage III', 'Stage IV'];
export const CELLULARITIES: Cellularity[] = ['Low', 'Moderate', 'High'];
export const INTERVENTIONS: Intervention[] = [
  'Standard Clinical Routine',
  'Targeted Kinase Inhibition',
  'Double-Agent Cocktail',
];

export const STAGE_MAP: Record<Stage, number> = {
  'Stage 0': 0.0, 'Stage I': 1.0, 'Stage II': 2.0, 'Stage III': 3.0, 'Stage IV': 4.0,
};
export const CELLULARITY_MAP: Record<Cellularity, number> = { Low: 1.0, Moderate: 2.0, High: 3.0 };

export const DEFAULT_INPUT: PatientInput = {
  age: 60, tumorSize: 25, lymphNodes: 0, npi: 4.0, stage: 'Stage II', hasFullStaging: true,
  tp53: 0.0, egfr: 0.0, kras: 0.0, myc: 0.0,
  grade: 2, cellularity: 'Moderate', mutationCount: 5,
  erStatus: 'Positive', her2Status: 'Negative', prStatus: 'Positive',
  intervention: 'Standard Clinical Routine',
};
