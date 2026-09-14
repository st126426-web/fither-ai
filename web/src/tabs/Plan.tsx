import type { TabProps } from '../App.tsx';
import { Card, Empty, SectionHead } from '../components/ui.tsx';
import { dayBadge, totalSets } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';

/** The demo centrepiece. Everything on this tab is LIVE. */
export default function PlanTab({ state, open }: TabProps) {
  const { t, lang, pick } = useI18n();
  const active = state?.active_plan ?? null;
  const plan = active?.plan ?? null;

  if (!plan || !active) {
    return (
      <main className="page">
        <Empty icon="📋" title={t.noPlanThisWeek} sub={t.noPlanThisWeekSub} />
        <button className="btn" onClick={() => open({ name: 'chat' })}>💬 {t.startChat}</button>
      </main>
    );
  }

  const done = plan.sessions.filter((s) => s.state === 'done').length;

  // Completion % per week from check-ins, for the weeks 1-4 progress strip.
  const weeks = [1, 2, 3, 4].map((w) => ({
    week: w,
    pct: state?.checkins.find((c) => c.week_number === w)?.completion_pct ?? null,
    isCurrent: w === active.week_number,
  }));

  return (
    <main className="page">
      <section className="plan-hero">
        <span className="eyebrow">{t.weekN(active.week_number)}</span>
        <h2>{t.yourPlan}</h2>
        <div className="pill-row">
          <span className="chip brand">{t.totalSets(totalSets(plan))}</span>
          <span className="chip brand">{t.nDays(plan.sessions.length)}</span>
          {done > 0 && <span className="chip ok">✓ {done}/{plan.sessions.length}</span>}
        </div>
        {(active.why_th || active.why_en) && (
          <p style={{ margin: '14px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)' }}>
            {pick(active.why_th, active.why_en)}
          </p>
        )}
      </section>

      <div className="seg">
        <button aria-pressed>{t.viewList}</button>
        <button aria-pressed={false} onClick={() => open({ name: 'schedule' })}>{t.viewCalendar}</button>
      </div>

      <Card>
        {plan.sessions.map((s, i) => (
          <button
            key={`${s.day}-${i}`}
            className="session"
            data-state={s.state ?? undefined}
            onClick={() => open({ name: 'session', index: i })}
          >
            <div className="daybadge">{dayBadge(s.day, lang)}</div>
            <div className="col grow">
              <span className="title">{pick(s.title_th, s.title_en)}</span>
              <span className="subtitle">
                {pick(s.title_en, s.title_th)} · {t.minutes(s.duration_min)} · {t.exerciseCount(s.exercises.length)}
              </span>
            </div>
            <span className="chip" style={{ fontSize: 10.5 }}>
              {s.state === 'done' ? `✓ ${t.stDone}` : s.state === 'skipped' ? t.stSkipped : t.stTodo}
            </span>
          </button>
        ))}
      </Card>

      <section>
        <SectionHead title={t.progress14} />
        <Card>
          <div className="card-pad progress-strip">
            {weeks.map((w) => (
              <div key={w.week} className="progress-week">
                <div className="progress-bar">
                  <div
                    className={`progress-fill${!w.pct ? ' zero' : ''}`}
                    style={{ height: `${Math.max(w.pct ?? 0, 4)}%` }}
                  />
                </div>
                <span style={{ color: w.isCurrent ? 'var(--brand)' : undefined }}>
                  W{w.week}{w.pct !== null ? ` · ${w.pct}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <button className="btn ghost" onClick={() => open({ name: 'history' })}>
        {t.historyLink}
      </button>
    </main>
  );
}
