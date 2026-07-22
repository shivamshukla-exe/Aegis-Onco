import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'aegisonco-theme';

export interface DarkModeContextValue {
  isDark: boolean;
  toggle: () => void;
  setDark: (value: boolean) => void;
}

const DarkModeContext = createContext<DarkModeContextValue | null>(null);

function getInitialDarkMode() {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
  } catch {
    // Storage is optional; fall through to the operating-system preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function DarkModeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(getInitialDarkMode);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      window.localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // The selected theme still works when storage is unavailable.
    }
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((value) => !value), []);
  const setDark = useCallback((value: boolean) => setIsDark(value), []);
  const contextValue = useMemo(() => ({ isDark, toggle, setDark }), [isDark, toggle, setDark]);

  return (
    <MotionConfig reducedMotion="user">
      <DarkModeContext.Provider value={contextValue}>
        {children}
      </DarkModeContext.Provider>
    </MotionConfig>
  );
}

export function useDarkMode(): DarkModeContextValue {
  const context = useContext(DarkModeContext);
  if (!context) throw new Error('useDarkMode must be used within a <DarkModeProvider>.');
  return context;
}

export function DarkModeToggle() {
  const { isDark, toggle } = useDarkMode();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Use light appearance' : 'Use dark appearance'}
      title={isDark ? 'Use light appearance' : 'Use dark appearance'}
      onClick={toggle}
      className="relative h-10 w-12 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    >
      <span className="absolute left-0 top-1/2 h-7 w-12 -translate-y-1/2 rounded-full border border-slate-300 bg-slate-100 shadow-inner transition-colors" aria-hidden="true">
        <Sun size={12} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-amber-600" />
        <Moon size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-violet-600" />
        <motion.span
          initial={false}
          animate={{ x: isDark ? 23 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          className="absolute top-[2px] flex h-[22px] w-[22px] items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"
        >
          {isDark
            ? <Moon size={12} className="text-violet-700" />
            : <Sun size={12} className="text-amber-600" />}
        </motion.span>
      </span>
    </button>
  );
}