import type { TabProps } from '../App.tsx';
import { Card, SectionHead, useComingSoon } from '../components/ui.tsx';
import { COMMUNITIES, EVENTS, formatDate } from '../lib/mock.ts';
import { useI18n } from '../lib/i18n.tsx';

interface VenuePayload {
  name?: string; area?: string; price_tier?: number; vetted?: boolean;
  note?: string | null; note_en?: string | null;
  match_reasons?: string[]; match_reasons_en?: string[];
}

export default function DiscoverTab({ state }: TabProps) {
  const toast = useComingSoon();
  const { t, lang, pick } = useI18n();
  const venue = (state?.venue ?? null) as VenuePayload | null;
  const reasons = (lang === 'en' && venue?.match_reasons_en?.length
    ? venue.match_reasons_en
    : venue?.match_reasons) ?? [];

  return (
    <main className="page">
      {/* LIVE — appears at story beat 4 */}
      <section>
        <SectionHead title={t.recommendedVenue} />
        {venue?.name ? (
          <Card>
            <div className={`venue-banner ${venue.vetted ? 'vetted' : 'unvetted'}`}>
              <b>{venue.vetted ? `✓ ${t.beginnerFriendly}` : `⚠️ ${t.notVetted}`}</b>
            </div>
            <div className="card-pad col" style={{ gap: 8 }}>
              <div className="col">
                <span style={{ fontSize: 17, fontWeight: 800 }}>{venue.name}</span>
                <span className="subtitle">
                  {venue.area}{venue.price_tier ? ` · ${'฿'.repeat(venue.price_tier)}` : ''}
                </span>
              </div>
              {!!reasons.length && (
                <div className="col" style={{ gap: 4 }}>
                  <span className="subtitle" style={{ fontWeight: 700, color: 'var(--brand-ink)' }}>
                    {t.whyThisVenue}
                  </span>
                  {reasons.slice(0, 3).map((r) => (
                    <span key={r} className="body" style={{ fontSize: 12.5 }}>• {r}</span>
                  ))}
                </div>
              )}
              {(venue.note || venue.note_en) && (
                <span className="subtitle">{pick(venue.note, venue.note_en)}</span>
              )}
              <a
                className="btn"
                style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name} ${venue.area ?? ''}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                {t.viewMap}
              </a>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="card-pad col" style={{ gap: 6 }}>
              <span className="title">{t.noVenueYet}</span>
              <span className="body">{t.noVenueBody}</span>
            </div>
          </Card>
        )}
      </section>

      {/* MOCK */}
      <section>
        <SectionHead title={t.communities} action={t.viewAll} onAction={() => toast()} />
        <div className="hscroll">
          {COMMUNITIES.map((c) => (
            <div className="tile" key={c.id}>
              <div className="cover" style={{ background: c.tint }} aria-hidden>🏃‍♀️</div>
              <div className="tile-body">
                <span className="title">{pick(c.name_th, c.name_en)}</span>
                <span className="subtitle">{c.area} · {pick(c.when_th, c.when_en)}</span>
                <span className="body" style={{ fontSize: 11.5 }}>{pick(c.blurb_th, c.blurb_en)}</span>
                <div className="pill-row" style={{ marginTop: 4 }}>
                  <span className="chip" style={{ fontSize: 10.5 }}>{pick(c.level_th, c.level_en)}</span>
                  <span className="chip" style={{ fontSize: 10.5 }}>{t.members(c.members)}</span>
                </div>
                <button className="btn sm" style={{ marginTop: 6, width: '100%' }} onClick={() => toast()}>
                  {t.join}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MOCK */}
      <section>
        <SectionHead title={t.eventsThisMonth} action={t.viewAll} onAction={() => toast()} />
        <div className="stack">
          {EVENTS.map((e) => {
            const [d, mo] = formatDate(e.date, lang).split(' ');
            return (
              <Card key={e.id}>
                <div className="card-pad row">
                  <div
                    className="mealthumb"
                    style={{ background: e.tint, flexDirection: 'column', fontSize: 11, fontWeight: 800, color: 'var(--ink)' }}
                  >
                    {d}
                    <span style={{ fontSize: 9, fontWeight: 600 }}>{mo}</span>
                  </div>
                  <div className="col grow">
                    <span className="title">{pick(e.title_th, e.title_en)}</span>
                    <span className="subtitle">
                      {e.area} · {pick(e.price_th, e.price_en)} · {t.spotsLeft(e.spots_left)}
                    </span>
                  </div>
                  <button className="btn sm" onClick={() => toast()}>{t.signUp}</button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
