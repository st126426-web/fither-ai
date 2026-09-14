import type { TabProps } from '../App.tsx';
import { Card, Ring, SectionHead, useComingSoon } from '../components/ui.tsx';
import { CHALLENGES, FEED } from '../lib/mock.ts';
import { dayBadge, goalLabel } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';

export default function HomeTab({ state, go, open }: TabProps) {
  const toast = useComingSoon();
  const { t, lang, pick } = useI18n();
  const name = state?.user?.display_name ?? '';
  const plan = state?.active_plan?.plan ?? null;
  const nextSession = plan?.sessions.find((s) => !s.state) ?? plan?.sessions[0];
  const challenge = CHALLENGES.find((c) => c.state === 'active') ?? CHALLENGES[0];

  return (
    <main className="page">
      {/* LIVE — greeting + streak with forgiveness */}
      <section className="greeting">
        <h2>{name ? t.hello(name) : t.helloAnon}</h2>
        <p>{state?.user?.goal ? t.goalIs(goalLabel(state.user.goal, lang)) : t.welcomeSub}</p>
      </section>

      <div className="pill-row" hidden={!state?.user}>
        <span className="chip brand">🔥 {t.streak(state?.streak.weeks ?? 0)}</span>
        {(state?.streak.forgiven ?? 0) > 0 && <span className="chip">🤍 {t.forgiven}</span>}
        {state?.active_plan && <span className="chip">{t.weekN(state.active_plan.week_number)}</span>}
      </div>

      {/* LIVE — next session */}
      {nextSession ? (
        <Card>
          <div className="card-pad row">
            <div className="daybadge">{dayBadge(nextSession.day, lang)}</div>
            <div className="col grow">
              <span className="subtitle">{t.nextSession}</span>
              <span className="title">{pick(nextSession.title_th, nextSession.title_en)}</span>
              <span className="subtitle">
                {pick(nextSession.title_en, nextSession.title_th)} · {t.minutes(nextSession.duration_min)}
              </span>
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: 0 }}>
            <button className="btn" onClick={() => go('plan')}>{t.seeThisWeek}</button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="card-pad col" style={{ gap: 10 }}>
            <span className="title">{t.noPlanYet}</span>
            <span className="body">{t.noPlanBody}</span>
            <button className="btn" onClick={() => open({ name: 'chat' })}>💬 {t.startChat}</button>
          </div>
        </Card>
      )}

      {/* MOCK — active challenge */}
      <section>
        <SectionHead title={t.activeChallenge} />
        <Card>
          <button
            className="card-pad row"
            style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit' }}
            onClick={() => toast()}
          >
            <Ring
              pct={(challenge.progress / challenge.target) * 100}
              size={52}
              label={`${Math.round((challenge.progress / challenge.target) * 100)}%`}
            />
            <div className="col grow">
              <span className="title">{challenge.badge} {pick(challenge.title_th, challenge.title_en)}</span>
              <span className="subtitle">
                {challenge.progress.toLocaleString()} / {challenge.target.toLocaleString()}{' '}
                {pick(challenge.unit_th, challenge.unit_en)}
              </span>
            </div>
          </button>
        </Card>
      </section>

      {/* MOCK — what's on this week */}
      <section>
        <SectionHead title={t.whatsOn} action={t.viewAll} onAction={() => toast()} />
        <div className="stack">
          {FEED.map((f) => (
            <Card key={f.id}>
              <button
                className="card-pad row"
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit' }}
                onClick={() => toast()}
              >
                <div className="mealthumb" style={{ background: f.tint }} aria-hidden>{f.icon}</div>
                <div className="col grow">
                  <span className="title">{pick(f.title_th, f.title_en)}</span>
                  <span className="body" style={{ fontSize: 12 }}>{pick(f.body_th, f.body_en)}</span>
                </div>
              </button>
            </Card>
          ))}
        </div>
      </section>

      {/* MOCK — quick actions */}
      <section>
        <SectionHead title={t.quickActions} />
        <div className="pill-row">
          <button className="btn ghost sm" onClick={() => open({ name: 'schedule' })}>📅 {t.qaSchedule}</button>
          <button className="btn ghost sm" onClick={() => open({ name: 'history' })}>🕓 {t.qaHistory}</button>
          <button className="btn ghost sm" onClick={() => toast()}>⌚ {t.qaDevice}</button>
          <button className="btn ghost sm" onClick={() => toast()}>💧 {t.qaWater}</button>
        </div>
      </section>
    </main>
  );
}
