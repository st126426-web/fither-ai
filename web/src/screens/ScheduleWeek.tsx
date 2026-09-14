import { useState } from 'react';
import { SheetHeader, type TabProps } from '../App.tsx';
import { Card, Empty } from '../components/ui.tsx';
import { api, DAYS, dayBadge, dayLabel, dayShort, type Day } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';

/**
 * LIVE-lite — tap a session, then tap a day. Rewrites `day` in plan_json only:
 * no regeneration, no validator run.
 */
export default function ScheduleWeek({ state, reload, close }: TabProps & { close: () => void }) {
  const { t, lang, pick } = useI18n();
  const active = state?.active_plan ?? null;
  const plan = active?.plan ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  if (!active || !plan) {
    return (
      <div className="sheet">
        <div className="sheet-inner">
          <SheetHeader title={t.weekSchedule} close={close} />
          <Empty icon="📅" title={t.noPlanToSchedule} />
        </div>
      </div>
    );
  }

  const move = async (day: Day) => {
    if (picked === null) return;
    setSaving(true);
    try {
      await api.moveDay(active.plan_id, picked, day);
      await reload();
      setPicked(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet">
      <div className="sheet-inner">
        <SheetHeader title={t.weekSchedule} sub={t.weekN(active.week_number)} close={close} />

        <main className="page">
          <span className="body">
            {picked === null
              ? t.tapToMove
              : t.movingNow(pick(plan.sessions[picked].title_th, plan.sessions[picked].title_en))}
          </span>

          <Card>
            <div className="card-pad weekgrid">
              {DAYS.map((d) => {
                const idx = plan.sessions.findIndex((s) => s.day === d);
                const s = idx >= 0 ? plan.sessions[idx] : null;
                const isCheckin = d === 'sun';
                const isNextPlan = d === 'mon';
                return (
                  <div className="weekday" key={d}>
                    <span className="dow">{dayShort(d, lang)}</span>
                    <button
                      className={`weekslot${s ? ' filled' : ''}${picked !== null && !s ? ' target' : ''}${!s && (isCheckin || isNextPlan) ? ' marker' : ''}`}
                      disabled={saving}
                      onClick={() => (s ? setPicked(picked === idx ? null : idx) : move(d))}
                      style={picked === idx ? { outline: '2px solid var(--brand)' } : undefined}
                    >
                      {s
                        ? pick(s.title_th, s.title_en)
                        : isCheckin ? `📝 ${t.slotCheckin}`
                          : isNextPlan ? `🔄 ${t.slotNewPlan}` : '+'}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            {plan.sessions.map((s, i) => (
              <button
                key={`${s.day}-${i}`}
                className="session"
                onClick={() => setPicked(picked === i ? null : i)}
                style={picked === i ? { background: 'var(--brand-soft)' } : undefined}
              >
                <div className="daybadge">{dayBadge(s.day, lang)}</div>
                <div className="col grow">
                  <span className="title">{pick(s.title_th, s.title_en)}</span>
                  <span className="subtitle">{dayLabel(s.day, lang)} · {t.minutes(s.duration_min)}</span>
                </div>
                <span className="chip" style={{ fontSize: 10.5 }}>
                  {picked === i ? t.selected : t.move}
                </span>
              </button>
            ))}
          </Card>

          <div className="pill-row">
            <span className="chip">📝 {t.checkinDay}</span>
            <span className="chip">🔄 {t.nextPlanDay}</span>
          </div>
        </main>
      </div>
    </div>
  );
}
