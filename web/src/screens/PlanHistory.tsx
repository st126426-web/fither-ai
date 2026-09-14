import { SheetHeader, type TabProps } from '../App.tsx';
import { Card, Empty } from '../components/ui.tsx';
import { useI18n } from '../lib/i18n.tsx';

/**
 * LIVE — the demo's proof moment. The Week-2 missed-week re-plan must visibly
 * show reduced volume here.
 */
export default function PlanHistory({ state, close }: TabProps & { close: () => void }) {
  const { t, lang, pick } = useI18n();
  const history = state?.history ?? [];
  const changes = state?.volume_changes ?? {};

  const statusLabel: Record<string, string> = {
    active: t.stActive, superseded: t.stSuperseded, draft: t.stDraft,
  };

  return (
    <div className="sheet">
      <div className="sheet-inner">
        <SheetHeader title={t.planHistory} sub={t.nPlans(history.length)} close={close} />

        <main className="page">
          {history.length === 0 ? (
            <Empty icon="🕓" title={t.noHistory} />
          ) : (
            history.map((h) => {
              const delta = changes[h.plan_id];
              const down = delta !== null && delta !== undefined && delta < 0;
              return (
                <Card key={h.plan_id}>
                  <div className="card-pad col" style={{ gap: 9 }}>
                    <div className="row">
                      <div className="col grow">
                        <span className="title">{t.weekN(h.week_number)}</span>
                        <span className="subtitle">
                          {new Date(h.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH')}
                          {' · '}{t.nDays(h.sessions)}
                          {h.engine ? ` · ${h.engine}` : ''}
                        </span>
                      </div>
                      <span className={`chip ${h.status === 'active' ? 'ok' : ''}`} style={{ fontSize: 10.5 }}>
                        {statusLabel[h.status] ?? h.status}
                      </span>
                    </div>

                    <div className="row" style={{ gap: 10 }}>
                      <span className="chip brand">{t.totalSets(h.volume_total_sets)}</span>
                      {delta !== null && delta !== undefined && (
                        <span className={`chip ${down ? 'ok' : 'warn'}`}>
                          {down ? '↓' : '↑'} {t.fromLastWeek(Math.abs(delta))}
                        </span>
                      )}
                    </div>

                    {(h.why_th || h.why_en) && (
                      <div className="why" style={{ padding: '10px 12px' }}>
                        <div className="label">{t.whatChanged}</div>
                        <p style={{ fontSize: 12.5 }}>{pick(h.why_th, h.why_en)}</p>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}
