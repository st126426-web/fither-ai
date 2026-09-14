import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Accent = 'plum' | 'rose' | 'sage' | 'indigo' | 'clay';

export const ACCENTS: { id: Accent; swatch: string }[] = [
  { id: 'plum', swatch: '#8B5FBF' },
  { id: 'rose', swatch: '#BA5378' },
  { id: 'sage', swatch: '#488162' },
  { id: 'indigo', swatch: '#5A6BC4' },
  { id: 'clay', swatch: '#A36643' },
];

const MODE_KEY = 'fither.theme';
const ACCENT_KEY = 'fither.accent';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && allowed.includes(v)) return v;
  } catch { /* private browsing */ }
  return fallback;
}

interface ThemeCtx {
  mode: ThemeMode;
  accent: Accent;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: Accent) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

/**
 * Mode and accent are separate: "system" has to keep following the OS after
 * she picks a colour, so the two cannot share one attribute.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(
    () => read(MODE_KEY, ['system', 'light', 'dark'] as const, 'system'),
  );
  const [accent, setAccentState] = useState<Accent>(
    () => read(ACCENT_KEY, ACCENTS.map((a) => a.id), 'plum'),
  );

  useEffect(() => {
    const root = document.documentElement;
    // No data-theme at all means "follow the OS", which is what the CSS
    // prefers-color-scheme block is written against.
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    root.setAttribute('data-accent', accent);
  }, [mode, accent]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  }, []);

  const setAccent = useCallback((a: Accent) => {
    setAccentState(a);
    try { localStorage.setItem(ACCENT_KEY, a); } catch { /* ignore */ }
  }, []);

  return <Ctx.Provider value={{ mode, accent, setMode, setAccent }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
