import type { TabProps } from '../App.tsx';
import { Avatar, Card, Ring, SectionHead, useComingSoon } from '../components/ui.tsx';
import { COACHES } from '../lib/mock.ts';
import { useI18n } from '../lib/i18n.tsx';

/**
 * MOCK, with one LIVE behaviour: a red-flag event flips this tab into the
 * human-coach handoff state.
 */
export default function CoachTab({ state }: TabProps) {
  const toast = useComingSoon();
  const { t, lang, pick } = useI18n();

  return (
    <main className="page">
      {state?.coach_handoff && (
        <Card>
          <div className="venue-banner vetted">
            <b>🤝 {t.handoffTitle}</b>
          </div>
          <div className="card-pad col" style={{ gap: 6 }}>
            <span className="body">{t.handoffBody}</span>
          </div>
        </Card>
      )}

      <section className="greeting">
        <h2>{t.coachTitle}</h2>
        <p>{t.coachSub}</p>
      </section>

      <section>
        <SectionHead title={t.topMatches} />
        <Card>
          {COACHES.map((c) => (
            <div className="coachrow" key={c.id}>
              <Avatar
                initials={lang === 'en' ? (c.name_en.split(' ').pop() ?? '?').slice(0, 1) : c.initials}
                tint={c.tint}
              />
              <div className="col grow">
                <span className="title">{pick(c.name_th, c.name_en)}</span>
                <span className="subtitle">
                  {pick(c.specialty_th, c.specialty_en)} · {c.area} · {t.years(c.years)}
                </span>
                <div className="pill-row" style={{ marginTop: 4 }}>
                  {(lang === 'en' ? c.style_tags_en : c.style_tags_th).slice(0, 2).map((tag) => (
                    <span className="chip" style={{ fontSize: 10 }} key={tag}>{tag}</span>
                  ))}
                </div>
                <span className="subtitle" style={{ marginTop: 4, fontWeight: 700, color: 'var(--ink-2)' }}>
                  {pick(c.price_th, c.price_en)}
                </span>
              </div>
              <div className="col" style={{ alignItems: 'center', gap: 8 }}>
                <Ring pct={c.match_pct} size={44} label={`${c.match_pct}%`} />
                <button className="btn sm" onClick={() => toast()}>{t.talkFirst}</button>
              </div>
            </div>
          ))}
        </Card>
      </section>

      <Card>
        <div className="card-pad col" style={{ gap: 8 }}>
          <span className="title">{t.notSureTitle}</span>
          <span className="body">{t.notSureBody}</span>
          <button className="btn ghost" onClick={() => toast()}>{t.notSureCta}</button>
        </div>
      </Card>
    </main>
  );
}
