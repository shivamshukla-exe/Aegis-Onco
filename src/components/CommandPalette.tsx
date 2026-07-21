import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Search,
  LayoutDashboard,
  Users,
  Dna,
  Server,
  GitCompare,
  BarChart3,
  Plus,
  Activity,
  Keyboard,
  Sparkles,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  X,
  CheckCircle2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command model
// ─────────────────────────────────────────────────────────────────────────────

type Category = 'Navigation' | 'Actions' | 'Quick Info';

interface Command {
  id: string;
  title: string;
  subtitle: string;
  category: Category;
  icon: LucideIcon;
  shortcut?: string;
  keywords?: string;
  perform: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast (self-contained, matches app's existing toast pattern)
// ─────────────────────────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  message: string;
  kind: 'info' | 'success';
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const navigate = useNavigate();

  // ── Toast helper ──
  const pushToast = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  // ── Command registry ──
  const commands = useMemo<Command[]>(() => {
    const closeAnd = (fn: () => void) => () => {
      setOpen(false);
      fn();
    };
    return [
      // Navigation
      {
        id: 'nav-command-center',
        title: 'Go to Command Center',
        subtitle: 'Navigation · Overview dashboard',
        category: 'Navigation',
        icon: LayoutDashboard,
        keywords: 'command center dashboard home overview',
        perform: closeAnd(() => navigate('/')),
      },
      {
        id: 'nav-registry',
        title: 'Go to Patient Registry',
        subtitle: 'Navigation · Patient records',
        category: 'Navigation',
        icon: Users,
        keywords: 'patient registry records list',
        perform: closeAnd(() => navigate('/registry')),
      },
      {
        id: 'nav-genomics',
        title: 'Go to Genomics Explorer',
        subtitle: 'Navigation · Genomic data',
        category: 'Navigation',
        icon: Dna,
        keywords: 'genomics explorer dna genes mutations',
        perform: closeAnd(() => navigate('/genomics')),
      },
      {
        id: 'nav-federated',
        title: 'Go to Federated Learning',
        subtitle: 'Navigation · Distributed training',
        category: 'Navigation',
        icon: Server,
        keywords: 'federated learning distributed training nodes',
        perform: closeAnd(() => navigate('/federated')),
      },
      {
        id: 'nav-simulator',
        title: 'Go to Treatment Simulator',
        subtitle: 'Navigation · Therapy modeling',
        category: 'Navigation',
        icon: GitCompare,
        keywords: 'treatment simulator therapy modeling compare',
        perform: closeAnd(() => navigate('/simulator')),
      },
      {
        id: 'nav-analytics',
        title: 'Go to Analytics',
        subtitle: 'Navigation · Insights & reports',
        category: 'Navigation',
        icon: BarChart3,
        keywords: 'analytics insights reports charts',
        perform: closeAnd(() => navigate('/analytics')),
      },

      // Actions
      {
        id: 'action-register-patient',
        title: 'Register New Patient',
        subtitle: 'Action · Opens registry intake',
        category: 'Actions',
        icon: Plus,
        shortcut: 'N',
        keywords: 'register new patient add create intake',
        perform: closeAnd(() => {
          navigate('/registry');
          // Signal the registry to open its register modal once mounted.
          window.dispatchEvent(new CustomEvent('aegisonco:register-patient'));
        }),
      },
      {
        id: 'action-run-simulation',
        title: 'Run Treatment Simulation',
        subtitle: 'Action · Launch simulator',
        category: 'Actions',
        icon: Activity,
        shortcut: 'R',
        keywords: 'run treatment simulation launch execute',
        perform: closeAnd(() => navigate('/simulator')),
      },
      {
        id: 'action-view-analytics',
        title: 'View Analytics',
        subtitle: 'Action · Open insights',
        category: 'Actions',
        icon: BarChart3,
        shortcut: 'A',
        keywords: 'view analytics insights reports',
        perform: closeAnd(() => navigate('/analytics')),
      },

      // Quick info
      {
        id: 'info-about',
        title: 'What is AegisOnco?',
        subtitle: 'Quick Info · About the platform',
        category: 'Quick Info',
        icon: Sparkles,
        keywords: 'about aegisonco what is help info',
        perform: closeAnd(() =>
          pushToast(
            'AegisOnco is a HIPAA-validated oncology digital-twin platform for federated learning, genomics, and treatment simulation.',
            'info',
          ),
        ),
      },
      {
        id: 'info-shortcuts',
        title: 'Keyboard Shortcuts',
        subtitle: 'Quick Info · Help panel',
        category: 'Quick Info',
        icon: Keyboard,
        shortcut: '?',
        keywords: 'keyboard shortcuts help keys',
        perform: closeAnd(() => setShowHelp(true)),
      },
    ];
  }, [navigate, pushToast]);

  // ── Global cmd+K / ctrl+K listener ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Lock body scroll while open ──
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const contextValue = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <CommandPaletteModal
        open={open}
        onClose={() => setOpen(false)}
        commands={commands}
      />
      <HelpPanel open={showHelp} onClose={() => setShowHelp(false)} />
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </CommandPaletteContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

function CommandPaletteModal({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Focus input on next tick so the element is mounted.
      const id = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Filter commands by query (title, subtitle, keywords).
  const filtered = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const haystack = `${c.title} ${c.subtitle} ${c.category} ${c.keywords ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [commands, query]);

  // Clamp active index when the filtered list changes.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  // Keep the active row scrolled into view.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-cmd-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const execute = useCallback(
    (cmd?: Command) => {
      if (cmd) cmd.perform();
    },
    [],
  );

  // Keyboard handling scoped to the palette.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Group filtered commands by category for sectioned rendering.
  const grouped = useMemo(() => {
    const order: Category[] = ['Navigation', 'Actions', 'Quick Info'];
    const map = new Map<Category, Command[]>();
    filtered.forEach((c) => {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    });
    return order
      .map((cat) => ({ category: cat, items: map.get(cat) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  // Running index across groups so rows stay in sync with activeIndex.
  let runningIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            // Click on the backdrop (this container) closes.
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="relative w-full max-w-[600px] glass-card rounded-2xl border border-slate-200/60 shadow-[0_24px_80px_-12px_rgba(76,29,149,0.35)] overflow-hidden"
            onKeyDown={onKeyDown}
          >
            {/* Search row */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200/60">
              <Search className="text-violet-500 shrink-0" size={18} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Search patients, pages, or actions..."
                className="flex-1 bg-transparent outline-none text-[14px] font-medium text-slate-700 placeholder:text-slate-400"
              />
              <button
                onClick={onClose}
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Close command palette"
              >
                <X size={15} />
              </button>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="text-slate-300 mb-3" size={28} />
                  <p className="text-[12px] font-semibold text-slate-500">No matching commands</p>
                  <p className="text-[10px] text-slate-400 font-mono-data mt-1">
                    Try a different search term
                  </p>
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.category} className="mb-1.5 last:mb-0">
                    <div className="px-3 pt-2 pb-1.5 text-[9px] font-mono-data uppercase tracking-[0.18em] text-slate-400 font-bold">
                      {group.category}
                    </div>
                    {group.items.map((cmd) => {
                      runningIndex += 1;
                      const idx = runningIndex;
                      const active = idx === activeIndex;
                      const Icon = cmd.icon;
                      return (
                        <button
                          key={cmd.id}
                          data-cmd-idx={idx}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => execute(cmd)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-150 ${
                            active
                              ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-[0_6px_18px_-4px_rgba(139,92,246,0.45)]'
                              : 'text-slate-600 hover:bg-violet-50/60'
                          }`}
                        >
                          <span
                            className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                              active ? 'bg-white/20' : 'bg-violet-50'
                            }`}
                          >
                            <Icon
                              size={16}
                              className={active ? 'text-white' : 'text-violet-600'}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block text-[13px] font-semibold truncate ${
                                active ? 'text-white' : 'text-slate-700'
                              }`}
                            >
                              {cmd.title}
                            </span>
                            <span
                              className={`block text-[10px] font-mono-data truncate ${
                                active ? 'text-white/70' : 'text-slate-400'
                              }`}
                            >
                              {cmd.subtitle}
                            </span>
                          </span>
                          {cmd.shortcut && (
                            <kbd
                              className={`shrink-0 hidden sm:inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-[10px] font-mono-data font-bold ${
                                active
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {cmd.shortcut}
                            </kbd>
                          )}
                          {active && (
                            <CornerDownLeft
                              size={14}
                              className="shrink-0 text-white/80 hidden sm:block"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-200/60 bg-slate-50/60">
              <div className="flex items-center gap-1.5 text-[10px] font-mono-data text-slate-500">
                <kbd className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-500">
                  <ArrowUp size={10} />
                </kbd>
                <kbd className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-500">
                  <ArrowDown size={10} />
                </kbd>
                <span className="ml-0.5">to navigate</span>
              </div>
              <span className="text-slate-300">·</span>
              <div className="flex items-center gap-1.5 text-[10px] font-mono-data text-slate-500">
                <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-white border border-slate-200 text-slate-500">
                  ↵
                </kbd>
                <span>to select</span>
              </div>
              <span className="text-slate-300">·</span>
              <div className="flex items-center gap-1.5 text-[10px] font-mono-data text-slate-500">
                <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-white border border-slate-200 text-slate-500">
                  esc
                </kbd>
                <span>to close</span>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono-data text-slate-400">
                <Sparkles size={11} className="text-violet-400" />
                <span>AegisOnco</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Help panel (keyboard shortcuts)
// ─────────────────────────────────────────────────────────────────────────────

const SHORTCUT_ROWS: { keys: string; label: string }[] = [
  { keys: '⌘ / Ctrl + K', label: 'Open command palette' },
  { keys: '↑ / ↓', label: 'Move selection' },
  { keys: '↵', label: 'Execute selected command' },
  { keys: 'esc', label: 'Close palette / panel' },
  { keys: 'N', label: 'Register new patient (in palette)' },
  { keys: 'R', label: 'Run treatment simulation (in palette)' },
  { keys: 'A', label: 'View analytics (in palette)' },
  { keys: '?', label: 'Open this help panel (in palette)' },
];

function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="relative w-full max-w-[480px] glass-card rounded-2xl border border-slate-200/60 shadow-[0_24px_80px_-12px_rgba(76,29,149,0.35)] overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/60">
              <span className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
                <Keyboard size={18} className="text-violet-600" />
              </span>
              <div>
                <h3 className="text-[14px] font-bold tracking-tight text-slate-800">
                  Keyboard Shortcuts
                </h3>
                <p className="text-[9px] text-slate-400 font-mono-data uppercase tracking-[0.18em] mt-0.5">
                  AegisOnco · Productivity
                </p>
              </div>
              <button
                onClick={onClose}
                className="ml-auto shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Close help panel"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-3">
              {SHORTCUT_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 px-2 py-2.5 rounded-lg hover:bg-violet-50/60 transition-colors"
                >
                  <span className="text-[12px] font-semibold text-slate-600">{row.label}</span>
                  <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono-data font-bold text-slate-500">
                    {row.keys}
                  </kbd>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-slate-200/60 bg-slate-50/60 flex items-center gap-1.5 text-[10px] font-mono-data text-slate-400">
              <Sparkles size={11} className="text-violet-400" />
              <span>Press esc to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast stack
// ─────────────────────────────────────────────────────────────────────────────

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="pointer-events-auto flex items-start gap-2.5 glass-card rounded-xl border border-slate-200/60 shadow-[0_12px_40px_-8px_rgba(76,29,149,0.3)] px-4 py-3"
          >
            <CheckCircle2 size={16} className="text-violet-500 shrink-0 mt-0.5" />
            <span className="text-[12px] font-semibold text-slate-700 flex-1 leading-snug">
              {t.message}
            </span>
            <button
              onClick={() => onDismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default CommandPaletteProvider;
