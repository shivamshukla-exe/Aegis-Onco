/* Phase 4 research-platform hardening. All records remain synthetic/demo data.
   Anonymous patient CRUD is intentionally retained for this research demo; this is not a HIPAA claim. */

CREATE SEQUENCE IF NOT EXISTS patient_code_seq;

DO $$
DECLARE current_max bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(patient_code, '^PT-([0-9]+)$'))[1]::bigint), 0)
    INTO current_max FROM patients WHERE patient_code ~ '^PT-[0-9]+$';
  PERFORM setval('patient_code_seq', GREATEST(current_max, 1), current_max > 0);
END $$;

CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 'PT-' || lpad(nextval('patient_code_seq')::text, 6, '0');
$$;

-- The v3 column stored a hand-authored browser-surrogate score, not an estimated hazard.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'mean_hazard'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'surrogate_score'
  ) THEN
    ALTER TABLE patients RENAME COLUMN mean_hazard TO surrogate_score;
  END IF;
END $$;

-- Rename the seeded browser-variation field; it is not an uncertainty estimate.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'uncertainty_std'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'variation_std'
  ) THEN
    ALTER TABLE patients RENAME COLUMN uncertainty_std TO variation_std;
  END IF;
END $$;

ALTER TABLE patients
  ALTER COLUMN patient_code SET DEFAULT generate_patient_code(),
  ADD COLUMN IF NOT EXISTS model_version text NOT NULL DEFAULT 'aegis-ui-surrogate-1.0.0',
  ADD COLUMN IF NOT EXISTS feature_schema_version text NOT NULL DEFAULT 'ui-surrogate-input-v1',
  ADD COLUMN IF NOT EXISTS prediction_run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS prediction_timestamp timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS synthetic_data boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS data_completeness numeric,
  ADD COLUMN IF NOT EXISTS quality_flag text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Normalize legacy demo rows before enforcing the Phase 4 domain constraints.
UPDATE patients SET
  patient_code = COALESCE(NULLIF(btrim(patient_code), ''), generate_patient_code()),
  age = LEAST(97, GREATEST(21, age)),
  tumor_size = LEAST(180, GREATEST(1, tumor_size)),
  lymph_nodes = LEAST(45, GREATEST(0, lymph_nodes)),
  npi = LEAST(6.5, GREATEST(1.0, npi)),
  stage = CASE WHEN stage IN ('Stage 0','Stage I','Stage II','Stage III','Stage IV') THEN stage ELSE 'Stage II' END,
  tp53 = LEAST(3, GREATEST(-3, tp53)), egfr = LEAST(3, GREATEST(-3, egfr)),
  kras = LEAST(3, GREATEST(-3, kras)), myc = LEAST(3, GREATEST(-3, myc)),
  grade = LEAST(3, GREATEST(1, grade)),
  cellularity = CASE WHEN cellularity IN ('Low','Moderate','High') THEN cellularity ELSE 'Moderate' END,
  mutation_count = LEAST(30, GREATEST(0, mutation_count)),
  er_status = CASE WHEN er_status IN ('Positive','Negative') THEN er_status ELSE 'Negative' END,
  her2_status = CASE WHEN her2_status IN ('Positive','Negative') THEN her2_status ELSE 'Negative' END,
  pr_status = CASE WHEN pr_status IN ('Positive','Negative') THEN pr_status ELSE 'Negative' END,
  intervention = CASE WHEN intervention IN ('Standard Clinical Routine','Targeted Kinase Inhibition','Double-Agent Cocktail') THEN intervention ELSE 'Standard Clinical Routine' END,
  variation_std = GREATEST(0, variation_std),
  day1095_survival = LEAST(100, GREATEST(0, day1095_survival)),
  data_completeness = LEAST(100, GREATEST(0, COALESCE(data_completeness, 100))),
  quality_flag = CASE WHEN quality_flag IN ('none','incomplete_staging','boundary_warning','high_variation') THEN quality_flag ELSE 'none' END,
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now()),
  synthetic_data = true;

ALTER TABLE patients
  ALTER COLUMN data_completeness SET DEFAULT 100,
  ALTER COLUMN data_completeness SET NOT NULL;

-- Resolve legacy duplicate display codes deterministically before adding uniqueness.
WITH duplicates AS (
  SELECT id, row_number() OVER (PARTITION BY patient_code ORDER BY created_at, id) AS occurrence
  FROM patients
)
UPDATE patients p SET patient_code = generate_patient_code()
FROM duplicates d WHERE p.id = d.id AND d.occurrence > 1;

CREATE UNIQUE INDEX IF NOT EXISTS patients_patient_code_unique ON patients (patient_code);

ALTER TABLE patients
  DROP CONSTRAINT IF EXISTS patients_age_check,
  DROP CONSTRAINT IF EXISTS patients_tumor_size_check,
  DROP CONSTRAINT IF EXISTS patients_lymph_nodes_check,
  DROP CONSTRAINT IF EXISTS patients_npi_check,
  DROP CONSTRAINT IF EXISTS patients_stage_check,
  DROP CONSTRAINT IF EXISTS patients_gene_scores_check,
  DROP CONSTRAINT IF EXISTS patients_grade_check,
  DROP CONSTRAINT IF EXISTS patients_cellularity_check,
  DROP CONSTRAINT IF EXISTS patients_mutation_count_check,
  DROP CONSTRAINT IF EXISTS patients_receptor_status_check,
  DROP CONSTRAINT IF EXISTS patients_intervention_check,
  DROP CONSTRAINT IF EXISTS patients_uncertainty_check,
  DROP CONSTRAINT IF EXISTS patients_variation_check,
  DROP CONSTRAINT IF EXISTS patients_survival_check,
  DROP CONSTRAINT IF EXISTS patients_data_completeness_check,
  DROP CONSTRAINT IF EXISTS patients_ood_or_abstention_check,
  DROP CONSTRAINT IF EXISTS patients_quality_flag_check,
  DROP CONSTRAINT IF EXISTS patients_deleted_after_created_check,
  DROP CONSTRAINT IF EXISTS patients_synthetic_only_check;
ALTER TABLE patients
  ADD CONSTRAINT patients_age_check CHECK (age BETWEEN 21 AND 97),
  ADD CONSTRAINT patients_tumor_size_check CHECK (tumor_size BETWEEN 1 AND 180),
  ADD CONSTRAINT patients_lymph_nodes_check CHECK (lymph_nodes BETWEEN 0 AND 45),
  ADD CONSTRAINT patients_npi_check CHECK (npi BETWEEN 1.0 AND 6.5),
  ADD CONSTRAINT patients_stage_check CHECK (stage IN ('Stage 0','Stage I','Stage II','Stage III','Stage IV')),
  ADD CONSTRAINT patients_gene_scores_check CHECK (tp53 BETWEEN -3 AND 3 AND egfr BETWEEN -3 AND 3 AND kras BETWEEN -3 AND 3 AND myc BETWEEN -3 AND 3),
  ADD CONSTRAINT patients_grade_check CHECK (grade BETWEEN 1 AND 3),
  ADD CONSTRAINT patients_cellularity_check CHECK (cellularity IN ('Low','Moderate','High')),
  ADD CONSTRAINT patients_mutation_count_check CHECK (mutation_count BETWEEN 0 AND 30),
  ADD CONSTRAINT patients_receptor_status_check CHECK (er_status IN ('Positive','Negative') AND her2_status IN ('Positive','Negative') AND pr_status IN ('Positive','Negative')),
  ADD CONSTRAINT patients_intervention_check CHECK (intervention IN ('Standard Clinical Routine','Targeted Kinase Inhibition','Double-Agent Cocktail')),
  ADD CONSTRAINT patients_variation_check CHECK (variation_std >= 0),
  ADD CONSTRAINT patients_survival_check CHECK (day1095_survival BETWEEN 0 AND 100),
  ADD CONSTRAINT patients_data_completeness_check CHECK (data_completeness BETWEEN 0 AND 100),
  ADD CONSTRAINT patients_quality_flag_check CHECK (quality_flag IN ('none','incomplete_staging','boundary_warning','high_variation')),
  ADD CONSTRAINT patients_deleted_after_created_check CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  ADD CONSTRAINT patients_synthetic_only_check CHECK (synthetic_data = true);

CREATE INDEX IF NOT EXISTS idx_patients_stage ON patients (stage);
CREATE INDEX IF NOT EXISTS idx_patients_surrogate_score ON patients (surrogate_score);
CREATE INDEX IF NOT EXISTS idx_patients_prediction_timestamp ON patients (prediction_timestamp DESC);
ALTER TABLE patients REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  patient_code text NOT NULL,
  actor_type text NOT NULL DEFAULT 'anonymous_demo' CHECK (actor_type = 'anonymous_demo'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_patient ON audit_events (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events (created_at DESC);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demo_insert_audit_events" ON audit_events;
CREATE POLICY "demo_insert_audit_events" ON audit_events FOR INSERT
TO anon, authenticated WITH CHECK (actor_type = 'anonymous_demo');

DROP POLICY IF EXISTS "demo_read_audit_events" ON audit_events;
CREATE POLICY "demo_read_audit_events" ON audit_events FOR SELECT
TO anon, authenticated USING (true);

COMMENT ON TABLE patients IS 'Synthetic/demo research records only; not a clinical system and no HIPAA compliance claim.';
COMMENT ON TABLE audit_events IS 'Best-effort research-demo activity trail; client-side events are not a security audit boundary.';
COMMENT ON COLUMN patients.synthetic_data IS 'Must remain true: real patient data is not permitted in this demo registry.';

-- Keep the deliberately anonymous demo CRUD policies explicit after this upgrade.
DROP POLICY IF EXISTS "anon_select_patients" ON patients;
CREATE POLICY "anon_select_patients" ON patients FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_patients" ON patients;
CREATE POLICY "anon_insert_patients" ON patients FOR INSERT TO anon, authenticated WITH CHECK (synthetic_data = true);
DROP POLICY IF EXISTS "anon_update_patients" ON patients;
CREATE POLICY "anon_update_patients" ON patients FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (synthetic_data = true);
DROP POLICY IF EXISTS "anon_delete_patients" ON patients;
CREATE POLICY "anon_delete_patients" ON patients FOR DELETE TO anon, authenticated USING (true);


-- Active-registry lifecycle and immutable prediction history.
ALTER TABLE patients ALTER COLUMN created_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_active_created
  ON patients (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_active_stage
  ON patients (stage, created_at DESC) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_patient_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_set_updated_at ON patients;
CREATE TRIGGER patients_set_updated_at
BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION set_patient_updated_at();

CREATE TABLE IF NOT EXISTS prediction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_run_id uuid NOT NULL UNIQUE,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  patient_code text NOT NULL,
  model_version text NOT NULL,
  schema_version text NOT NULL,
  data_completeness numeric NOT NULL CHECK (data_completeness BETWEEN 0 AND 100),
  quality_flag text NOT NULL CHECK (quality_flag IN ('none','incomplete_staging','boundary_warning','high_variation')),
  inputs jsonb NOT NULL,
  outputs jsonb NOT NULL,
  synthetic_data boolean NOT NULL DEFAULT true CHECK (synthetic_data = true),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, prediction_run_id)
);

CREATE INDEX IF NOT EXISTS idx_prediction_runs_patient_created
  ON prediction_runs (patient_id, created_at DESC);
ALTER TABLE prediction_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demo_read_prediction_runs" ON prediction_runs;
CREATE POLICY "demo_read_prediction_runs" ON prediction_runs FOR SELECT
TO anon, authenticated USING (synthetic_data = true);

CREATE OR REPLACE FUNCTION capture_prediction_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO prediction_runs (
    prediction_run_id, patient_id, patient_code, model_version, schema_version,
    data_completeness, quality_flag, inputs, outputs, synthetic_data, created_at
  ) VALUES (
    NEW.prediction_run_id, NEW.id, NEW.patient_code, NEW.model_version,
    NEW.feature_schema_version, NEW.data_completeness, NEW.quality_flag,
    jsonb_build_object(
      'age', NEW.age, 'tumorSize', NEW.tumor_size, 'lymphNodes', NEW.lymph_nodes,
      'npi', NEW.npi, 'stage', NEW.stage, 'hasFullStaging', NEW.has_full_staging,
      'tp53', NEW.tp53, 'egfr', NEW.egfr, 'kras', NEW.kras, 'myc', NEW.myc,
      'grade', NEW.grade, 'cellularity', NEW.cellularity,
      'mutationCount', NEW.mutation_count, 'erStatus', NEW.er_status,
      'her2Status', NEW.her2_status, 'prStatus', NEW.pr_status,
      'intervention', NEW.intervention
    ),
    jsonb_build_object(
      'surrogateScore', NEW.surrogate_score, 'variationStd', NEW.variation_std,
      'medianDemoDay', NEW.median_os, 'day1095DemoSurvival', NEW.day1095_survival
    ),
    true, COALESCE(NEW.prediction_timestamp, now())
  )
  ON CONFLICT (prediction_run_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_capture_prediction_run ON patients;
CREATE TRIGGER patients_capture_prediction_run
AFTER INSERT OR UPDATE OF prediction_run_id ON patients
FOR EACH ROW EXECUTE FUNCTION capture_prediction_run();

-- Preserve the current prediction of every legacy synthetic row as history.
INSERT INTO prediction_runs (
  prediction_run_id, patient_id, patient_code, model_version, schema_version,
  data_completeness, quality_flag, inputs, outputs, synthetic_data, created_at
)
SELECT
  p.prediction_run_id, p.id, p.patient_code, p.model_version, p.feature_schema_version,
  p.data_completeness, p.quality_flag,
  jsonb_build_object(
    'age', p.age, 'tumorSize', p.tumor_size, 'lymphNodes', p.lymph_nodes,
    'npi', p.npi, 'stage', p.stage, 'hasFullStaging', p.has_full_staging,
    'tp53', p.tp53, 'egfr', p.egfr, 'kras', p.kras, 'myc', p.myc,
    'grade', p.grade, 'cellularity', p.cellularity,
    'mutationCount', p.mutation_count, 'erStatus', p.er_status,
    'her2Status', p.her2_status, 'prStatus', p.pr_status,
    'intervention', p.intervention
  ),
  jsonb_build_object(
    'surrogateScore', p.surrogate_score, 'variationStd', p.variation_std,
    'medianDemoDay', p.median_os, 'day1095DemoSurvival', p.day1095_survival
  ),
  true, p.prediction_timestamp
FROM patients p
ON CONFLICT (prediction_run_id) DO NOTHING;

COMMENT ON TABLE prediction_runs IS 'Immutable synthetic/demo model snapshots for reproducibility; not clinical predictions.';
COMMENT ON COLUMN patients.surrogate_score IS 'Hand-authored browser-surrogate score retained for UI demonstration; not an estimated hazard or clinical risk.';
COMMENT ON COLUMN patients.variation_std IS 'Seeded browser-perturbation spread for UI demonstration; not statistical uncertainty or a confidence estimate.';
COMMENT ON COLUMN patients.quality_flag IS 'Heuristic UI flag only: none, incomplete_staging, boundary_warning, or high_variation; not an empirical OOD detector or model abstention.';
COMMENT ON COLUMN patients.deleted_at IS 'Soft-delete timestamp; non-null rows are excluded from the active demo registry.';

-- Explicit disposable-demo privileges. The anon key is intentionally public;
-- these permissions are unsuitable for real patient data or a security audit boundary.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE patients TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE audit_events TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE prediction_runs FROM anon, authenticated;
GRANT SELECT ON TABLE prediction_runs TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE patient_code_seq TO anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_patient_code() TO anon, authenticated;