import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, Send, Sparkles, Activity, Stethoscope } from 'lucide-react';
import { runFullEngine, computeLogHazard } from '../lib/engine';
import {
  DEFAULT_INPUT,
  INTERVENTIONS,
  type PatientInput,
  type Stage,
  type Status,
  type Intervention,
} from '../lib/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  /** Optional comparison table payload rendered below the text. */
  comparison?: ComparisonRow[];
}

interface ComparisonRow {
  intervention: Intervention;
  meanHazard: number;
  medianOS: number | null;
  s1095: number;
  s2000: number;
}

interface ParsedParams {
  age?: number;
  stage?: Stage;
  tumorSize?: number;
  erStatus?: Status;
  prStatus?: Status;
  her2Status?: Status;
  intervention?: Intervention;
}

/* ------------------------------------------------------------------ */
/* Parsing helpers                                                     */
/* ------------------------------------------------------------------ */

function extractAge(text: string): number | undefined {
  const patterns = [
    /(\d{1,3})\s*(?:yo|y\/o|y\.o\.|years?\s*old|year-old)\b/i,
    /\bage\s*(\d{1,3})\b/i,
    /\b(\d{1,3})\s*-?\s*year\s*-?\s*old\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 18 && n <= 120) return n;
    }
  }
  return undefined;
}

function extractStage(text: string): Stage | undefined {
  // Match "stage 0/IV" with roman or arabic numerals, optional "stage" word
  const m = text.match(/\bstage\s*(?:0|I{1,3}V?|IV|V)\b/i);
  if (!m) return undefined;
  const raw = m[0].split(/\s+/).pop()!.toUpperCase();
  const map: Record<string, Stage> = {
    '0': 'Stage 0',
    'I': 'Stage I',
    'II': 'Stage II',
    'III': 'Stage III',
    'IV': 'Stage IV',
    'V': 'Stage IV',
  };
  return map[raw];
}

function extractTumorSize(text: string): number | undefined {
  const patterns = [
    /tumor\s*(?:size\s*)?(?:of\s*)?(\d{1,3}(?:\.\d+)?)\s*(?:mm|millimeters?)?/i,
    /(\d{1,3}(?:\.\d+)?)\s*mm\s*tumor/i,
    /tumou?r\s*(?:is\s*)?(\d{1,3}(?:\.\d+)?)\s*(?:mm|millimeters?)?/i,
    /\btumor\s*size\s*(\d{1,3}(?:\.\d+)?)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = parseFloat(m[1]);
      if (n > 0 && n <= 300) return n;
    }
  }
  return undefined;
}

function extractReceptor(text: string, marker: 'er' | 'pr' | 'her2'): Status | undefined {
  // Build a regex for the marker. HER2 can appear as "HER2", "her2", "her-2", "HER-2".
  let markerPattern: string;
  if (marker === 'her2') {
    markerPattern = 'her[-]?2';
  } else {
    markerPattern = marker;
  }
  const re = new RegExp(`\\b${markerPattern}\\s*(\\+|\\-|positive|negative|pos|neg)\\b`, 'i');
  const m = text.match(re);
  if (!m) {
    // Also match "ER positive" / "ER negative" with a space already covered.
    // Try "ER+" or "ER-" tight forms.
    const re2 = new RegExp(`\\b${markerPattern}[+\\-]\\b`, 'i');
    const m2 = text.match(re2);
    if (m2) {
      const sign = m2[0].slice(-1);
      return sign === '+' ? 'Positive' : 'Negative';
    }
    return undefined;
  }
  const v = m[1].toLowerCase();
  if (v === '+' || v === 'positive' || v === 'pos') return 'Positive';
  if (v === '-' || v === 'negative' || v === 'neg') return 'Negative';
  return undefined;
}

function extractIntervention(text: string): Intervention | undefined {
  const lower = text.toLowerCase();
  if (/\bcocktail\b|\bdouble[- ]agent\b|\bdouble agent\b/.test(lower)) {
    return 'Double-Agent Cocktail';
  }
  if (/\btargeted\b|\bkinase\b|\btargeted kinase\b/.test(lower)) {
    return 'Targeted Kinase Inhibition';
  }
  if (/\bstandard\b|\broutine\b|\bstandard clinical\b/.test(lower)) {
    return 'Standard Clinical Routine';
  }
  return undefined;
}

function parseMessage(text: string): ParsedParams {
  return {
    age: extractAge(text),
    stage: extractStage(text),
    tumorSize: extractTumorSize(text),
    erStatus: extractReceptor(text, 'er'),
    prStatus: extractReceptor(text, 'pr'),
    her2Status: extractReceptor(text, 'her2'),
    intervention: extractIntervention(text),
  };
}

function hasAnyParams(p: ParsedParams): boolean {
  return Object.values(p).some((v) => v !== undefined);
}

/* ------------------------------------------------------------------ */
/* Response generation                                                 */
/* ------------------------------------------------------------------ */

function buildInput(params: ParsedParams): PatientInput {
  return {
    ...DEFAULT_INPUT,
    ...(params.age !== undefined ? { age: params.age } : {}),
    ...(params.stage !== undefined ? { stage: params.stage } : {}),
    ...(params.tumorSize !== undefined ? { tumorSize: params.tumorSize } : {}),
    ...(params.erStatus !== undefined ? { erStatus: params.erStatus } : {}),
    ...(params.prStatus !== undefined ? { prStatus: params.prStatus } : {}),
    ...(params.her2Status !== undefined ? { her2Status: params.her2Status } : {}),
    ...(params.intervention !== undefined ? { intervention: params.intervention } : {}),
  };
}

function describeParams(params: ParsedParams): string {
  const parts: string[] = [];
  if (params.age !== undefined) parts.push(`${params.age}yo`);
  if (params.stage !== undefined) parts.push(params.stage);
  if (params.erStatus !== undefined) parts.push(`ER${params.erStatus === 'Positive' ? '+' : '-'}`);
  if (params.prStatus !== undefined) parts.push(`PR${params.prStatus === 'Positive' ? '+' : '-'}`);
  if (params.her2Status !== undefined) parts.push(`HER2${params.her2Status === 'Positive' ? '+' : '-'}`);
  if (params.tumorSize !== undefined) parts.push(`${params.tumorSize}mm tumor`);
  if (params.intervention !== undefined) parts.push(params.intervention);
  return parts.join(', ');
}

function prognosisLabel(meanHazard: number): string {
  if (meanHazard < 0.5) return 'favorable';
  if (meanHazard < 1.2) return 'moderate';
  if (meanHazard < 2.0) return 'guarded';
  return 'poor';
}

function generatePrognosisResponse(params: ParsedParams): string {
  const input = buildInput(params);
  const result = runFullEngine(input);
  const desc = describeParams(params);
  const label = prognosisLabel(result.meanHazard);

  // Compute hazard reduction of Double-Agent Cocktail vs. current intervention.
  const cocktailInput: PatientInput = { ...input, intervention: 'Double-Agent Cocktail' };
  const cocktailHazard = computeLogHazard(cocktailInput);
  const baseHazard = result.baseLogHazard;
  const reductionPct = baseHazard > 0
    ? Math.round(((baseHazard - cocktailHazard) / baseHazard) * 100)
    : 0;
  const reductionStr = reductionPct > 0
    ? `could reduce the hazard by approximately ${reductionPct}%`
    : 'shows limited additional hazard reduction for this profile';

  const medianStr = result.medianDay !== null
    ? `~${Math.round(result.medianDay).toLocaleString()} days`
    : 'not reached within the model horizon';

  return `Based on the parameters you provided (${desc}), here's the model's projection:

• Mean Log-Hazard: ${result.meanHazard.toFixed(2)}
• Uncertainty (σ): ${result.uncertaintyStd.toFixed(2)}
• Median Overall Survival: ${medianStr}
• 3-Year Survival Probability: ${Math.round(result.s1095)}%
• 5-Year Survival Probability: ${Math.round(result.s2000)}%

Under ${input.intervention}, the prognosis is ${label}. The Double-Agent Cocktail intervention ${reductionStr}. Would you like to see a detailed comparison?`;
}

function generateComparisonResponse(params: ParsedParams): { text: string; rows: ComparisonRow[] } {
  const baseInput = buildInput(params);
  const rows: ComparisonRow[] = INTERVENTIONS.map((intervention) => {
    const input: PatientInput = { ...baseInput, intervention };
    const r = runFullEngine(input);
    return {
      intervention,
      meanHazard: r.meanHazard,
      medianOS: r.medianDay,
      s1095: r.s1095,
      s2000: r.s2000,
    };
  });

  const desc = describeParams(params);
  const best = rows.reduce((a, b) => (b.meanHazard < a.meanHazard ? b : a), rows[0]);
  const worst = rows.reduce((a, b) => (b.meanHazard > a.meanHazard ? b : a), rows[0]);

  const text = `Here's a treatment comparison for ${desc}:

The model projects **${best.intervention}** as the most favorable option (lowest mean log-hazard ${best.meanHazard.toFixed(2)}), while **${worst.intervention}** carries the highest projected hazard (${worst.meanHazard.toFixed(2)}).

Review the table below for survival probabilities across interventions.`;

  return { text, rows };
}

function generateCapabilityResponse(): string {
  return `I'm Aegis AI, your clinical prognostic assistant. I can analyze patient parameters and project outcomes using the AegisOnco prognostic engine.

I understand natural-language clinical descriptions. Try mentioning any of:
• **Age** — e.g. "55yo" or "55 year old"
• **Stage** — e.g. "Stage II", "stage IV"
• **Receptor status** — e.g. "ER+", "HER2-", "PR positive"
• **Tumor size** — e.g. "tumor 30mm"
• **Treatment** — "standard", "targeted", or "cocktail"

Ask me to **compare treatments** for a given patient, or request a prognosis like:
*"What's the prognosis for a 55yo Stage II ER+ patient with a 30mm tumor?"*`;
}

function generateFactorsResponse(): string {
  return `The AegisOnco prognostic engine weighs multiple clinical and molecular factors when computing log-hazard:

**Clinical**
• Age — older age increases baseline hazard
• Tumor size — larger tumors elevate risk
• Lymph node involvement — a strong adverse factor
• NPI (Nottingham Prognostic Index) — composite staging score
• Stage (0–IV) — the dominant anatomical driver
• Grade — higher grade worsens outcome
• Cellularity — high cellularity adds modest risk

**Molecular**
• TP53, EGFR, KRAS, MYC expression — each adds weighted hazard
• Mutation count — burden scales risk
• ER positive — protective (−0.25)
• PR positive — protective (−0.15)
• HER2 positive — adverse (+0.20)

**Intervention**
• Standard Clinical Routine — baseline
• Targeted Kinase Inhibition — reduces hazard by ~0.9
• Double-Agent Cocktail — reduces hazard by ~1.5 (with slightly higher uncertainty)

Ask me to run a projection or compare treatments for a specific patient.`;
}

function generateResponse(text: string): { content: string; comparison?: ComparisonRow[] } {
  const lower = text.toLowerCase();

  // Comparison request
  if (/\bcompar(?:e|ison|ing)\b/.test(lower)) {
    const params = parseMessage(text);
    // For comparisons we still want a meaningful patient; fall back to defaults.
    const { text: t, rows } = generateComparisonResponse(params);
    return { content: t, comparison: rows };
  }

  // Factors / general explanation
  if (/\bfactors?\b|\baffect\b|\binfluence\b/.test(lower) && !hasAnyParams(parseMessage(text))) {
    return { content: generateFactorsResponse() };
  }

  const params = parseMessage(text);
  if (hasAnyParams(params)) {
    return { content: generatePrognosisResponse(params) };
  }

  return { content: generateCapabilityResponse() };
}

/* ------------------------------------------------------------------ */
/* UI constants                                                        */
/* ------------------------------------------------------------------ */

const SUGGESTED_PROMPTS = [
  '55yo Stage II ER+',
  'Compare treatments for 60yo Stage III',
  'What factors affect prognosis?',
];

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'ai',
  content:
    "Hello! I'm Aegis AI, your clinical prognostic assistant. Ask me about patient outcomes, treatment comparisons, or risk factors. Try: \"What's the prognosis for a 55yo Stage II ER+ patient?\"",
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `msg-${Date.now()}-${_idCounter}`;
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom whenever messages or typing state change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 250);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      const userMsg: ChatMessage = { id: nextId(), role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsTyping(true);

      const delay = 600 + Math.random() * 600;
      window.setTimeout(() => {
        const { content, comparison } = generateResponse(trimmed);
        const aiMsg: ChatMessage = { id: nextId(), role: 'ai', content, comparison };
        setMessages((prev) => [...prev, aiMsg]);
        setIsTyping(false);
      }, delay);
    },
    [isTyping],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggested = (prompt: string) => {
    sendMessage(prompt);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 print:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="glass-card-violet glow-violet absolute bottom-[72px] right-0 w-[380px] max-h-[500px] flex flex-col rounded-3xl overflow-hidden shadow-2xl"
            style={{ maxHeight: '500px' }}
          >
            {/* Header */}
            <div className="relative flex items-center gap-3 px-4 py-3.5 border-b border-violet-200/40 bg-gradient-to-r from-violet-50/80 to-purple-50/60">
              <motion.div
                initial={{ scale: 0.7, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-[0_4px_14px_rgba(139,92,246,0.4)]"
              >
                <Brain className="text-white" size={20} />
                <motion.div
                  animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0, 0.7] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 rounded-2xl border-2 border-violet-400"
                />
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[14px] font-extrabold tracking-tight text-slate-800">Aegis AI</h3>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="text-[8px] text-emerald-600 font-mono-data uppercase tracking-[0.18em] font-bold">online</span>
                </div>
                <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.18em] mt-0.5">
                  Clinical Prognostic Assistant
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3 scroll-smooth"
              style={{ scrollbarWidth: 'thin' }}
            >
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}

              <AnimatePresence>
                {isTyping && <TypingIndicator />}
              </AnimatePresence>
            </div>

            {/* Suggested prompts */}
            <div className="px-3.5 pt-1 pb-2 flex flex-wrap gap-1.5 border-t border-slate-200/40 bg-white/30">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleSuggested(p)}
                  disabled={isTyping}
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 hover:border-violet-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Input bar */}
            <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3.5 py-3 border-t border-slate-200/40 bg-white/50">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about prognosis, treatments…"
                  className="w-full bg-white/90 border border-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 rounded-xl px-3.5 py-2.5 text-[12px] text-slate-700 placeholder:text-slate-400 outline-none transition-all shadow-sm"
                />
              </div>
              <motion.button
                type="submit"
                disabled={!input.trim() || isTyping}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                aria-label="Send message"
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-[0_4px_14px_rgba(139,92,246,0.4)] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <Send size={16} />
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        aria-label={open ? 'Close Aegis AI' : 'Open Aegis AI'}
        className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-[0_8px_24px_rgba(139,92,246,0.5)]"
      >
        {/* Pulsing violet glow ring */}
        {!open && (
          <motion.span
            animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-2xl bg-violet-500"
          />
        )}
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="x"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="relative z-10 text-white"
            >
              <X size={24} />
            </motion.span>
          ) : (
            <motion.span
              key="brain"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="relative z-10 text-white"
            >
              <Brain size={24} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Message bubble                                                      */
/* ------------------------------------------------------------------ */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-br-md bg-gradient-to-br from-violet-500 to-purple-600 text-white text-[12px] leading-relaxed shadow-[0_4px_14px_rgba(139,92,246,0.3)]">
          {message.content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex justify-start gap-2"
    >
      <div className="flex-shrink-0 w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm mt-0.5">
        <Sparkles className="text-white" size={13} />
      </div>
      <div className="max-w-[85%]">
        <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-white/80 border border-slate-200/60 text-slate-700 text-[12px] leading-relaxed shadow-sm whitespace-pre-line">
          <FormattedContent text={message.content} />
        </div>
        {message.comparison && <ComparisonTable rows={message.comparison} />}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Lightweight markdown-ish formatting (bold + bullets)               */
/* ------------------------------------------------------------------ */

function FormattedContent({ text }: { text: string }) {
  // Split by lines to preserve bullet structure; render **bold** inline.
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className={line.startsWith('•') ? 'flex gap-1.5' : ''}>
          {line.startsWith('•') && <span className="text-violet-500 font-bold">•</span>}
          <span className={line.startsWith('•') ? 'flex-1' : ''}>
            <InlineBold text={line.replace(/^•\s*/, '')} />
          </span>
        </div>
      ))}
    </>
  );
}

function InlineBold({ text }: { text: string }) {
  // Render **bold** segments.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return (
            <strong key={i} className="font-bold text-slate-800">
              {p.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Comparison table                                                    */
/* ------------------------------------------------------------------ */

function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  const best = rows.reduce((a, b) => (b.meanHazard < a.meanHazard ? b : a), rows[0]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="mt-2 rounded-xl border border-slate-200/60 overflow-hidden bg-white/70"
    >
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-2.5 py-1.5 bg-violet-50/70 border-b border-violet-200/40">
        <span className="text-[8px] font-mono-data uppercase tracking-wider text-violet-600 font-bold">Intervention</span>
        <span className="text-[8px] font-mono-data uppercase tracking-wider text-violet-600 font-bold text-right">Hazard</span>
        <span className="text-[8px] font-mono-data uppercase tracking-wider text-violet-600 font-bold text-right">Med OS</span>
        <span className="text-[8px] font-mono-data uppercase tracking-wider text-violet-600 font-bold text-right">5yr</span>
      </div>
      {rows.map((r) => {
        const isBest = r.intervention === best.intervention;
        return (
          <div
            key={r.intervention}
            className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-2.5 py-1.5 items-center border-b border-slate-100 last:border-b-0 ${
              isBest ? 'bg-emerald-50/60' : 'bg-white/40'
            }`}
          >
            <span className="text-[10px] font-semibold text-slate-700 flex items-center gap-1.5">
              {isBest && <Activity size={10} className="text-emerald-500" />}
              <span className="truncate">{r.intervention}</span>
            </span>
            <span className={`text-[10px] font-mono-data text-right ${isBest ? 'text-emerald-600 font-bold' : 'text-slate-600'}`}>
              {r.meanHazard.toFixed(2)}
            </span>
            <span className="text-[10px] font-mono-data text-right text-slate-600">
              {r.medianOS !== null ? `${Math.round(r.medianOS).toLocaleString()}d` : '—'}
            </span>
            <span className={`text-[10px] font-mono-data text-right ${isBest ? 'text-emerald-600 font-bold' : 'text-slate-600'}`}>
              {Math.round(r.s2000)}%
            </span>
          </div>
        );
      })}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Typing indicator                                                    */
/* ------------------------------------------------------------------ */

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex justify-start gap-2"
    >
      <div className="flex-shrink-0 w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
        <Stethoscope className="text-white" size={13} />
      </div>
      <div className="px-4 py-3.5 rounded-2xl rounded-bl-md bg-white/80 border border-slate-200/60 shadow-sm flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
            className="w-1.5 h-1.5 rounded-full bg-violet-500"
          />
        ))}
      </div>
    </motion.div>
  );
}
