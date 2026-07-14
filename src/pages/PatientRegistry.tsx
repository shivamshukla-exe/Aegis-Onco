import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Users, Plus, Edit, Trash2, Search, X, AlertCircle, CheckCircle2, Loader2,
  HeartPulse, Dna, ScanLine, GitBranch, Activity, ShieldCheck,
} from 'lucide-react';
import {
  PageHeader, GlassCard, LoadingSpinner, KpiCard,
  SliderRow, SelectControl, SegmentedControl, StatusPill, ModuleHeader,
} from '../components/ui';
import {
  DEFAULT_INPUT, STAGES, CELLULARITIES, INTERVENTIONS,
  type PatientInput, type PatientRecord, type Stage, type Cellularity, type Status, type Intervention,
} from '../lib/types';
import { runFullEngine } from '../lib/engine';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Toast types
// ─────────────────────────────────────────────────────────────────────────────
type ToastKind = 'success' | 'error';
interface Toast { id: number; kind: ToastKind; message: string; }

type SortKey = 'created_at' | 'mean_hazard' | 'uncertainty_std' | 'day1095_survival' | 'age';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS: Status[] = ['Positive', 'Negative'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — map between PatientInput (camelCase) and DB row (snake_case)
// ─────────────────────────────────────────────────────────────────────────────
function recordToInput(r: PatientRecord): PatientInput {
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
    intervention: r.intervention,
  };
}

function inputToRow(input: PatientInput) {
  const engine = runFullEngine(input);
  return {
    age: input.age,
    tumor_size: input.tumorSize,
    lymph_nodes: input.lymphNodes,
    npi: input.npi,
    stage: input.stage,
    has_full_staging: input.hasFullStaging,
    tp53: input.tp53,
    egfr: input.egfr,
    kras: input.kras,
    myc: input.myc,
    grade: input.grade,
    cellularity: input.cellularity,
    mutation_count: input.mutationCount,
    er_status: input.erStatus,
    her2_status: input.her2Status,
    pr_status: input.prStatus,
    intervention: input.intervention,
    mean_hazard: engine.meanHazard,
    uncertainty_std: engine.uncertaintyStd,
    median_os: engine.medianDay,
    day1095_survival: engine.s1095,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Patient Form — all PatientInput fields
// ─────────────────────────────────────────────────────────────────────────────
function PatientForm({ value, onChange }: { value: PatientInput; onChange: (v: PatientInput) => void }) {
  const set = <K extends keyof PatientInput>(k: K, v: PatientInput[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-5">
      {/* Module 1: Clinical */}
      <div>
        <ModuleHeader icon={HeartPulse} title="EHR Clinical Metadata" subtitle="Module 1 · Patient Stratification" accent="violet" />
        <div className="space-y-4">
          <SliderRow label="Patient Age" value={value.age} display={`${value.age} yrs`} min={21} max={97} step={1} onChange={(v) => set('age', v)} />
          <SliderRow label="Primary Tumor Size" value={value.tumorSize} display={`${value.tumorSize} mm`} min={1} max={180} step={1} onChange={(v) => set('tumorSize', v)} accent="blue" />
          <SliderRow label="Positive Lymph Nodes" value={value.lymphNodes} display={`${value.lymphNodes}`} min={0} max={45} step={1} onChange={(v) => set('lymphNodes', v)} accent="rose" />
          <SliderRow label="Nottingham Prognostic Index" value={value.npi} display={value.npi.toFixed(1)} min={1.0} max={6.5} step={0.1} onChange={(v) => set('npi', v)} accent="amber" />
          <div>
            <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2.5">Clinical TNM Stage</label>
            <SelectControl<Stage> options={STAGES} value={value.stage} onChange={(v) => set('stage', v)} disabled={!value.hasFullStaging} />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2.5">Complete Staging Workup?</label>
            <SegmentedControl<string> options={['Yes', 'No']} value={value.hasFullStaging ? 'Yes' : 'No'} onChange={(v) => set('hasFullStaging', v === 'Yes')} columns={2} />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200/60" />

      {/* Module 2: Genomic */}
      <div>
        <ModuleHeader icon={Dna} title="Multi-Omics Sequencing" subtitle="Module 2 · 16-Gene Panel (4 Exposed)" accent="rose" />
        <div className="space-y-4">
          <SliderRow label="TP53 mRNA Z-Score" value={value.tp53} display={value.tp53.toFixed(1)} min={-3} max={3} step={0.1} onChange={(v) => set('tp53', v)} accent="rose" />
          <SliderRow label="EGFR mRNA Z-Score" value={value.egfr} display={value.egfr.toFixed(1)} min={-3} max={3} step={0.1} onChange={(v) => set('egfr', v)} accent="rose" />
          <SliderRow label="KRAS mRNA Z-Score" value={value.kras} display={value.kras.toFixed(1)} min={-3} max={3} step={0.1} onChange={(v) => set('kras', v)} accent="rose" />
          <SliderRow label="MYC mRNA Z-Score" value={value.myc} display={value.myc.toFixed(1)} min={-3} max={3} step={0.1} onChange={(v) => set('myc', v)} accent="rose" />
        </div>
      </div>

      <div className="border-t border-slate-200/60" />

      {/* Module 3: Histologic */}
      <div>
        <ModuleHeader icon={ScanLine} title="Histologic / Morphometric" subtitle="Module 3 · Imaging Proxy" accent="emerald" />
        <div className="space-y-4">
          <SliderRow label="Neoplasm Histologic Grade" value={value.grade} display={`Grade ${value.grade}`} min={1} max={3} step={1} onChange={(v) => set('grade', v)} accent="emerald" />
          <div>
            <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2.5">Tumor Cellularity</label>
            <SegmentedControl<Cellularity> options={CELLULARITIES} value={value.cellularity} onChange={(v) => set('cellularity', v)} columns={3} />
          </div>
          <SliderRow label="Mutation Burden (count)" value={value.mutationCount} display={`${value.mutationCount}`} min={0} max={30} step={1} onChange={(v) => set('mutationCount', v)} accent="amber" />
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">ER Status</label>
              <StatusPill options={STATUS_OPTIONS} value={value.erStatus} onChange={(v) => set('erStatus', v as Status)} accent="rose" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">HER2 Status</label>
              <StatusPill options={STATUS_OPTIONS} value={value.her2Status} onChange={(v) => set('her2Status', v as Status)} accent="violet" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2">PR Status</label>
              <StatusPill options={STATUS_OPTIONS} value={value.prStatus} onChange={(v) => set('prStatus', v as Status)} accent="blue" />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200/60" />

      {/* Module 4: Intervention */}
      <div>
        <ModuleHeader icon={GitBranch} title="Counterfactual Intervention" subtitle="Module 4 · Treatment Pathway" accent="amber" />
        <div>
          <label className="text-[11px] text-slate-500 font-semibold tracking-wide block mb-2.5">Intervention Strategy</label>
          <SelectControl<Intervention> options={INTERVENTIONS} value={value.intervention} onChange={(v) => set('intervention', v)} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal / Drawer
// ─────────────────────────────────────────────────────────────────────────────
function PatientModal({
  open, mode, initial, onClose, onSubmit, submitting,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial: PatientInput;
  onClose: () => void;
  onSubmit: (input: PatientInput) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<PatientInput>(initial);

  useEffect(() => { if (open) setForm(initial); }, [open, initial]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="glass-card relative w-full max-w-2xl rounded-3xl my-4 sm:my-8"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-5 border-b border-slate-200/60 rounded-t-3xl backdrop-blur-xl bg-white/70">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0.8, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode === 'edit' ? 'bg-amber-50 border border-amber-200 glow-amber' : 'bg-blue-50 border border-blue-200'}`}
                >
                  {mode === 'edit' ? <Edit size={18} className="text-amber-600" /> : <Plus size={18} className="text-blue-600" />}
                </motion.div>
                <div>
                  <h2 className="text-[15px] font-extrabold tracking-tight text-slate-800">
                    {mode === 'edit' ? 'Edit Patient Record' : 'Register New Patient'}
                  </h2>
                  <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.18em] mt-0.5">
                    {mode === 'edit' ? 'Update · Recompute Engine' : 'Ingest · Compute Prognostic Engine'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 max-h-[calc(100vh-220px)] overflow-y-auto">
              <PatientForm value={form} onChange={setForm} />
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200/60 rounded-b-3xl backdrop-blur-xl bg-white/70">
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-slate-600 bg-slate-100/80 hover:bg-slate-200/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => onSubmit(form)}
                disabled={submitting}
                className="relative overflow-hidden px-5 py-2.5 rounded-xl text-[12px] font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 shadow-[0_4px_20px_rgba(59,130,246,0.4)] transition-all disabled:opacity-70 flex items-center gap-2"
              >
                {submitting ? (
                  <><Loader2 size={14} className="animate-spin" /> Computing…</>
                ) : (
                  <>{mode === 'edit' ? <CheckCircle2 size={14} /> : <Plus size={14} />}{mode === 'edit' ? 'Save Changes' : 'Register Patient'}</>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete confirmation dialog
// ─────────────────────────────────────────────────────────────────────────────
function DeleteConfirm({
  open, patient, onClose, onConfirm, deleting,
}: {
  open: boolean;
  patient: PatientRecord | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <AnimatePresence>
      {open && patient && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="glass-card-rose relative w-full max-w-md rounded-3xl p-6 glow-rose"
          >
            <div className="flex items-start gap-4">
              <motion.div
                initial={{ scale: 0.8, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0"
              >
                <AlertCircle size={20} className="text-rose-500" />
              </motion.div>
              <div className="flex-1">
                <h2 className="text-[15px] font-extrabold tracking-tight text-slate-800">Delete Patient Record?</h2>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  You are about to permanently remove{' '}
                  <span className="font-mono-data font-bold text-rose-600">{patient.patient_code}</span>
                  {' '}from the federated cohort database. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                disabled={deleting}
                className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-slate-600 bg-slate-100/80 hover:bg-slate-200/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onConfirm}
                disabled={deleting}
                className="px-5 py-2.5 rounded-xl text-[12px] font-bold text-white bg-gradient-to-r from-rose-500 to-pink-600 shadow-[0_4px_20px_rgba(244,63,94,0.4)] transition-all disabled:opacity-70 flex items-center gap-2"
              >
                {deleting ? <><Loader2 size={14} className="animate-spin" /> Deleting…</> : <><Trash2 size={14} /> Delete</>}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage badge color
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function PatientRegistry() {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<PatientRecord | null>(null);
  const [formInitial, setFormInitial] = useState<PatientInput>(DEFAULT_INPUT);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PatientRecord | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── Toast helpers ──
  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  // ── Fetch all patients ──
  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to fetch patients');
      setPatients([]);
    } else {
      setPatients((data ?? []) as PatientRecord[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchPatients(); }, [fetchPatients]);

  // ── Filter + sort ──
  const filtered = useMemo(() => {
    let list = [...patients];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        p.patient_code.toLowerCase().includes(q) ||
        p.stage.toLowerCase().includes(q),
      );
    }
    if (stageFilter !== 'All') {
      list = list.filter((p) => p.stage === stageFilter);
    }
    list.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === 'created_at') { av = a.created_at; bv = b.created_at; }
      else { av = a[sortKey]; bv = b[sortKey]; }
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [patients, search, stageFilter, sortKey, sortDir]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    const n = patients.length;
    if (n === 0) return { total: 0, avgHazard: 0, avgUncertainty: 0, avgDay1095: 0 };
    const avgHazard = patients.reduce((s, p) => s + p.mean_hazard, 0) / n;
    const avgUncertainty = patients.reduce((s, p) => s + p.uncertainty_std, 0) / n;
    const avgDay1095 = patients.reduce((s, p) => s + p.day1095_survival, 0) / n;
    return { total: n, avgHazard, avgUncertainty, avgDay1095 };
  }, [patients]);

  // ── Generate next patient_code: PT-0001 ──
  const nextPatientCode = useMemo(() => {
    let maxSeq = 0;
    for (const p of patients) {
      const m = p.patient_code.match(/PT-(\d+)/i);
      if (m) { const n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n; }
    }
    return `PT-${String(maxSeq + 1).padStart(4, '0')}`;
  }, [patients]);

  // ── Open create modal ──
  const openCreate = useCallback(() => {
    setModalMode('create');
    setEditing(null);
    setFormInitial(DEFAULT_INPUT);
    setModalOpen(true);
  }, []);

  // ── Open edit modal ──
  const openEdit = useCallback((p: PatientRecord) => {
    setModalMode('edit');
    setEditing(p);
    setFormInitial(recordToInput(p));
    setModalOpen(true);
  }, []);

  // ── Submit (create or edit) ──
  const handleSubmit = useCallback(async (input: PatientInput) => {
    setSubmitting(true);
    try {
      const row = inputToRow(input);
      if (modalMode === 'edit' && editing) {
        const { error } = await supabase
          .from('patients')
          .update(row)
          .eq('id', editing.id);
        if (error) throw error;
        pushToast('success', `${editing.patient_code} updated successfully`);
      } else {
        const { data, error } = await supabase
          .from('patients')
          .insert({ ...row, patient_code: nextPatientCode })
          .select()
          .single();
        if (error) throw error;
        pushToast('success', `${(data as PatientRecord | null)?.patient_code ?? nextPatientCode} registered successfully`);
      }
      setModalOpen(false);
      await fetchPatients();
    } catch (err: any) {
      pushToast('error', err?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  }, [modalMode, editing, nextPatientCode, pushToast, fetchPatients]);

  // ── Delete ──
  const openDelete = useCallback((p: PatientRecord) => {
    setDeleteTarget(p);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      pushToast('success', `${deleteTarget.patient_code} deleted`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchPatients();
    } catch (err: any) {
      pushToast('error', err?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, pushToast, fetchPatients]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  // ── Column config ──
  const columns: { key: SortKey; label: string; align?: 'right' }[] = [
    { key: 'created_at', label: 'Registered' },
    { key: 'age', label: 'Age', align: 'right' },
    { key: 'mean_hazard', label: 'Mean Hazard', align: 'right' },
    { key: 'uncertainty_std', label: 'σ Uncertainty', align: 'right' },
    { key: 'day1095_survival', label: 'Day 1095', align: 'right' },
  ];

  return (
    <div className="min-h-screen mesh-bg text-slate-800 relative overflow-x-hidden">
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div animate={{ x: [0, 40, 0], y: [0, -30, 0] }} transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[10%] left-[15%] w-[400px] h-[400px] bg-blue-300/20 rounded-full blur-[100px]" />
        <motion.div animate={{ x: [0, -50, 0], y: [0, 40, 0] }} transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[15%] right-[12%] w-[350px] h-[350px] bg-violet-300/15 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 lg:px-6 py-6">
        {/* Header */}
        <PageHeader icon={Users} title="Patient Registry" subtitle="Federated Patient Cohort Database" accent="blue">
          <motion.button
            whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.03 }}
            onClick={openCreate}
            className="relative overflow-hidden px-5 py-3 rounded-2xl font-bold text-[13px] text-white bg-gradient-to-r from-blue-500 to-indigo-600 shadow-[0_4px_20px_rgba(59,130,246,0.4)] transition-all flex items-center gap-2"
          >
            <Plus size={16} /> Register New Patient
            <div className="shimmer absolute inset-0" />
          </motion.button>
        </PageHeader>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard icon={Users} label="Total Patients" value={String(kpis.total)} sub="Federated cohort size" accent="blue" />
          <KpiCard icon={Activity} label="Avg Hazard" value={kpis.total ? kpis.avgHazard.toFixed(3) : '—'} sub="Mean log-hazard across cohort" accent="violet" />
          <KpiCard icon={ShieldCheck} label="Avg Uncertainty" value={kpis.total ? kpis.avgUncertainty.toFixed(3) : '—'} sub="Epistemic σ across cohort" accent="emerald" />
          <KpiCard icon={HeartPulse} label="Avg Day 1095" value={kpis.total ? `${kpis.avgDay1095.toFixed(1)}%` : '—'} sub="3-year survival probability" accent="amber" />
        </div>

        {/* Toolbar: search + stage filter + sort */}
        <GlassCard accent="blue" className="rounded-3xl p-4 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient code or stage…"
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 text-[12px] font-mono-data text-slate-700 outline-none transition-all shadow-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Stage filter */}
            <div className="min-w-[160px]">
              <SelectControl<Stage | 'All'>
                options={['All', ...STAGES]}
                value={stageFilter}
                onChange={(v) => setStageFilter(v)}
              />
            </div>

            {/* Sort key */}
            <div className="min-w-[160px]">
              <SelectControl<string>
                options={['created_at', 'mean_hazard', 'uncertainty_std', 'day1095_survival', 'age']}
                value={sortKey}
                onChange={(v) => setSortKey(v as SortKey)}
              />
            </div>

            {/* Sort dir */}
            <button
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="px-3.5 py-3 rounded-xl bg-white/80 border border-slate-200 hover:border-blue-400 text-[11px] font-mono-data font-bold text-slate-600 transition-all shadow-sm flex items-center gap-2"
              title="Toggle sort direction"
            >
              {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
        </GlassCard>

        {/* Body: loading / error / empty / table */}
        {loading ? (
          <GlassCard className="rounded-3xl p-8">
            <LoadingSpinner label="Fetching federated cohort…" />
          </GlassCard>
        ) : fetchError ? (
          <GlassCard className="rounded-3xl p-8">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mb-4 glow-rose"
              >
                <AlertCircle size={26} className="text-rose-500" />
              </motion.div>
              <h3 className="text-[15px] font-extrabold text-slate-800 mb-1.5">Failed to Load Cohort</h3>
              <p className="text-[11px] text-slate-500 font-mono-data max-w-md mb-5">{fetchError}</p>
              <motion.button
                whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.03 }}
                onClick={() => void fetchPatients()}
                className="px-5 py-2.5 rounded-xl text-[12px] font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 shadow-[0_4px_20px_rgba(59,130,246,0.4)] flex items-center gap-2"
              >
                <Loader2 size={14} /> Retry Fetch
              </motion.button>
            </div>
          </GlassCard>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <GlassCard className="rounded-3xl p-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <motion.div
                initial={{ scale: 0.8, y: 10 }} animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="relative mb-6"
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-20 h-20 rounded-3xl bg-blue-50 border border-blue-200 flex items-center justify-center glow-violet"
                >
                  <Users size={36} className="text-blue-500" />
                </motion.div>
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-400/40"
                />
              </motion.div>
              <h3 className="text-[16px] font-extrabold text-slate-800 mb-1.5">
                {patients.length === 0 ? 'No Patients Registered' : 'No Matching Patients'}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono-data max-w-md mb-6 leading-relaxed">
                {patients.length === 0
                  ? 'The federated cohort database is empty. Register your first patient to begin prognostic modeling.'
                  : 'No patients match the current search or filter criteria. Try adjusting your query.'}
              </p>
              {patients.length === 0 ? (
                <motion.button
                  whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.03 }}
                  onClick={openCreate}
                  className="px-5 py-2.5 rounded-xl text-[12px] font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 shadow-[0_4px_20px_rgba(59,130,246,0.4)] flex items-center gap-2"
                >
                  <Plus size={14} /> Register First Patient
                </motion.button>
              ) : (
                <button
                  onClick={() => { setSearch(''); setStageFilter('All'); }}
                  className="px-5 py-2.5 rounded-xl text-[12px] font-bold text-slate-600 bg-slate-100/80 hover:bg-slate-200/80 transition-colors flex items-center gap-2"
                >
                  <X size={14} /> Clear Filters
                </button>
              )}
            </motion.div>
          </GlassCard>
        ) : (
          <>
            {/* Desktop table */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <GlassCard className="rounded-3xl overflow-hidden hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200/60 bg-white/40">
                        <th className="text-left px-5 py-3.5 text-[9px] uppercase tracking-[0.16em] font-mono-data font-bold text-slate-400">Patient Code</th>
                        {columns.map((c) => (
                          <th
                            key={c.key}
                            onClick={() => toggleSort(c.key)}
                            className={`px-4 py-3.5 text-[9px] uppercase tracking-[0.16em] font-mono-data font-bold text-slate-400 cursor-pointer select-none hover:text-slate-600 transition-colors ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {c.label}
                              {sortKey === c.key && <span className="text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </th>
                        ))}
                        <th className="text-left px-4 py-3.5 text-[9px] uppercase tracking-[0.16em] font-mono-data font-bold text-slate-400">Stage</th>
                        <th className="text-right px-5 py-3.5 text-[9px] uppercase tracking-[0.16em] font-mono-data font-bold text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {filtered.map((p, i) => (
                          <motion.tr
                            key={p.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ delay: Math.min(i * 0.03, 0.3) }}
                            whileHover={{ backgroundColor: 'rgba(59,130,246,0.04)' }}
                            className="border-b border-slate-100/80 last:border-0 group"
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                                  <Users size={14} className="text-blue-500" />
                                </div>
                                <span className="font-mono-data text-[12px] font-bold text-slate-800">{p.patient_code}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-left">
                              <span className="font-mono-data text-[11px] text-slate-500">{format(new Date(p.created_at), 'MMM d, yyyy')}</span>
                              <span className="block font-mono-data text-[9px] text-slate-400">{format(new Date(p.created_at), 'HH:mm')}</span>
                            </td>
                            <td className="px-4 py-4 text-right font-mono-data text-[12px] text-slate-700 font-semibold">{p.age}</td>
                            <td className="px-4 py-4 text-right">
                              <span className={`font-mono-data text-[12px] font-bold ${p.mean_hazard > 1.5 ? 'text-rose-500' : p.mean_hazard > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {p.mean_hazard.toFixed(3)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className={`font-mono-data text-[12px] font-bold ${p.uncertainty_std > 0.8 ? 'text-rose-500' : 'text-slate-600'}`}>
                                {p.uncertainty_std.toFixed(3)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className={`font-mono-data text-[12px] font-bold ${p.day1095_survival < 30 ? 'text-rose-500' : p.day1095_survival < 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {p.day1095_survival.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-mono-data font-bold border ${stageBadgeClass(p.stage)}`}>
                                {p.stage}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <motion.button
                                  whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.08 }}
                                  onClick={() => openEdit(p)}
                                  className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-600 hover:bg-violet-100 transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={14} />
                                </motion.button>
                                <motion.button
                                  whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.08 }}
                                  onClick={() => openDelete(p)}
                                  className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 hover:bg-rose-100 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </motion.button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              {/* Mobile cards */}
              <div className="lg:hidden space-y-3">
                <AnimatePresence>
                  {filtered.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ delay: Math.min(i * 0.04, 0.4) }}
                    >
                      <GlassCard className="rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                              <Users size={15} className="text-blue-500" />
                            </div>
                            <div>
                              <div className="font-mono-data text-[13px] font-bold text-slate-800">{p.patient_code}</div>
                              <div className="font-mono-data text-[9px] text-slate-400">{format(new Date(p.created_at), 'MMM d, yyyy · HH:mm')}</div>
                            </div>
                          </div>
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-mono-data font-bold border ${stageBadgeClass(p.stage)}`}>
                            {p.stage}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 mb-3">
                          <div className="p-2.5 rounded-xl bg-white/50 border border-slate-200/50">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono-data font-semibold">Age</div>
                            <div className="font-mono-data text-[14px] text-slate-700 font-bold mt-0.5">{p.age}</div>
                          </div>
                          <div className="p-2.5 rounded-xl bg-white/50 border border-slate-200/50">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono-data font-semibold">Mean Hazard</div>
                            <div className={`font-mono-data text-[14px] font-bold mt-0.5 ${p.mean_hazard > 1.5 ? 'text-rose-500' : p.mean_hazard > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {p.mean_hazard.toFixed(3)}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-xl bg-white/50 border border-slate-200/50">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono-data font-semibold">σ Uncertainty</div>
                            <div className={`font-mono-data text-[14px] font-bold mt-0.5 ${p.uncertainty_std > 0.8 ? 'text-rose-500' : 'text-slate-600'}`}>
                              {p.uncertainty_std.toFixed(3)}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-xl bg-white/50 border border-slate-200/50">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono-data font-semibold">Day 1095</div>
                            <div className={`font-mono-data text-[14px] font-bold mt-0.5 ${p.day1095_survival < 30 ? 'text-rose-500' : p.day1095_survival < 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {p.day1095_survival.toFixed(1)}%
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-3 border-t border-slate-200/60">
                          <button
                            onClick={() => openEdit(p)}
                            className="flex-1 py-2.5 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center gap-2 text-[11px] font-bold text-violet-600 hover:bg-violet-100 transition-colors"
                          >
                            <Edit size={13} /> Edit
                          </button>
                          <button
                            onClick={() => openDelete(p)}
                            className="flex-1 py-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center gap-2 text-[11px] font-bold text-rose-500 hover:bg-rose-100 transition-colors"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </GlassCard>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Result count */}
            <div className="mt-4 text-center text-[10px] text-slate-400 font-mono-data uppercase tracking-wider">
              Showing {filtered.length} of {patients.length} patients
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      <PatientModal
        open={modalOpen}
        mode={modalMode}
        initial={formInitial}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      {/* Delete confirm */}
      <DeleteConfirm
        open={deleteOpen}
        patient={deleteTarget}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        deleting={deleting}
      />

      {/* Toasts */}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2.5 max-w-sm">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className={`glass-card rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-lg ${t.kind === 'success' ? 'border-emerald-200' : 'border-rose-200'}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.kind === 'success' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                {t.kind === 'success'
                  ? <CheckCircle2 size={16} className="text-emerald-600" />
                  : <AlertCircle size={16} className="text-rose-500" />}
              </div>
              <span className="text-[12px] font-semibold text-slate-700 flex-1">{t.message}</span>
              <button
                onClick={() => setToasts((arr) => arr.filter((x) => x.id !== t.id))}
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
