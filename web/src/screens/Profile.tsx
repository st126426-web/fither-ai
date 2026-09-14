import { useState } from 'react';
import { SheetHeader, type TabProps } from '../App.tsx';
import { Card, SectionHead, Sparkline, useComingSoon } from '../components/ui.tsx';
import { BODY_STATS } from '../lib/mock.ts';
import {
  api, equipmentLabel, eventLabel, experienceLabel, goalLabel, lifeStageLabel, toneLabel,
} from '../lib/api.ts';
import { useI18n, type Lang } from '../lib/i18n.tsx';
import { ACCENTS, useTheme, type ThemeMode } from '../lib/theme.tsx';

const GOALS = ['strength', 'fat_loss', 'energy', 'habit'];
const DAYS_OPTS = [2, 3, 4, 5];
const MINUTES_OPTS = [20, 30, 45, 60];
const EQUIPMENT_OPTS = ['bodyweight', 'mat', 'dumbbell', 'treadmill', 'bench', 'resistance_band', 'box'];
const EXPERIENCE_OPTS = ['beginner', 'returning', 'intermediate'];
const LIFE_STAGE_OPTS = ['none', 'postpartum', 'perimenopause', 'pregnant'];
const TONE_OPTS = ['gentle', 'balanced', 'firm'];

export default function Profile(
  { state, reload, close, userId }: TabProps & { close: () => void; userId: string },
) {
  const toast = useComingSoon();
  const { t, lang, setLang, pick } = useI18n();
  const { mode, accent, setMode, setAccent } = useTheme();
  const u = state?.user;

  const [name, setName] = useState(u?.display_name ?? '');
  const [goal, setGoal] = useState(u?.goal ?? 'strength');
  const [days, setDays] = useState(u?.days_per_week ?? 3);
  const [minutes, setMinutes] = useState(u?.session_minutes ?? 45);
  const [equipment, setEquipment] = useState<string[]>(u?.equipment ?? ['bodyweight']);
  const [experience, setExperience] = useState(u?.experience ?? 'beginner');
  const [lifeStage, setLifeStage] = useState(u?.life_stage ?? 'none');
  const [coachTone, setCoachTone] = useState(u?.coach_tone ?? 'balanced');
  const [language, setLanguage] = useState<Lang>((u?.language as Lang) ?? lang);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleEquipment = (e: string) =>
    setEquipment((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  // Switch the UI immediately — waiting for a save to see your own language
  // change feels broken.
  const chooseLanguage = (l: Lang) => { setLanguage(l); setLang(l); };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateProfile(userId, {
        display_name: name.trim() || undefined,
        goal, days_per_week: days, session_minutes: minutes,
        equipment, experience, life_stage: lifeStage, coach_tone: coachTone, language,
      });
      await reload();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3500);
    } finally {
      setSaving(false);
    }
  };

  const resetAll = async () => {
    if (!window.confirm(t.deleteConfirm)) return;
    await api.reset(userId);
    await reload();
    close();
  };

  const weights = BODY_STATS.weight_kg;
  const delta = (weights[weights.length - 1].value - weights[0].value).toFixed(1);

  return (
    <div className="sheet">
      <div className="sheet-inner">
        <SheetHeader title={t.profile} sub={u?.display_name ?? ''} close={close} />

        <main className="page">
          {/* LIVE — training profile editor */}
          <section>
            <SectionHead title={t.trainingProfile} sub="LIVE" />
            <Card>
              <div className="card-pad col" style={{ gap: 16 }}>
                <div className="field">
                  <label htmlFor="pf-name">{t.fName}</label>
                  <input
                    id="pf-name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.fNamePlaceholder}
                    maxLength={40}
                  />
                </div>

                <div className="field">
                  <label>{t.fGoal}</label>
                  <div className="optrow">
                    {GOALS.map((g) => (
                      <button key={g} className="opt" aria-pressed={goal === g} onClick={() => setGoal(g)}>
                        {goalLabel(g, lang)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>{t.fDays}</label>
                  <div className="optrow">
                    {DAYS_OPTS.map((d) => (
                      <button key={d} className="opt" aria-pressed={days === d} onClick={() => setDays(d)}>
                        {t.nDays(d)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>{t.fMinutes}</label>
                  <div className="optrow">
                    {MINUTES_OPTS.map((m) => (
                      <button key={m} className="opt" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                        {t.minutes(m)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>{t.fEquipment}</label>
                  <div className="optrow">
                    {EQUIPMENT_OPTS.map((e) => (
                      <button key={e} className="opt" aria-pressed={equipment.includes(e)} onClick={() => toggleEquipment(e)}>
                        {equipmentLabel(e, lang)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>{t.fExperience}</label>
                  <div className="optrow">
                    {EXPERIENCE_OPTS.map((e) => (
                      <button key={e} className="opt" aria-pressed={experience === e} onClick={() => setExperience(e)}>
                        {experienceLabel(e, lang)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>{t.fLifeStage}</label>
                  <div className="optrow">
                    {LIFE_STAGE_OPTS.map((l) => (
                      <button key={l} className="opt" aria-pressed={lifeStage === l} onClick={() => setLifeStage(l)}>
                        {lifeStageLabel(l, lang)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>{t.fTone}</label>
                  <span className="hint">{t.fToneHint}</span>
                  <div className="optrow">
                    {TONE_OPTS.map((x) => (
                      <button key={x} className="opt" aria-pressed={coachTone === x} onClick={() => setCoachTone(x)}>
                        {toneLabel(x, lang)}
                      </button>
                    ))}
                  </div>
                </div>

                {(u?.target_weeks || u?.target_event) && (
                  <div className="field">
                    <label>{t.fTimeframe}</label>
                    <div className="pill-row">
                      {u.target_weeks && <span className="chip brand">{t.weeksN(u.target_weeks)}</span>}
                      {u.target_event && <span className="chip">{u.target_event}</span>}
                    </div>
                  </div>
                )}

                {u?.motivation && (
                  <div className="field">
                    <label>{t.fMotivation}</label>
                    <span className="body" style={{ fontSize: 12.5 }}>“{u.motivation}”</span>
                  </div>
                )}

                <div className="field">
                  <label>{t.fLanguage}</label>
                  <div className="optrow">
                    <button className="opt" aria-pressed={language === 'th'} onClick={() => chooseLanguage('th')}>ไทย</button>
                    <button className="opt" aria-pressed={language === 'en'} onClick={() => chooseLanguage('en')}>English</button>
                  </div>
                </div>

                <button className="btn" onClick={save} disabled={saving}>
                  {saving ? t.saving : t.save}
                </button>

                {saved && (
                  <div className="why" style={{ padding: '10px 12px' }}>
                    <p style={{ fontSize: 12.5 }}>✓ {t.savedAppliesNext}</p>
                    <p className="en">{t.savedAppliesNextEn}</p>
                  </div>
                )}
              </div>
            </Card>
          </section>

          {/* LIVE — what she told the coach about herself */}
          {(u?.age || u?.height_cm || u?.weight_kg) && (
            <section>
              <SectionHead title={t.fAbout} sub="LIVE" />
              <Card>
                <div className="card-pad col" style={{ gap: 10 }}>
                  <span className="hint">{t.fAboutHint}</span>
                  <div className="pill-row">
                    {u.age && <span className="chip">{t.fAge}: {u.age}</span>}
                    {u.height_cm && <span className="chip">{t.fHeight}: {u.height_cm}</span>}
                    {u.weight_kg && <span className="chip">{t.fWeight}: {u.weight_kg}</span>}
                    {u.bmi && <span className="chip">BMI {u.bmi}</span>}
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* LIVE — the coaching constraints the agent programmes around */}
          {(u?.injuries || u?.dislikes || u?.train_time || u?.sleep_hours) && (
            <section>
              <SectionHead title={t.fCoachNotes} sub="LIVE" />
              <Card>
                <div className="card-pad col" style={{ gap: 9 }}>
                  {u.injuries && (
                    <div className="col"><span className="subtitle">{t.fInjuries}</span>
                      <span className="body" style={{ fontSize: 12.5 }}>{u.injuries}</span></div>
                  )}
                  {u.dislikes && (
                    <div className="col"><span className="subtitle">{t.fDislikes}</span>
                      <span className="body" style={{ fontSize: 12.5 }}>{u.dislikes}</span></div>
                  )}
                  <div className="pill-row">
                    {u.train_time && <span className="chip">{t.fTrainTime}: {u.train_time}</span>}
                    {u.sleep_hours && <span className="chip">{t.fSleep}: {t.hoursN(u.sleep_hours)}</span>}
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* MOCK — body stats */}
          <section>
            <SectionHead title={t.bodyStats} />
            <Card>
              <div className="card-pad row">
                <div className="col grow">
                  <span className="subtitle">{t.latestWeight}</span>
                  <span style={{ fontSize: 24, fontWeight: 800 }}>
                    {weights[weights.length - 1].value} {t.kg}
                  </span>
                  <span className="subtitle">{t.over5w(delta)}</span>
                </div>
                <Sparkline values={weights.map((w) => w.value)} />
              </div>
              <div style={{ borderTop: '1px solid var(--line)' }}>
                {BODY_STATS.measurements.map((m) => (
                  <div className="setting" key={m.label_en}>
                    <div className="col grow">
                      <span className="title">{pick(m.label_th, m.label_en)}</span>
                      <span className="subtitle">{pick(m.label_en, m.label_th)}</span>
                    </div>
                    <span className="chip">{m.value} {m.unit}</span>
                    <span className={`chip ${m.delta < 0 ? 'ok' : ''}`} style={{ fontSize: 10.5 }}>
                      {m.delta > 0 ? '+' : ''}{m.delta}
                    </span>
                  </div>
                ))}
              </div>
              <div className="card-pad">
                <button className="btn ghost" onClick={() => toast()}>{t.addMeasurement}</button>
              </div>
            </Card>
          </section>

          {/* LIVE — journey timeline from events */}
          <section>
            <SectionHead title={t.myJourney} sub="LIVE" />
            <Card>
              <div className="card-pad">
                {state?.events.length ? (
                  <div className="timeline">
                    {state.events.slice(0, 12).map((e) => (
                      <div className={`tl-item${e.type === 'red_flag_handoff' ? ' flag' : ''}`} key={e.id}>
                        <span className="title">{eventLabel(e.type, lang)}</span>
                        <div className="subtitle">
                          {new Date(e.created_at).toLocaleString(lang === 'en' ? 'en-GB' : 'th-TH', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                        {typeof e.payload?.why_th === 'string' && (
                          <div className="body" style={{ fontSize: 12, marginTop: 3 }}>
                            {e.payload.why_th as string}
                          </div>
                        )}
                        {typeof e.payload?.volume_total_sets === 'number' && (
                          <div className="subtitle">{t.totalSets(e.payload.volume_total_sets as number)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="body">{t.noEvents}</span>
                )}
              </div>
            </Card>
          </section>

          {/* Appearance — local to this device, no server round-trip */}
          <section>
            <SectionHead title={t.appearance} />
            <Card>
              <div className="card-pad col" style={{ gap: 16 }}>
                <div className="field">
                  <label>{t.themeMode}</label>
                  <div className="seg">
                    {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => (
                      <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                        {m === 'system' ? t.themeSystem : m === 'light' ? t.themeLight : t.themeDark}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>{t.themeAccent}</label>
                  <div className="swatches">
                    {ACCENTS.map((a) => (
                      <button
                        key={a.id}
                        className="swatch"
                        style={{ background: a.swatch }}
                        aria-pressed={accent === a.id}
                        aria-label={t.accentNames[a.id] ?? a.id}
                        title={t.accentNames[a.id] ?? a.id}
                        onClick={() => setAccent(a.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* MOCK — settings */}
          <section>
            <SectionHead title={t.settings} />
            <Card>
              <div className="setting">
                <div className="col grow">
                  <span className="title">{t.sNotif}</span>
                  <span className="subtitle">{t.sNotifSub}</span>
                </div>
                <button className="btn ghost sm" onClick={() => toast()}>{t.sConfigure}</button>
              </div>
              <div className="setting">
                <div className="col grow">
                  <span className="title">{t.sDevices}</span>
                  <span className="subtitle">Garmin · Apple Health</span>
                </div>
                <button className="btn ghost sm" onClick={() => toast()}>{t.sConnect}</button>
              </div>
              <div className="setting">
                <div className="col grow">
                  <span className="title">{t.sPlanTier}</span>
                  <span className="subtitle">{t.sPlanTierSub}</span>
                </div>
                <span className="chip brand">{t.sFree}</span>
              </div>
              <div className="setting">
                <div className="col grow">
                  <span className="title">{t.sPrivacy}</span>
                  <span className="subtitle">{t.sPrivacySub}</span>
                </div>
              </div>
            </Card>
          </section>

          {/* LIVE — delete my data */}
          <button className="btn danger" onClick={resetAll}>{t.deleteAll}</button>
          <span className="subtitle" style={{ textAlign: 'center' }}>{t.deleteAllSub}</span>
        </main>
      </div>
    </div>
  );
}
