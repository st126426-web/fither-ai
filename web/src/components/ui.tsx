import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEMO_POLISH } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';

// ── coming-soon toast ────────────────────────────────────────────────────
const ToastCtx = createContext<(msg?: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const { t } = useI18n();

  const show = useCallback((m?: string) => {
    // Suppressed for screenshots and demo video so the app looks shipped.
    if (DEMO_POLISH) return;
    setMsg(m ?? t.comingSoon);
    window.setTimeout(() => setMsg(null), 1600);
  }, [t]);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}

/** Every button in a MOCK section calls this. */
export function useComingSoon() {
  return useContext(ToastCtx);
}

// ── primitives ───────────────────────────────────────────────────────────
export function SectionHead({ title, sub, action, onAction }: {
  title: string; sub?: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {sub && <span className="en">{sub}</span>}
      {action && <button className="more" onClick={onAction}>{action}</button>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Ring({ pct, size = 44, stroke = 4, color = 'var(--brand)', label }: {
  pct: number; size?: number; stroke?: number; color?: string; label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${(c * clamped) / 100} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>{label ?? `${Math.round(clamped)}%`}</span>
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 34 }: {
  values: number[]; width?: number; height?: number;
}) {
  const path = useMemo(() => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * (width - 4) + 2;
        const y = height - 3 - ((v - min) / span) * (height - 8);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [values, width, height]);

  return (
    <svg width={width} height={height} aria-hidden>
      <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Empty({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div>{title}</div>
      {sub && <div style={{ fontSize: 11, marginTop: 4, opacity: .75 }}>{sub}</div>}
    </div>
  );
}

export function Avatar({ initials, tint, size = 46 }: { initials: string; tint: string; size?: number }) {
  return (
    <div className="coachav" style={{ background: tint, width: size, height: size }} aria-hidden>
      {initials}
    </div>
  );
}
