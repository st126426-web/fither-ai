import { useCallback, useEffect, useState } from 'react';
import { api, type AppState, type Exercise } from './lib/api.ts';
import { useI18n } from './lib/i18n.tsx';
import { ToastProvider } from './components/ui.tsx';
import HomeTab from './tabs/Home.tsx';
import PlanTab from './tabs/Plan.tsx';
import DiscoverTab from './tabs/Discover.tsx';
import MealsTab from './tabs/Meals.tsx';
import CoachTab from './tabs/Coach.tsx';
import Landing, { LangToggle } from './screens/Landing.tsx';
import Chat from './screens/Chat.tsx';
import Profile from './screens/Profile.tsx';
import SessionDetail from './screens/SessionDetail.tsx';
import ScheduleWeek from './screens/ScheduleWeek.tsx';
import PlanHistory from './screens/PlanHistory.tsx';

export type TabId = 'home' | 'plan' | 'discover' | 'meals' | 'coach';
export type Screen =
  | { name: 'profile' }
  | { name: 'session'; index: number }
  | { name: 'schedule' }
  | { name: 'history' }
  | { name: 'chat' }
  | null;

export interface TabProps {
  state: AppState | null;
  exercises: Exercise[];
  offline: boolean;
  reload: () => void;
  go: (tab: TabId) => void;
  open: (screen: Screen) => void;
}

const TAB_IDS: TabId[] = ['home', 'plan', 'discover', 'meals', 'coach'];
const TAB_ICONS: Record<TabId, string> = {
  home: '🏠', plan: '📋', discover: '🧭', meals: '🥗', coach: '👩‍🏫',
};

type Route = { view: 'landing' } | { view: 'app'; userId: string; tab: TabId };

function parseHash(): Route {
  const m = window.location.hash.match(/^#\/u\/([^/]+)(?:\/(\w+))?/);
  if (!m) return { view: 'landing' };
  const tab = (TAB_IDS.includes(m[2] as TabId) ? m[2] : 'home') as TabId;
  return { view: 'app', userId: m[1], tab };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route.view === 'landing') {
    return <Landing onEnter={() => { window.location.hash = '#/u/mind/home'; }} />;
  }
  return <AppShell userId={route.userId} tab={route.tab} />;
}

function AppShell({ userId, tab }: { userId: string; tab: TabId }) {
  const { t, lang, setLang } = useI18n();
  const [screen, setScreen] = useState<Screen>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [s, ex] = await Promise.all([api.state(userId), api.exercises()]);
      setState(s);
      setExercises(ex);
      setOffline(false);
    } catch {
      // MOCK tabs must keep working with the API down.
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void reload(); }, [reload]);

  // The profile carries the user's saved language; adopt it once on load so
  // the app matches what she chose on LINE.
  const savedLang = state?.user?.language;
  useEffect(() => {
    if (savedLang === 'th' || savedLang === 'en') setLang(savedLang);
  }, [savedLang, setLang]);

  const go = useCallback((next: TabId) => {
    window.location.hash = `#/u/${userId}/${next}`;
    setScreen(null);
  }, [userId]);

  const props: TabProps = { state, exercises, offline, reload, go, open: setScreen };

  return (
    <ToastProvider>
      <div className="shell">
        <header className="appbar">
          <button
            className="iconbtn"
            onClick={() => { window.location.hash = '#/'; }}
            aria-label="FitHer"
          >
            ←
          </button>
          <div className="col grow">
            <h1>{t.appName}</h1>
            <span className="sub">{t.tabs[tab]}</span>
          </div>
          <LangToggle lang={lang} setLang={setLang} />
          <button className="avatar" onClick={() => setScreen({ name: 'profile' })} aria-label={t.profileAria}>
            {(state?.user?.display_name ?? 'M').slice(0, 1)}
          </button>
        </header>

        {offline && <div className="offline">{t.offline}</div>}

        {loading && !state ? (
          <div className="page">
            <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
          </div>
        ) : (
          <>
            {tab === 'home' && <HomeTab {...props} />}
            {tab === 'plan' && <PlanTab {...props} />}
            {tab === 'discover' && <DiscoverTab {...props} />}
            {tab === 'meals' && <MealsTab {...props} />}
            {tab === 'coach' && <CoachTab {...props} />}
          </>
        )}

        <nav className="tabbar">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              aria-current={id === tab ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <span className="ico" aria-hidden>{TAB_ICONS[id]}</span>
              {t.tabs[id]}
            </button>
          ))}
        </nav>

        {!screen && (
          <button className="chat-fab" onClick={() => setScreen({ name: 'chat' })}>
            <span aria-hidden>💬</span>{t.chatFab}
          </button>
        )}

        {screen?.name === 'chat' && (
          <Chat onboarded={state?.onboarded ?? false} onChanged={reload} close={() => setScreen(null)} />
        )}
        {screen?.name === 'profile' && (
          <Profile {...props} close={() => setScreen(null)} userId={userId} />
        )}
        {screen?.name === 'session' && (
          <SessionDetail {...props} index={screen.index} close={() => setScreen(null)} />
        )}
        {screen?.name === 'schedule' && <ScheduleWeek {...props} close={() => setScreen(null)} />}
        {screen?.name === 'history' && <PlanHistory {...props} close={() => setScreen(null)} />}
      </div>
    </ToastProvider>
  );
}

export function SheetHeader({ title, sub, close }: { title: string; sub?: string; close: () => void }) {
  const { t } = useI18n();
  return (
    <header className="appbar">
      <button className="iconbtn" onClick={close}>← {t.back}</button>
      <div className="col grow" style={{ alignItems: 'flex-end' }}>
        <h1 style={{ fontSize: 15 }}>{title}</h1>
        {sub && <span className="sub">{sub}</span>}
      </div>
    </header>
  );
}
