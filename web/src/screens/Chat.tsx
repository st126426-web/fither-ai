import { useEffect, useRef, useState } from 'react';
import { API_BASE, dayBadge, dayLabel } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import QuickSetup from '../components/QuickSetup.tsx';

export interface QuickAction { label_th: string; label_en: string; data: string }

interface ChatSession {
  index: number; day: string; title_th: string; title_en: string;
  duration_min: number; exercise_count: number;
}

export type ChatCard =
  | {
    kind: 'plan'; plan_id: string; week_number: number;
    why_th: string | null; why_en: string | null;
    volume_total_sets: number; delta_vs_prev_pct: number | null;
    sessions: ChatSession[];
  }
  | { kind: 'checkin'; week_number: number; sessions: ChatSession[] }
  | {
    kind: 'venue'; name: string; area: string; price_tier: number; vetted: boolean;
    note_th: string | null; note_en: string | null;
    reasons_th: string[]; reasons_en: string[];
  }
  | { kind: 'handoff' }
  | {
    kind: 'mock_list'; title_th: string; title_en: string;
    subtitle_th: string; subtitle_en: string; accent: string;
    rows: { title_th: string; title_en: string; sub_th: string; sub_en: string; badge?: string }[];
    deep_link: string;
  };

export interface AgentMessage {
  text_th: string;
  text_en?: string;
  quick_replies?: QuickAction[];
  card?: ChatCard;
}

type Bubble =
  | { from: 'me'; text: string }
  | { from: 'coach'; msg: AgentMessage };

/**
 * In-app chat. Posts to /api/chat, which runs the same router, the same
 * conversation state and the same safety gate as the LINE webhook — so a
 * conversation can move between the two surfaces mid-flow.
 */
export default function Chat(
  { onboarded, onChanged, close }:
  { onboarded: boolean; onChanged: () => void; close: () => void },
) {
  const { t, lang, pick } = useI18n();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bubbles, busy]);

  // A brand-new user should be greeted, not shown a blank box with buttons.
  // The coach opens the conversation and asks the first question itself.
  const greeted = useRef(false);
  useEffect(() => {
    if (onboarded || greeted.current) return;
    greeted.current = true;
    void send({ type: 'follow' });
    // send is stable enough for this one-shot greeting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarded]);

  const send = async (
    payload: { text?: string; data?: string; type?: 'text' | 'postback' | 'follow' },
    echo?: string,
  ) => {
    if (busy) return;
    setBusy(true);
    if (echo) setBubbles((b) => [...b, { from: 'me', text: echo }]);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const { messages } = await res.json() as { messages: AgentMessage[] };
      setBubbles((b) => [...b, ...messages.map((msg) => ({ from: 'coach' as const, msg }))]);
      // The coach may have written a plan, a check-in or an event.
      onChanged();
    } catch {
      setBubbles((b) => [...b, { from: 'coach', msg: { text_th: t.chatError, text_en: t.chatError } }]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    void send({ text }, text);
  };

  // Only the newest coach message keeps its quick replies tappable.
  const lastCoach = [...bubbles].reverse().find((b) => b.from === 'coach') as
    { from: 'coach'; msg: AgentMessage } | undefined;

  return (
    <div className="sheet chat-sheet">
      <div className="sheet-inner chat-inner">
        <header className="appbar">
          <button className="iconbtn" onClick={close}>← {t.back}</button>
          <div className="col grow" style={{ alignItems: 'flex-end' }}>
            <h1 style={{ fontSize: 15 }}>{t.chatTitle}</h1>
            <span className="sub">{t.chatSub}</span>
          </div>
        </header>

        <div className="chat-log">
          {bubbles.length === 0 && !busy && (
            <div className="chat-intro">
              <div className="chat-intro-ico" aria-hidden>💬</div>
              <p>{onboarded ? t.chatIntro : t.chatIntroNew}</p>
              {onboarded && (
                <div className="pill-row" style={{ justifyContent: 'center' }}>
                  <button className="btn ghost sm" onClick={() => send({ data: 'action=plan' }, t.chatAskPlan)}>
                    {t.chatAskPlan}
                  </button>
                  <button className="btn ghost sm" onClick={() => send({ data: 'action=checkin' }, t.chatAskCheckin)}>
                    {t.chatAskCheckin}
                  </button>
                  <button className="btn ghost sm" onClick={() => send({ type: 'follow' }, t.chatStart)}>
                    {t.chatStart}
                  </button>
                </div>
              )}
            </div>
          )}

          {bubbles.map((b, i) => (
            b.from === 'me' ? (
              <div className="chat-row me" key={i}><div className="chat-bubble me">{b.text}</div></div>
            ) : (
              <div className="chat-row" key={i}>
                <div className="col" style={{ gap: 8, maxWidth: '100%' }}>
                  {b.msg.text_th && (
                    <div className="chat-bubble coach">{pick(b.msg.text_th, b.msg.text_en)}</div>
                  )}
                  {b.msg.card && <CardView card={b.msg.card} />}
                  {b.msg === lastCoach?.msg && !!b.msg.quick_replies?.length && (
                    <div className="chat-quick">
                      {b.msg.quick_replies.map((q) => (
                        <button
                          key={q.data}
                          disabled={busy}
                          onClick={() => send({ data: q.data }, lang === 'en' ? q.label_en : q.label_th)}
                        >
                          {lang === 'en' ? q.label_en : q.label_th}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          ))}

          {busy && (
            <div className="chat-row">
              <div className="chat-bubble coach typing"><span /><span /><span /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {!onboarded && <QuickSetup />}

        <form className="chat-input" onSubmit={submit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.chatPlaceholder}
            aria-label={t.chatPlaceholder}
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send">➤</button>
        </form>
      </div>
    </div>
  );
}

function CardView({ card }: { card: ChatCard }) {
  const { t, lang, pick } = useI18n();

  if (card.kind === 'plan') {
    return (
      <div className="chat-card">
        <div className="chat-card-head">
          <strong>{t.weekN(card.week_number)}</strong>
          <span className="chip brand" style={{ fontSize: 10.5 }}>{t.totalSets(card.volume_total_sets)}</span>
          {card.delta_vs_prev_pct !== null && (
            <span className={`chip ${card.delta_vs_prev_pct <= 0 ? 'ok' : 'warn'}`} style={{ fontSize: 10.5 }}>
              {card.delta_vs_prev_pct > 0 ? '+' : ''}{card.delta_vs_prev_pct}%
            </span>
          )}
        </div>
        {(card.why_th || card.why_en) && (
          <div className="why" style={{ padding: '9px 11px', margin: '0 0 8px' }}>
            <div className="label">{t.whyLabel}</div>
            <p style={{ fontSize: 12 }}>{pick(card.why_th, card.why_en)}</p>
          </div>
        )}
        {card.sessions.map((s) => (
          <div className="chat-card-row" key={s.index}>
            <div className="daybadge" style={{ width: 34, height: 34, fontSize: 11 }}>
              {dayBadge(s.day, lang)}
            </div>
            <div className="col grow">
              <span className="title" style={{ fontSize: 13 }}>{pick(s.title_th, s.title_en)}</span>
              <span className="subtitle">
                {t.minutes(s.duration_min)} · {t.exerciseCount(s.exercise_count)}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (card.kind === 'checkin') {
    return (
      <div className="chat-card">
        <div className="chat-card-head"><strong>{t.weekN(card.week_number)}</strong></div>
        {card.sessions.map((s) => (
          <div className="chat-card-row" key={s.index}>
            <div className="col grow">
              <span className="title" style={{ fontSize: 13 }}>{pick(s.title_th, s.title_en)}</span>
              <span className="subtitle">{dayLabel(s.day, lang)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (card.kind === 'venue') {
    const reasons = lang === 'en' ? card.reasons_en : card.reasons_th;
    return (
      <div className="chat-card">
        <div className={`venue-banner ${card.vetted ? 'vetted' : 'unvetted'}`} style={{ margin: '-12px -12px 10px' }}>
          <b>{card.vetted ? `✓ ${t.beginnerFriendly}` : `⚠️ ${t.notVetted}`}</b>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <strong style={{ fontSize: 15 }}>{card.name}</strong>
          <span className="subtitle">
            {card.area}{card.price_tier ? ` · ${'฿'.repeat(card.price_tier)}` : ''}
          </span>
          {reasons.slice(0, 3).map((r) => (
            <span key={r} className="body" style={{ fontSize: 12 }}>• {r}</span>
          ))}
          {(card.note_th || card.note_en) && (
            <span className="subtitle">{pick(card.note_th, card.note_en)}</span>
          )}
        </div>
      </div>
    );
  }

  if (card.kind === 'handoff') {
    return (
      <div className="chat-card" style={{ borderColor: 'var(--ok)' }}>
        <strong>🤝 {t.handoffTitle}</strong>
        <p className="body" style={{ fontSize: 12, margin: '6px 0 0' }}>{t.handoffBody}</p>
      </div>
    );
  }

  return (
    <div className="chat-card" style={{ background: card.accent }}>
      <div className="chat-card-head"><strong>{pick(card.title_th, card.title_en)}</strong></div>
      {card.rows.map((r) => (
        <div className="chat-card-row" key={r.title_en}>
          <div className="col grow">
            <span className="title" style={{ fontSize: 13 }}>{pick(r.title_th, r.title_en)}</span>
            <span className="subtitle">{pick(r.sub_th, r.sub_en)}</span>
          </div>
          {r.badge && <span className="chip brand" style={{ fontSize: 10 }}>{r.badge}</span>}
        </div>
      ))}
    </div>
  );
}
