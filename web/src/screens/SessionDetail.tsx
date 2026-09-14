import { useState } from 'react';
import { SheetHeader, type TabProps } from '../App.tsx';
import { Card, Empty } from '../components/ui.tsx';
import { api, dayLabel } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';

/** LIVE — Done/Skip writes session state into the active plan row. */
export default function SessionDetail(
  { state, exercises, reload, index, close }: TabProps & { index: number; close: () => void },
) {
  const { t, lang, pick } = useI18n();
  const active = state?.active_plan ?? null;
  const session = active?.plan?.sessions[index] ?? null;
  const [saving, setSaving] = useState(false);

  if (!active || !session) {
    return (
      <div className="sheet">
        <div className="sheet-inner">
          <SheetHeader title={t.sessionDetail} close={close} />
          <Empty icon="🤷‍♀️" title={t.notFound} />
        </div>
      </div>
    );
  }

  const setState = async (next: 'done' | 'skipped') => {
    setSaving(true);
    try {
      await api.setSessionState(active.plan_id, index, session.state === next ? null : next);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet">
      <div className="sheet-inner">
        <SheetHeader
          title={pick(session.title_th, session.title_en)}
          sub={`${dayLabel(session.day, lang)} · ${t.minutes(session.duration_min)}`}
          close={close}
        />

        <main className="page">
          <div className="pill-row">
            <span className="chip brand">{t.exerciseCount(session.exercises.length)}</span>
            <span className="chip">{t.minutes(session.duration_min)}</span>
            {session.state && (
              <span className={`chip ${session.state === 'done' ? 'ok' : ''}`}>
                {session.state === 'done' ? `✓ ${t.stDone}` : t.skippedLabel}
              </span>
            )}
          </div>

          <Card>
            {session.exercises.map((x, i) => {
              const lib = exercises.find((e) => e.id === x.exercise_id);
              const steps = (lang === 'en' ? lib?.steps_en : lib?.steps_th) ?? [];
              const mistake = lang === 'en' ? lib?.mistake_en : lib?.mistake_th;
              return (
                <div
                  key={`${x.exercise_id}-${i}`}
                  className="card-pad col"
                  style={{ gap: 6, borderBottom: i < session.exercises.length - 1 ? '1px solid var(--line)' : 'none' }}
                >
                  <div className="row">
                    <div className="col grow">
                      <span className="title">{pick(lib?.name_th, lib?.name_en) || x.exercise_id}</span>
                      <span className="subtitle">{pick(lib?.name_en, lib?.name_th)}</span>
                    </div>
                    <span className="chip brand">{x.sets} × {x.reps}</span>
                  </div>
                  <span className="subtitle">{t.load}: {x.load_note || t.bodyweight}</span>
                  {/* Beginners need the how, not just the what. */}
                  {!!steps.length && (
                    <div className="howto">
                      <div className="label">{t.howTo}</div>
                      <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
                    </div>
                  )}
                  {mistake && (
                    <div className="mistake">
                      <b>⚠ {t.commonMistake}</b>
                      <span>{mistake}</span>
                    </div>
                  )}
                  {(lib?.tip_th || lib?.tip_en) && (
                    <div className="why" style={{ padding: '9px 11px' }}>
                      <p style={{ fontSize: 12 }}>💡 {pick(lib?.tip_th, lib?.tip_en)}</p>
                    </div>
                  )}
                  {lib?.video_url && (
                    <a
                      className="video-link"
                      href={lib.video_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ▶ {t.watchVideo}
                    </a>
                  )}
                </div>
              );
            })}
          </Card>

          <div className="row" style={{ gap: 10 }}>
            <button
              className="btn"
              disabled={saving}
              style={{ background: session.state === 'done' ? 'var(--ok)' : undefined }}
              onClick={() => setState('done')}
            >
              {session.state === 'done' ? `✓ ${t.doneLabel}` : t.markDone}
            </button>
            <button className="btn ghost" disabled={saving} onClick={() => setState('skipped')}>
              {session.state === 'skipped' ? t.skippedLabel : t.skipToday}
            </button>
          </div>

          <span className="subtitle" style={{ textAlign: 'center' }}>{t.displayOnlyNote}</span>
        </main>
      </div>
    </div>
  );
}
