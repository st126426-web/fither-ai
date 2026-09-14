import { useI18n, type Lang } from '../lib/i18n.tsx';
import { useTheme } from '../lib/theme.tsx';

/**
 * Public front door — no sign-in, no API calls. Everything here renders from
 * bundled strings, so the landing page works even with the server down.
 */
export default function Landing({ onEnter }: { onEnter: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const L = t.landing;

  return (
    <div className="landing">
      <header className="lp-nav">
        <div className="lp-brand">
          <span className="lp-mark" aria-hidden>F</span>
          <span>FitHer<span className="lp-ai">AI</span></span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="iconbtn"
            aria-label="Toggle dark mode"
            onClick={() => setMode(isDark(mode) ? 'light' : 'dark')}
          >
            {isDark(mode) ? '☀' : '☾'}
          </button>
          <LangToggle lang={lang} setLang={setLang} />
          <button className="btn sm" onClick={onEnter}>{L.nav}</button>
        </div>
      </header>

      <section className="lp-hero">
        <span className="lp-kicker">{L.heroKicker}</span>
        <h1>{L.heroTitle}</h1>
        <p className="lp-lede">{L.heroBody}</p>
        <div className="lp-cta">
          <button className="btn" onClick={onEnter}>{L.ctaPrimary}</button>
          <a
            className="btn ghost"
            href="https://line.me/"
            target="_blank"
            rel="noreferrer"
            style={{ textAlign: 'center', textDecoration: 'none' }}
          >
            {L.ctaSecondary}
          </a>
        </div>
        <span className="lp-fineprint">{L.noSignup}</span>

        <div className="lp-phone" aria-hidden>
          <div className="lp-phone-screen">
            <div className="lp-bubble lp-bubble-in">
              {lang === 'th'
                ? 'สัปดาห์ที่แล้วงานยุ่งมาก ไม่ได้ทำเลยค่ะ'
                : 'Work was mad last week — I did none of it.'}
            </div>
            <div className="lp-bubble lp-bubble-out">
              {lang === 'th'
                ? 'ไม่เป็นไรเลยค่ะ 🙂 สัปดาห์นี้เริ่มใหม่เบาลง 20% ให้ร่างกายค่อย ๆ กลับเข้าจังหวะนะคะ'
                : 'That is completely fine 🙂 This week restarts 20% lighter so your body eases back in.'}
            </div>
            <div className="lp-planchip">
              <strong>{lang === 'th' ? 'สัปดาห์ที่ 2' : 'Week 2'}</strong>
              <span>{lang === 'th' ? '3 วัน · 19 เซตรวม' : '3 days · 19 total sets'}</span>
              <span className="lp-drop">−20.8%</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <h2>{L.howTitle}</h2>
        <div className="lp-steps">
          {L.how.map((s, i) => (
            <div className="lp-step" key={s.t}>
              <span className="lp-step-n">{i + 1}</span>
              <span className="lp-step-ico" aria-hidden>{s.icon}</span>
              <strong>{s.t}</strong>
              <p>{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2>{L.whyTitle}</h2>
        <div className="lp-why">
          {L.why.map((w) => (
            <div className="lp-whycard" key={w.t}>
              <strong>{w.t}</strong>
              <p>{w.b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-safety">
        <span className="lp-safety-ico" aria-hidden>🤝</span>
        <div>
          <strong>{L.safetyTitle}</strong>
          <p>{L.safetyBody}</p>
        </div>
      </section>

      <section className="lp-section lp-preview">
        <h2>{L.previewTitle}</h2>
        <p className="lp-lede">{L.previewBody}</p>
        <button className="btn" onClick={onEnter}>{L.previewCta}</button>
        <span className="lp-fineprint">{L.demoNote}</span>
      </section>

      <footer className="lp-footer">
        <span>FitHer AI · {L.footer}</span>
      </footer>
    </div>
  );
}

/** "system" resolves against the OS so the icon always shows the way out. */
function isDark(mode: string): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="lp-lang" role="group" aria-label="Language">
      <button aria-pressed={lang === 'th'} onClick={() => setLang('th')}>ไทย</button>
      <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}
