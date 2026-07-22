import { supabase } from './supabase';
import type { AuditAction, PatientInput, PatientRecord, QualityFlag } from './types';

export const MODEL_VERSION = 'aegis-ui-surrogate-1.0.0';
export const FEATURE_SCHEMA_VERSION = 'ui-surrogate-input-v1';

export const PATIENT_COLUMNS = [
  'id', 'patient_code', 'age', 'tumor_size', 'lymph_nodes', 'npi', 'stage',
  'has_full_staging', 'tp53', 'egfr', 'kras', 'myc', 'grade', 'cellularity',
  'mutation_count', 'er_status', 'her2_status', 'pr_status', 'intervention',
  'surrogate_score', 'variation_std', 'median_os', 'day1095_survival',
  'model_version', 'feature_schema_version', 'prediction_run_id',
  'data_completeness', 'quality_flag', 'prediction_timestamp',
  'synthetic_data', 'created_at', 'updated_at', 'deleted_at',
].join(',');

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function createPredictionProvenance(input: PatientInput, variationStd: number) {
  // Every form field is required; only the stage value can be explicitly unavailable.
  const completeness = input.hasFullStaging ? 100 : 93.75;
  const nearUiBoundary = input.age >= 95 || input.tumorSize >= 175 || input.lymphNodes >= 43
    || [input.tp53, input.egfr, input.kras, input.myc].some((value) => Math.abs(value) >= 2.8);
  const qualityFlag: QualityFlag = !input.hasFullStaging
    ? 'incomplete_staging'
    : variationStd > 0.8
      ? 'high_variation'
      : nearUiBoundary
        ? 'boundary_warning'
        : 'none';
  return {
    model_version: MODEL_VERSION,
    feature_schema_version: FEATURE_SCHEMA_VERSION,
    prediction_run_id: globalThis.crypto?.randomUUID?.() ?? fallbackUuid(),
    data_completeness: completeness,
    quality_flag: qualityFlag,
    prediction_timestamp: new Date().toISOString(),
    synthetic_data: true as const,
  };
}

export async function writeDemoActivity(action: AuditAction, patient: Pick<PatientRecord, 'id' | 'patient_code'>, details: Record<string, unknown> = {}) {
  const { error } = await supabase.from('audit_events').insert({
    action, patient_id: patient.id, patient_code: patient.patient_code,
    actor_type: 'anonymous_demo', details,
  });
  if (error) console.warn('Best-effort demo activity event failed:', error.message);
}
