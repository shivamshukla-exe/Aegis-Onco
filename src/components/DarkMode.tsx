import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
 * DarkMode — AegisOnco
 *
 * A dark mode system with React context, localStorage persistence, and an
 * animated pill-shaped toggle. The provider only owns the `dark` class on
 * <html>; the actual dark color tokens live in index.css.
 * ────────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'aegisonco-theme';

export interface DarkModeContextValue {
  isDark: boolean;
  toggle: () => void;
  setDark: (v: boolean) => void;
}

const DarkModeContext = createContext<DarkModeContextValue | null>(null);

/* ── Provider ─────────────────────────────────────────────────────────────── */

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  // Default to light mode. We read localStorage only on mount to avoid a
  // hydration flash and to keep SSR/initial render deterministic.
  const [isDark, setIsDark] = useState<boolean>(false);

  // Restore persisted preference once on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark') setIsDark(true);
      else if (stored === 'light') setIsDark(false);
      // If nothing is stored, default stays light (no change).
    } catch {
      // localStorage may be unavailable (private mode / disabled) — ignore.
    }
  }, []);

  // Apply / remove the `dark` class on <html> and persist the choice.
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');

    try {
      window.localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore write failures (private mode / quota) — class still applied.
    }
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((v) => !v), []);
  const setDark = useCallback((v: boolean) => setIsDark(v), []);

  return (
    <DarkModeContext.Provider value={{ isDark, toggle, setDark }}>
      {children}
    </DarkModeContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useDarkMode(): DarkModeContextValue {
  const ctx = useContext(DarkModeContext);
  if (!ctx) {
    throw new Error('useDarkMode must be used within a <DarkModeProvider>.');
  }
  return ctx;
}

/* ── Toggle ───────────────────────────────────────────────────────────────── */

const TRACK_W = 56; // px — pill width
const TRACK_H = 28; // px — pill height
const KNOB = 22; // px — knob diameter
const PAD = 3; // px — inset padding
// Knob travel distance: track width minus knob minus both-side padding.
const TRAVEL = TRACK_W - KNOB - PAD * 2;

export function DarkModeToggle() {
  const { isDark, toggle } = useDarkMode();

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={toggle}
      // Subtle press feedback.
      whileTap={{ scale: 0.94 }}
      whileHover={{ scale: 1.04 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      style={{
        width: TRACK_W,
        height: TRACK_H,
        // Background cross-fades between amber (light) and violet/indigo (dark).
        background: isDark
          ? 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 55%, #4338ca 100%)'
          : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 55%, #f97316 100%)',
        // Mode-matched glow: warm amber in light, violet in dark.
        boxShadow: isDark
          ? '0 0 0 1px rgba(139,92,246,0.35), 0 4px 18px -4px rgba(139,92,246,0.55), inset 0 1px 1px rgba(255,255,255,0.12)'
          : '0 0 0 1px rgba(245,158,11,0.35), 0 4px 18px -4px rgba(245,158,11,0.55), inset 0 1px 1px rgba(255,255,255,0.4)',
        transition: 'background 0.45s ease, box-shadow 0.45s ease',
      }}
    >
      {/* Soft inner glow that breathes with the mode */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-70"
        style={{
          background: isDark
            ? 'radial-gradient(circle at 78% 50%, rgba(167,139,250,0.45), transparent 60%)'
            : 'radial-gradient(circle at 22% 50%, rgba(254,243,199,0.6), transparent 60%)',
          transition: 'opacity 0.45s ease, background 0.45s ease',
        }}
      />

      {/* Sliding knob — spring layout animation */}
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 550, damping: 32, mass: 0.7 }}
        className="absolute top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
        style={{
          width: KNOB,
          height: KNOB,
          left: PAD,
          // Animate horizontal position via transform so layout + spring fire together.
          x: isDark ? TRAVEL : 0,
          background: isDark
            ? 'linear-gradient(135deg, #ffffff 0%, #e9d5ff 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)',
          boxShadow: isDark
            ? '0 2px 8px rgba(15,23,42,0.45), 0 0 0 1px rgba(139,92,246,0.25), inset 0 1px 1px rgba(255,255,255,0.6)'
            : '0 2px 8px rgba(180,83,9,0.35), 0 0 0 1px rgba(245,158,11,0.3), inset 0 1px 1px rgba(255,255,255,0.8)',
        }}
      >
        {/* Cross-fading icons */}
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.span
              key="moon"
              initial={{ opacity: 0, rotate: -90, scale: 0.4 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.4 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex items-center justify-center"
            >
              <Moon size={13} className="text-violet-700" strokeWidth={2.5} />
            </motion.span>
          ) : (
            <motion.span
              key="sun"
              initial={{ opacity: 0, rotate: 90, scale: 0.4 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -90, scale: 0.4 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex items-center justify-center"
            >
              <Sun size={13} className="text-amber-600" strokeWidth={2.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </motion.button>
  );
}
