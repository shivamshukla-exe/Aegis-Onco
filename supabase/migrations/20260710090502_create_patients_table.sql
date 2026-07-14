/*
# Create patients table for AegisOnco Patient Registry

1. New Tables
- `patients`
  - `id` (uuid, primary key, auto-generated)
  - `patient_code` (text, unique identifier for display, e.g. "PT-0001")
  - `age` (integer, patient age at diagnosis)
  - `tumor_size` (integer, primary tumor size in mm)
  - `lymph_nodes` (integer, positive lymph node count)
  - `npi` (numeric, Nottingham Prognostic Index, 1.0–6.5)
  - `stage` (text, TNM stage: Stage 0 through Stage IV)
  - `has_full_staging` (boolean, whether complete staging workup is available)
  - `tp53` (numeric, TP53 mRNA z-score, -3 to 3)
  - `egfr` (numeric, EGFR mRNA z-score, -3 to 3)
  - `kras` (numeric, KRAS mRNA z-score, -3 to 3)
  - `myc` (numeric, MYC mRNA z-score, -3 to 3)
  - `grade` (integer, histologic grade 1–3)
  - `cellularity` (text, Low/Moderate/High)
  - `mutation_count` (integer, mutation burden count 0–30)
  - `er_status` (text, Positive/Negative)
  - `her2_status` (text, Positive/Negative)
  - `pr_status` (text, Positive/Negative)
  - `intervention` (text, treatment pathway)
  - `mean_hazard` (numeric, computed mean log-hazard from MC dropout)
  - `uncertainty_std` (numeric, computed uncertainty std)
  - `median_os` (integer, median overall survival in days, nullable)
  - `day1095_survival` (numeric, survival probability at day 1095)
  - `created_at` (timestamptz, record creation timestamp)

2. Security
- Enable RLS on `patients`.
- Single-tenant no-auth app: allow anon + authenticated full CRUD (data is intentionally shared/public for this demo registry).

3. Notes
- Index on `patient_code` for fast lookups.
- Index on `created_at` for sorted queries.
*/

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_code text NOT NULL,
  age integer NOT NULL DEFAULT 60,
  tumor_size integer NOT NULL DEFAULT 25,
  lymph_nodes integer NOT NULL DEFAULT 0,
  npi numeric NOT NULL DEFAULT 4.0,
  stage text NOT NULL DEFAULT 'Stage II',
  has_full_staging boolean NOT NULL DEFAULT true,
  tp53 numeric NOT NULL DEFAULT 0.0,
  egfr numeric NOT NULL DEFAULT 0.0,
  kras numeric NOT NULL DEFAULT 0.0,
  myc numeric NOT NULL DEFAULT 0.0,
  grade integer NOT NULL DEFAULT 2,
  cellularity text NOT NULL DEFAULT 'Moderate',
  mutation_count integer NOT NULL DEFAULT 5,
  er_status text NOT NULL DEFAULT 'Positive',
  her2_status text NOT NULL DEFAULT 'Negative',
  pr_status text NOT NULL DEFAULT 'Positive',
  intervention text NOT NULL DEFAULT 'Standard Clinical Routine',
  mean_hazard numeric NOT NULL DEFAULT 0.0,
  uncertainty_std numeric NOT NULL DEFAULT 0.0,
  median_os integer,
  day1095_survival numeric NOT NULL DEFAULT 0.0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patients_code ON patients (patient_code);
CREATE INDEX IF NOT EXISTS idx_patients_created ON patients (created_at DESC);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_patients" ON patients;
CREATE POLICY "anon_select_patients" ON patients FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_patients" ON patients;
CREATE POLICY "anon_insert_patients" ON patients FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_patients" ON patients;
CREATE POLICY "anon_update_patients" ON patients FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_patients" ON patients;
CREATE POLICY "anon_delete_patients" ON patients FOR DELETE
TO anon, authenticated USING (true);
