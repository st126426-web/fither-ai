import type { Config } from '../config.ts';
import type { CheckinPayload, Day, Plan } from '../engine/types.ts';
import { runCoach } from '../engine/index.ts';
import { EXERCISE_BY_ID, MIND } from '../lib/seed.ts';
import { detectLang, nowIso, parseJson, uid } from '../lib/util.ts';
import { scanRedFlags, totalSets } from '../safety/validator.ts';
import { missingFields } from '../tools/profile.ts';
import type { Storage } from '../storage/types.ts';
import coaches from '../../seed/mock/coaches.json';
import meals from '../../seed/mock/meals.json';
import type { AgentMessage, ChatEvent, ChatSessionSummary } from './types.ts';

/** How many turns of context the agent gets. Enough to stay coherent, small enough to stay cheap. */
const HISTORY_TURNS = 10;

type Turn = { role: 'user' | 'coach'; text: string };

/**
 * The single conversation spine — surface-neutral in and out, so LINE and the
 * in-app chat are two renderers rather than two code paths, sharing one
 * conversation state row.
 *
 * Onboarding is **agentic**: there is no question script here. When required
 * profile fields are missing, her message goes to the agent with intent
 * `onboard`, and the agent asks, extracts and records via `save_profile` until
 * nothing is missing — then it plans. The only thing this router decides is
 * which intent applies.
 */
export async function routeChat(
  storage: Storage,
  cfg: Config,
  event: ChatEvent,
): Promise<AgentMessage[]> {
  const userId = await resolveUserId(storage, event);

  if (event.type === 'follow') {
    await setHistory(storage, userId, []);
    await storage.insertEvent({
      id: uid('ev'), user_id: userId, type: 'joined',
      payload_json: JSON.stringify({ source: event.source }), created_at: nowIso(),
    });
    return respond(storage, cfg, userId, 'onboard', undefined, undefined);
  }

  const params = event.data ? new URLSearchParams(event.data) : null;
  const action = params?.get('action');
  const text = event.text?.trim() ?? '';

  if (action === 'checkin_all' || action === 'checkin_session') {
    return handleCheckin(storage, cfg, userId, params!);
  }

  switch (action) {
    case 'plan': return showPlan(storage, userId);
    case 'checkin': return startCheckin(storage, userId);
    case 'meals': return [mealsCard()];
    case 'coach': return [coachCard()];
    case 'web': return [{
      text_th: 'เปิดเว็บแอปจากเมนูด้านล่างได้เลยค่ะ',
      text_en: 'Open the web app from the menu below.',
    }];
    case 'restart':
      await setHistory(storage, userId, []);
      return respond(storage, cfg, userId, 'onboard', undefined, undefined);
    case 'find_gym':
      return respond(storage, cfg, userId, 'find_gym', text || 'อยากลองไปยิม', {});
    // A tapped choice chip is her saying those words. It joins the ordinary
    // free-text path rather than getting a parser of its own, so the engine
    // cannot tell a tap from typing and there is nothing to keep in sync.
    case 'say':
      return freeText(storage, cfg, userId, params?.get('text')?.trim() ?? '');
    default: break;
  }

  return freeText(storage, cfg, userId, text);
}

/** Everything she types, once the postback actions have had their say. */
async function freeText(
  storage: Storage,
  cfg: Config,
  userId: string,
  text: string,
): Promise<AgentMessage[]> {
  const user = await storage.getUser(userId);
  const missing = missingFields(user);
  const hasPlan = !!(await storage.getActivePlan(userId));

  // Onboarding is not over when the profile fills up — it is over when she has
  // a plan. If the agent spent the last turn asking an optional question, the
  // profile was already complete and this would have fallen through to
  // freeform, where the prompt forbids planning, and the first week would never
  // have been built.
  if (missing.length > 0 || !hasPlan) {
    return respond(storage, cfg, userId, 'onboard', text, undefined);
  }

  switch (intentFromText(text)) {
    case 'find_gym': return respond(storage, cfg, userId, 'find_gym', text, {});
    case 'checkin': return startCheckin(storage, userId);
    case 'plan': return showPlan(storage, userId);
    case 'meals': return [mealsCard()];
    case 'coach': return [coachCard()];
    case 'restart':
      await setHistory(storage, userId, []);
      return respond(storage, cfg, userId, 'onboard', undefined, undefined);
    default:
      return respond(storage, cfg, userId, 'freeform', text, undefined);
  }
}

/** Runs the agent with conversation history, then records the turn. */
async function respond(
  storage: Storage,
  cfg: Config,
  userId: string,
  intent: 'onboard' | 'freeform' | 'find_gym' | 'weekly_replan',
  message: string | undefined,
  payload: Record<string, unknown> | undefined,
): Promise<AgentMessage[]> {
  const history = await getHistory(storage, userId);

  // She sets the language by writing in it. Persist it so the app follows too.
  const user = await storage.getUser(userId);
  const locale = message ? detectLang(message) : ((user?.language as 'th' | 'en') ?? 'th');
  if (user && message && user.language !== locale) {
    await storage.updateUserProfile(userId, { language: locale });
  }

  const result = await runCoach(storage, cfg, {
    user_id: userId,
    intent,
    source: 'line',
    locale,
    message,
    payload: payload as never,
    history,
  });

  const head: AgentMessage = { text_th: result.reply.text_th, text_en: result.reply.text_en };
  if (result.reply.quick_replies?.length) head.quick_replies = result.reply.quick_replies;

  const nextHistory = [...history];
  if (message) nextHistory.push({ role: 'user', text: message });
  nextHistory.push({ role: 'coach', text: result.reply.text_th });
  await setHistory(storage, userId, nextHistory.slice(-HISTORY_TURNS));

  if (result.status === 'blocked_safety') {
    return [head, { text_th: '', card: { kind: 'handoff' } }];
  }

  if (result.artifacts.venue) {
    const v = result.artifacts.venue;
    head.card = {
      kind: 'venue',
      name: v.name, area: v.area, price_tier: v.price_tier, vetted: v.vetted,
      note_th: v.note ?? null, note_en: v.note_en ?? null,
      reasons_th: v.match_reasons, reasons_en: v.match_reasons_en ?? v.match_reasons,
      lat: v.lat, lng: v.lng,
    };
    return [head];
  }

  if (result.artifacts.plan) {
    const row = await storage.getPlan(result.artifacts.plan.plan_id);
    const plan = parseJson<Plan | null>(row?.plan_json, null);
    if (plan) {
      head.card = {
        kind: 'plan',
        plan_id: result.artifacts.plan.plan_id,
        week_number: result.artifacts.plan.week_number,
        why_th: result.artifacts.plan.why_th,
        why_en: result.artifacts.plan.why_en,
        volume_total_sets: result.artifacts.plan.volume_total_sets,
        delta_vs_prev_pct: result.artifacts.plan.delta_vs_prev_pct,
        sessions: summarise(plan),
      };
    }
  }

  return [head];
}

// ── conversation history ────────────────────────────────────────────────
async function getHistory(storage: Storage, userId: string): Promise<Turn[]> {
  const conv = await storage.getConversation(userId);
  return parseJson<{ history?: Turn[] }>(conv?.draft_json, {}).history ?? [];
}

async function setHistory(storage: Storage, userId: string, history: Turn[]): Promise<void> {
  await storage.setConversation({
    user_id: userId,
    step: 'chat',
    draft_json: JSON.stringify({ history }),
    updated_at: nowIso(),
  });
}

// ── check-in ────────────────────────────────────────────────────────────
async function handleCheckin(
  storage: Storage, cfg: Config, userId: string, params: URLSearchParams,
): Promise<AgentMessage[]> {
  const active = await storage.getActivePlan(userId);
  if (!active) {
    return [{
      text_th: 'ยังไม่มีแผนที่ใช้งานอยู่ค่ะ ทักมาคุยกันก่อนได้เลยนะคะ',
      text_en: 'There is no active plan yet — say hello and we will build one.',
    }];
  }
  const plan = parseJson<Plan | null>(active.plan_json, null);
  if (!plan) return [{ text_th: 'ขออภัยค่ะ อ่านแผนไม่สำเร็จ', text_en: 'Sorry — could not read the plan.' }];

  const state = (params.get('state') ?? 'skipped') as 'done' | 'partial' | 'skipped';
  const sessions: { day: Day; state: 'done' | 'partial' | 'skipped' }[] =
    params.get('action') === 'checkin_all'
      ? plan.sessions.map((s) => ({ day: s.day, state }))
      : plan.sessions.map((s, i) => ({
        day: s.day,
        state: i === Number(params.get('i')) ? state : 'skipped',
      }));

  const payload: CheckinPayload = { week_number: active.week_number, sessions };
  const flags = scanRedFlags(payload.notes);

  await storage.insertCheckin({
    id: uid('chk'),
    user_id: userId,
    week_number: active.week_number,
    completion_json: JSON.stringify(sessions),
    rpe_avg: null, sleep_1to5: null, energy_1to5: null,
    notes: payload.notes ?? null,
    flags_json: JSON.stringify(flags),
    created_at: nowIso(),
  });
  await storage.insertEvent({
    id: uid('ev'), user_id: userId, type: 'checkin_recorded',
    payload_json: JSON.stringify({ week_number: active.week_number, sessions }),
    created_at: nowIso(),
  });

  return respond(storage, cfg, userId, 'weekly_replan', undefined, payload as never);
}

async function startCheckin(storage: Storage, userId: string): Promise<AgentMessage[]> {
  const active = await storage.getActivePlan(userId);
  const plan = parseJson<Plan | null>(active?.plan_json, null);
  if (!active || !plan) {
    return [{ text_th: 'ยังไม่มีแผนให้เช็คอินค่ะ', text_en: 'No plan to check in against yet.' }];
  }
  return [{
    text_th: `สัปดาห์ที่ ${active.week_number} เป็นอย่างไรบ้างคะ`,
    text_en: `How did week ${active.week_number} go?`,
    card: { kind: 'checkin', week_number: active.week_number, sessions: summarise(plan) },
    quick_replies: [
      { label_th: 'ทำครบทุกวัน', label_en: 'Did them all', data: 'action=checkin_all&state=done' },
      { label_th: 'ทำได้บางวัน', label_en: 'Some of them', data: 'action=checkin_session&i=0&state=done' },
      { label_th: 'สัปดาห์นี้ไม่ได้ทำเลย', label_en: 'Missed the whole week', data: 'action=checkin_all&state=skipped' },
    ],
  }];
}

async function showPlan(storage: Storage, userId: string): Promise<AgentMessage[]> {
  const active = await storage.getActivePlan(userId);
  const plan = parseJson<Plan | null>(active?.plan_json, null);
  if (!active || !plan) {
    return [{
      text_th: 'ยังไม่มีแผนค่ะ ทักมาคุยกันสักครู่ แล้วเราจะจัดให้นะคะ',
      text_en: 'No plan yet — chat with me for a minute and I will build one.',
    }];
  }
  return [{
    text_th: `แผนสัปดาห์ที่ ${active.week_number} ค่ะ`,
    text_en: `Here is week ${active.week_number}.`,
    card: {
      kind: 'plan',
      plan_id: active.id,
      week_number: active.week_number,
      why_th: active.why_text_th,
      why_en: active.why_text_en,
      volume_total_sets: totalSets(plan),
      delta_vs_prev_pct: null,
      sessions: summarise(plan),
    },
  }];
}

function summarise(plan: Plan): ChatSessionSummary[] {
  return plan.sessions.map((s, i) => ({
    index: i,
    day: s.day,
    title_th: s.title_th,
    title_en: s.title_en,
    duration_min: s.duration_min,
    exercise_count: s.exercises.length,
    exercises: s.exercises.map((x) => {
      const lib = EXERCISE_BY_ID.get(x.exercise_id);
      return {
        exercise_id: x.exercise_id,
        name_th: lib?.name_th ?? x.exercise_id,
        name_en: lib?.name_en ?? x.exercise_id,
        sets: x.sets,
        reps: x.reps,
        load_note: x.load_note,
        video_url: lib?.video_url ?? '',
      };
    }),
  }));
}

/**
 * Only used once she is onboarded. During onboarding everything is routed to
 * the agent, because "เสาร์อาทิตย์ว่าง" is an answer, not an intent.
 */
function intentFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (/^(เริ่มใหม่|restart|reset)$/.test(t)) return 'restart';
  if (/ยิม|gym|ฟิตเนส|fitness|ที่ออกกำลัง/.test(t)) return 'find_gym';
  if (/เช็คอิน|check ?in|รายงานผล/.test(t)) return 'checkin';
  if (/ขอดูแผน|ดูแผน|แผนสัปดาห์|my plan|show.*plan/.test(t)) return 'plan';
  if (/มื้ออาหาร|เมนูอาหาร|meal plan/.test(t)) return 'meals';
  if (/หาโค้ช|โค้ชส่วนตัว|personal trainer/.test(t)) return 'coach';
  return null;
}

// ── mock cells: one polished card, zero engine calls ────────────────────
function mealsCard(): AgentMessage {
  const rows = (meals as {
    title_th: string; title_en: string; kcal: number; protein_g: number;
  }[]).slice(0, 4).map((m) => ({
    title_th: m.title_th,
    title_en: m.title_en,
    sub_th: `${m.kcal} kcal · โปรตีน ${m.protein_g} g`,
    sub_en: `${m.kcal} kcal · protein ${m.protein_g} g`,
  }));
  return {
    text_th: 'มื้ออาหารที่แมตช์กับเป้าหมายของคุณค่ะ',
    text_en: 'Meals matched to your goal.',
    card: {
      kind: 'mock_list',
      title_th: 'มื้ออาหารที่แมตช์กับเป้าหมาย',
      title_en: 'Meals matched to your goal',
      subtitle_th: 'ตัวอย่างสำหรับสาธิต',
      subtitle_en: 'Demo preview',
      accent: '#EAF3EC',
      rows,
      deep_link: '/u/mind/meals',
    },
  };
}

function coachCard(): AgentMessage {
  const rows = (coaches as {
    name_th: string; name_en: string; specialty_th: string; specialty_en: string;
    price_th: string; price_en: string; match_pct: number;
  }[]).slice(0, 4).map((c) => ({
    title_th: c.name_th,
    title_en: c.name_en,
    sub_th: `${c.specialty_th} · ${c.price_th}`,
    sub_en: `${c.specialty_en} · ${c.price_en}`,
    badge: `${c.match_pct}%`,
  }));
  return {
    text_th: 'โค้ชที่น่าจะเข้ากับคุณค่ะ',
    text_en: 'Coaches who look like a fit.',
    card: {
      kind: 'mock_list',
      title_th: 'โค้ชที่น่าจะเข้ากับคุณ',
      title_en: 'Your best coach matches',
      subtitle_th: 'ตัวอย่างสำหรับสาธิต',
      subtitle_en: 'Demo preview',
      accent: '#F1EEF9',
      rows,
      deep_link: '/u/mind/coach',
    },
  };
}

/**
 * Single-user demo: both surfaces map to Mind, and her LINE id is bound on
 * first contact so a real OA and the in-app chat share one conversation.
 */
async function resolveUserId(storage: Storage, event: ChatEvent): Promise<string> {
  if (event.source === 'line') {
    const byLine = await storage.getUserByLineId(event.external_id);
    if (byLine) return byLine.id;
    const mind = await storage.getUser(MIND.id);
    if (mind && !mind.line_user_id) {
      await storage.upsertUser({ ...mind, line_user_id: event.external_id });
    }
  }
  return MIND.id;
}
