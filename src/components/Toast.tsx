import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ToastOptions {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

type ToastContextValue = {
  toast: (opts: ToastOptions) => void;
  dismiss: (id: string) => void;
};

/* ------------------------------------------------------------------ */
/* Per-type visual config (aligned with ui.tsx ACCENT aesthetic)      */
/* ------------------------------------------------------------------ */

type ToastType = ToastOptions['type'];

interface ToastStyle {
  Icon: LucideIcon;
  border: string;        // colored left border
  iconWrap: string;      // soft icon chip
  iconText: string;
  bar: string;           // progress bar gradient
  glow: string;          // ambient glow class (from ui.tsx)
}

const STYLES: Record<ToastType, ToastStyle> = {
  success: {
    Icon: CheckCircle2,
    border: 'border-l-emerald-500',
    iconWrap: 'bg-emerald-50 border border-emerald-200',
    iconText: 'text-emerald-600',
    bar: 'from-emerald-400 to-teal-500',
    glow: 'glow-emerald',
  },
  error: {
    Icon: AlertCircle,
    border: 'border-l-rose-500',
    iconWrap: 'bg-rose-50 border border-rose-200',
    iconText: 'text-rose-500',
    bar: 'from-rose-400 to-pink-600',
    glow: 'glow-rose',
  },
  info: {
    Icon: Info,
    border: 'border-l-blue-500',
    iconWrap: 'bg-blue-50 border border-blue-200',
    iconText: 'text-blue-600',
    bar: 'from-blue-500 to-indigo-600',
    glow: 'glow-violet',
  },
  warning: {
    Icon: AlertTriangle,
    border: 'border-l-amber-500',
    iconWrap: 'bg-amber-50 border border-amber-200',
    iconText: 'text-amber-600',
    bar: 'from-amber-400 to-orange-500',
    glow: 'glow-amber',
  },
};

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 4;
const DEFAULT_DURATION = 4000;

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const duration = opts.duration ?? DEFAULT_DURATION;
    const item: ToastItem = { ...opts, id, duration };

    setToasts((prev) => {
      const next = [...prev, item];
      // Cap at MAX_VISIBLE — drop the oldest in-place.
      if (next.length > MAX_VISIBLE) {
        const removed = next.shift()!;
        const handle = timers.current.get(removed.id);
        if (handle) {
          clearTimeout(handle);
          timers.current.delete(removed.id);
        }
      }
      return next;
    });

    const handle = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, handle);
  }, [dismiss]);

  // Cleanup any pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((h) => clearTimeout(h));
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Viewport — fixed top-right stack                                    */
/* ------------------------------------------------------------------ */

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 w-[340px] max-w-[calc(100vw-2rem)] pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Single toast card                                                   */
/* ------------------------------------------------------------------ */

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const s = STYLES[item.type];
  const duration = item.duration ?? DEFAULT_DURATION;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={`pointer-events-auto relative overflow-hidden rounded-2xl glass-card border-l-4 ${s.border} ${s.glow}`}
      role="status"
    >
      <div className="flex items-start gap-3 p-3.5 pr-9">
        {/* Icon chip */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.05 }}
          className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${s.iconWrap}`}
        >
          <s.Icon className={s.iconText} size={16} strokeWidth={2.4} />
        </motion.div>

        {/* Text */}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[12px] font-bold tracking-tight text-slate-800 leading-snug">
            {item.title}
          </p>
          {item.message && (
            <p className="text-[11px] text-slate-500 font-mono-data leading-snug mt-0.5 break-words">
              {item.message}
            </p>
          )}
        </div>

        {/* Close */}
        <button
          onClick={() => onDismiss(item.id)}
          aria-label="Dismiss notification"
          className="absolute top-2.5 right-2.5 w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200/40">
        <motion.div
          className={`h-full bg-gradient-to-r ${s.bar}`}
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
        />
      </div>
    </motion.div>
  );
}

export default ToastProvider;
