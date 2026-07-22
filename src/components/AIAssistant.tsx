import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, Send, Sparkles } from 'lucide-react';
import { runFullEngine } from '../lib/engine';
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
  surrogateScore: number;
  medianDemoDay: number | null;
  day1095DemoSurvival: number;
  day2000DemoSurvival: number;
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

function generateScenarioResponse(params: ParsedParams): string {
  const input = buildInput(params);
  const result = runFullEngine(input);
  const desc = describeParams(params) || 'default synthetic inputs';
  const medianStr = result.medianDay !== null
    ? `${Math.round(result.medianDay).toLocaleString()} demo days`
    : 'not reached within the synthetic curve horizon';

  return `For the synthetic inputs (${desc}), the deterministic UI surrogate produces:

• Surrogate score: ${result.meanSurrogateScore.toFixed(2)}
• Seeded variation (σ): ${result.variationStd.toFixed(2)}
• Synthetic median-curve point: ${medianStr}
• Day-1095 synthetic curve value: ${Math.round(result.s1095)}%
• Day-2000 synthetic curve value: ${Math.round(result.s2000)}%

These values come from hand-authored browser equations, not notebook weights, clinical evidence, a prognosis model, or a treatment-effect estimator. They must not guide diagnosis or therapy.`;
}

function generateComparisonResponse(params: ParsedParams): { text: string; rows: ComparisonRow[] } {
  const baseInput = buildInput(params);
  const rows: ComparisonRow[] = INTERVENTIONS.map((intervention) => {
    const input: PatientInput = { ...baseInput, intervention };
    const result = runFullEngine(input);
    return {
      intervention,
      surrogateScore: result.meanSurrogateScore,
      medianDemoDay: result.medianDay,
      day1095DemoSurvival: result.s1095,
      day2000DemoSurvival: result.s2000,
    };
  });

  const desc = describeParams(params) || 'default synthetic inputs';
  const text = `Here is a non-causal sensitivity table for ${desc}.

Each named scenario applies an arbitrary offset to the same browser surrogate. Lower or higher numbers do not indicate treatment benefit, comparative effectiveness, or a recommendation. The displayed curve values are synthetic UI outputs.`;

  return { text, rows };
}

function generateCapabilityResponse(): string {
  return `I'm Aegis AI, a scripted assistant for this synthetic research UI. I can parse demo inputs and explain the deterministic browser surrogate.

Try mentioning any of:
• **Age** — e.g. "55yo"
• **Stage field** — e.g. "Stage II"
• **Receptor field** — e.g. "ER+"
• **Tumor-size field** — e.g. "30mm"
• **Scenario label** — "standard", "targeted", or "cocktail"

I can show non-causal scenario sensitivity, but I cannot provide a diagnosis, prognosis, treatment effect, or medical recommendation.`;
}

function generateFactorsResponse(): string {
  return `The browser surrogate uses hand-authored coefficients for interface demonstration only.

**Synthetic input groups**
• Age, tumor size, lymph-node count, NPI, stage field, grade, and cellularity
• TP53, EGFR, KRAS, and MYC demo expression values
• Mutation count and receptor-status fields
• A named scenario offset

The coefficients are not fitted METABRIC model weights and have no clinical interpretation. Scenario offsets are arbitrary and do not represent treatment benefit. Use the Kaggle benchmark artifacts—not this UI surrogate—for reproducible model research once those artifacts have been generated and integrated.`;
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
    return { content: generateScenarioResponse(params) };
  }

  return { content: generateCapabilityResponse() };
}

/* ------------------------------------------------------------------ */
/* UI constants                                                        */
/* ------------------------------------------------------------------ */

const SUGGESTED_PROMPTS = [
  'Explain the UI surrogate',
  'Compare demo scenarios for 60yo Stage III',
  'What inputs affect the demo score?',
];

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'ai',
  content:
    "Hello! I'm Aegis AI, a scripted synthetic-research assistant. I can explain demo inputs and non-causal scenario sensitivity. I cannot provide diagnosis, prognosis, medical advice, or treatment recommendations.",
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
                  Scripted Research-Demo Assistant
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
                  placeholder="Ask about demo inputs or scenario sensitivity…"
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="mt-2 rounded-xl border border-slate-200/60 overflow-hidden bg-white/70"
    >
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-2.5 py-1.5 bg-violet-50/70 border-b border-violet-200/40">
        <span className="text-[8px] font-mono-data uppercase tracking-wider text-violet-600 font-bold">Scenario</span>
        <span className="text-[8px] font-mono-data uppercase tracking-wider text-violet-600 font-bold text-right">Score</span>
        <span className="text-[8px] font-mono-data uppercase tracking-wider text-violet-600 font-bold text-right">Demo day</span>
        <span className="text-[8px] font-mono-data uppercase tracking-wider text-violet-600 font-bold text-right">Day 2000</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.intervention}
          className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-2.5 py-1.5 items-center border-b border-slate-100 last:border-b-0 bg-white/40"
        >
          <span className="text-[10px] font-semibold text-slate-700 truncate">{row.intervention}</span>
          <span className="text-[10px] font-mono-data text-right text-slate-600">{row.surrogateScore.toFixed(2)}</span>
          <span className="text-[10px] font-mono-data text-right text-slate-600">
            {row.medianDemoDay !== null ? `${Math.round(row.medianDemoDay).toLocaleString()}d` : '—'}
          </span>
          <span className="text-[10px] font-mono-data text-right text-slate-600">
            {Math.round(row.day2000DemoSurvival)}%
          </span>
        </div>
      ))}
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
        <Sparkles className="text-white" size={13} />
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
