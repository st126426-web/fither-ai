import type { TabProps } from '../App.tsx';
import { Card, SectionHead, useComingSoon } from '../components/ui.tsx';
import { MEALS } from '../lib/mock.ts';
import { goalLabel } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';

const MEAL_ICON: Record<string, string> = {
  breakfast: '🍳', lunch: '🍚', dinner: '🍲', snack: '🥜',
};

/** Entirely MOCK — but held to the same visual bar as the Plan tab. */
export default function MealsTab({ state }: TabProps) {
  const toast = useComingSoon();
  const { t, lang, pick } = useI18n();
  const goal = state?.user?.goal ?? 'strength';
  const matched = MEALS.filter((m) => m.goal === goal);
  const pool = matched.length >= 3 ? matched : MEALS;

  const days = [
    { key: 'today', label: t.today, items: pool.slice(0, 3) },
    { key: 'tomorrow', label: t.tomorrow, items: [...pool.slice(1, 3), ...MEALS.slice(0, 1)] },
    { key: 'dayAfter', label: t.dayAfter, items: MEALS.slice(3, 6) },
  ];

  return (
    <main className="page">
      <section className="greeting">
        <h2>{t.mealsTitle}</h2>
        <p>{goalLabel(goal, lang)} · {t.mealsSub}</p>
      </section>

      <div className="pill-row">
        <span className="chip brand">🎯 {goalLabel(goal, lang)}</span>
        <span className="chip">{t.thaiFirst}</span>
        <span className="chip">{t.proteinTarget}</span>
      </div>

      {days.map((d) => {
        const kcal = d.items.reduce((n, m) => n + m.kcal, 0);
        const protein = d.items.reduce((n, m) => n + m.protein_g, 0);
        return (
          <section key={d.key}>
            <SectionHead title={d.label} sub={`${kcal} kcal · P ${protein} g`} />
            <Card>
              {d.items.map((m, i) => (
                <div
                  className="mealcard"
                  key={`${d.key}-${m.id}-${i}`}
                  style={{ borderBottom: i < d.items.length - 1 ? '1px solid var(--line)' : 'none' }}
                >
                  <div className="mealthumb" style={{ background: m.tint }} aria-hidden>
                    {MEAL_ICON[m.meal] ?? '🍽️'}
                  </div>
                  <div className="col grow">
                    <span className="subtitle">{t.meal[m.meal] ?? m.meal}</span>
                    <span className="title">{pick(m.title_th, m.title_en)}</span>
                    <div className="macros">
                      <span>{m.kcal} kcal</span>
                      <span>P {m.protein_g}g</span>
                      <span>C {m.carb_g}g</span>
                      <span>F {m.fat_g}g</span>
                    </div>
                  </div>
                  <button className="btn ghost sm" onClick={() => toast()}>{t.swap}</button>
                </div>
              ))}
            </Card>
          </section>
        );
      })}

      <Card>
        <div className="card-pad col" style={{ gap: 8 }}>
          <span className="title">📍 {t.findPlaceTitle}</span>
          <span className="body">{t.findPlaceBody}</span>
          <button className="btn" onClick={() => toast()}>{t.findPlaceCta}</button>
        </div>
      </Card>

      <Card>
        <div className="card-pad col" style={{ gap: 8 }}>
          <span className="title">🛒 {t.groceryTitle}</span>
          <span className="body">{t.groceryBody}</span>
          <button className="btn ghost" onClick={() => toast()}>{t.groceryCta}</button>
        </div>
      </Card>
    </main>
  );
}
