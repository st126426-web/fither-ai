import { Hono } from 'hono';
import type { Config } from '../config.ts';
import type { Day, Plan } from '../engine/types.ts';
import { EXERCISES } from '../lib/seed.ts';
import { nowIso, parseJson, uid } from '../lib/util.ts';
import { totalSets } from '../safety/validator.ts';
import { bmiOf, completionPct } from '../tools/user-state.ts';
import { missingFields } from '../tools/profile.ts';
import type { Storage } from '../storage/types.ts';
import { seedDatabase } from '../lib/bootstrap.ts';
import { routeChat } from '../conversation/router.ts';

export interface AppEnv {
  Variables: { storage: Storage; cfg: Config };
}

export const api = new Hono<AppEnv>();

/** One call powers every LIVE surface in the web app. */
api.get('/state/:userId', async (c) => {
  const storage = c.get('storage');
  const userId = c.req.param('userId');
  const user = await storage.getUser(userId);
  if (!user) {
    // Same shape, empty. A truncated object here crashed the app on the very
    // state it describes — a brand-new user with nothing yet.
    return c.json({
      onboarded: false,
      missing_fields: missingFields(null),
      user: null,
      active_plan: null,
      history: [],
      volume_changes: {},
      checkins: [],
      events: [],
      venue: null,
      coach_handoff: false,
      streak: { weeks: 0, forgiven: 0 },
    }, 200);
  }

  const plans = await storage.listPlans(userId, 20);
  const active = plans.find((p) => p.status === 'active') ?? null;
  const checkins = await storage.listCheckins(userId, 8);
  const events = await storage.listEvents(userId, 60);

  const history = plans.map((p) => {
    const plan = parseJson<Plan | null>(p.plan_json, null);
    return {
      plan_id: p.id,
      week_number: p.week_number,
      status: p.status,
      volume_total_sets: plan ? totalSets(plan) : 0,
      why_th: p.why_text_th,
      why_en: p.why_text_en,
      engine: p.engine,
      created_at: p.created_at,
      sessions: plan?.sessions.length ?? 0,
    };
  });

  // "what changed & why" — diff each week against the previous one.
  const byWeek = [...history].sort((a, b) => a.week_number - b.week_number);
  const changes: Record<string, number | null> = {};
  byWeek.forEach((h, i) => {
    const prev = byWeek[i - 1];
    changes[h.plan_id] = prev && prev.volume_total_sets
      ? Math.round(((h.volume_total_sets - prev.volume_total_sets) / prev.volume_total_sets) * 1000) / 10
      : null;
  });

  const venueEvent = events.find((e) => e.type === 'venue_recommended');
  const redFlag = events.find((e) => e.type === 'red_flag_handoff');

  const missing = missingFields(user);

  return c.json({
    // "Onboarded" means a plan can be built, not that a row exists. The row is
    // created by her first answer, so keying off it hid the setup helper after
    // a single message.
    onboarded: missing.length === 0,
    missing_fields: missing,
    user: {
      id: user.id,
      display_name: user.display_name,
      goal: user.goal,
      days_per_week: user.days_per_week,
      session_minutes: user.session_minutes,
      equipment: parseJson<string[]>(user.equipment_json, []),
      experience: user.experience,
      life_stage: user.life_stage,
      language: user.language,
      coach_tone: user.coach_tone,
      tone_note: user.tone_note,
      motivation: user.motivation,
      target_weeks: user.target_weeks,
      target_event: user.target_event,
      age: user.age,
      height_cm: user.height_cm,
      weight_kg: user.weight_kg,
      injuries: user.injuries,
      sleep_hours: user.sleep_hours,
      activity_level: user.activity_level,
      train_time: user.train_time,
      dislikes: user.dislikes,
      bmi: bmiOf(user.height_cm, user.weight_kg),
    },
    active_plan: active
      ? {
        plan_id: active.id,
        week_number: active.week_number,
        why_th: active.why_text_th,
        why_en: active.why_text_en,
        plan: parseJson<Plan | null>(active.plan_json, null),
      }
      : null,
    history,
    volume_changes: changes,
    checkins: checkins.map((ch) => ({
      week_number: ch.week_number,
      completion_pct: completionPct(ch.completion_json),
      notes: ch.notes,
      flags: parseJson<unknown[]>(ch.flags_json, []),
    })),
    events: events.map((e) => ({
      id: e.id, type: e.type, payload: parseJson<unknown>(e.payload_json, {}), created_at: e.created_at,
    })),
    venue: venueEvent ? parseJson<unknown>(venueEvent.payload_json, null) : null,
    coach_handoff: !!redFlag,
    streak: computeStreak(checkins.map((ch) => completionPct(ch.completion_json))),
  });
});

/**
 * Streak with forgiveness: a fully missed week pauses the streak instead of
 * zeroing it — the product's whole point.
 */
function computeStreak(pcts: number[]): { weeks: number; forgiven: number } {
  let weeks = 0;
  let forgiven = 0;
  for (const p of pcts) {
    if (p > 0) weeks++;
    else if (forgiven === 0) forgiven = 1;
    else break;
  }
  return { weeks, forgiven };
}

api.get('/exercises', (c) => c.json(EXERCISES));

/**
 * In-app chat. Same router, same conversation state row and same safety gate
 * as the LINE webhook — only the rendering differs, so a conversation can be
 * started on one surface and continued on the other.
 */
api.post('/chat', async (c) => {
  const body = await c.req.json<{ text?: string; data?: string; type?: 'text' | 'postback' | 'follow' }>();
  const type = body.type ?? (body.data ? 'postback' : 'text');
  const messages = await routeChat(c.get('storage'), c.get('cfg'), {
    type,
    source: 'web',
    external_id: c.req.param('userId') ?? 'web',
    text: body.text,
    data: body.data,
  });
  return c.json({ messages });
});

/** Profile editor — writes take effect at the next weekly re-plan, not now. */
api.patch('/user/:userId', async (c) => {
  const storage = c.get('storage');
  const body = await c.req.json<{
    display_name?: string;
    goal?: string; days_per_week?: number; session_minutes?: number;
    equipment?: string[]; experience?: string; life_stage?: string; language?: string;
    coach_tone?: string; tone_note?: string; motivation?: string;
    target_weeks?: number; target_event?: string;
    age?: number; height_cm?: number; weight_kg?: number;
    injuries?: string; sleep_hours?: number; activity_level?: string;
    train_time?: string; dislikes?: string;
  }>();

  const updated = await storage.updateUserProfile(c.req.param('userId'), {
    display_name: body.display_name?.trim() ? body.display_name.trim().slice(0, 40) : undefined,
    goal: body.goal,
    days_per_week: body.days_per_week,
    session_minutes: body.session_minutes,
    equipment_json: body.equipment ? JSON.stringify(body.equipment) : undefined,
    experience: body.experience,
    life_stage: body.life_stage,
    language: body.language,
    coach_tone: body.coach_tone,
    tone_note: body.tone_note,
    motivation: body.motivation,
    target_weeks: body.target_weeks,
    target_event: body.target_event,
    age: body.age,
    height_cm: body.height_cm,
    weight_kg: body.weight_kg,
    injuries: body.injuries,
    sleep_hours: body.sleep_hours,
    activity_level: body.activity_level,
    train_time: body.train_time,
    dislikes: body.dislikes,
  });

  await storage.insertEvent({
    id: uid('ev'), user_id: c.req.param('userId'), type: 'profile_updated',
    payload_json: JSON.stringify(body), created_at: nowIso(),
  });
  return c.json({ ok: true, user: updated, applies: 'next_weekly_replan' });
});

/** Session detail Done/Skip — display state only, no validator run. */
api.post('/plan/:planId/session-state', async (c) => {
  const storage = c.get('storage');
  const { index, state } = await c.req.json<{ index: number; state: 'done' | 'skipped' | null }>();
  const row = await storage.getPlan(c.req.param('planId'));
  const plan = parseJson<Plan | null>(row?.plan_json, null);
  if (!row || !plan || !plan.sessions[index]) return c.json({ ok: false }, 404);

  plan.sessions[index].state = state;
  await storage.updatePlanJson(row.id, plan);
  return c.json({ ok: true, plan });
});

/** Schedule day-swap — rewrites `day` only. No regeneration, no validator. */
api.post('/plan/:planId/move-day', async (c) => {
  const storage = c.get('storage');
  const { index, day } = await c.req.json<{ index: number; day: Day }>();
  const row = await storage.getPlan(c.req.param('planId'));
  const plan = parseJson<Plan | null>(row?.plan_json, null);
  if (!row || !plan || !plan.sessions[index]) return c.json({ ok: false }, 404);

  plan.sessions[index].day = day;
  await storage.updatePlanJson(row.id, plan);
  return c.json({ ok: true, plan });
});

api.get('/usage', async (c) => {
  const storage = c.get('storage');
  const totals = await storage.usageTotals();
  const sum = totals.reduce(
    (acc, t) => ({
      calls: acc.calls + t.calls,
      input_tokens: acc.input_tokens + t.input_tokens,
      output_tokens: acc.output_tokens + t.output_tokens,
    }),
    { calls: 0, input_tokens: 0, output_tokens: 0 },
  );
  return c.json({ by_engine: totals, total: sum, engine: c.get('cfg').engine });
});

/** Delete my data — PDPA talking point and the between-demo reset. */
api.post('/demo-reset/:userId', async (c) => {
  const storage = c.get('storage');
  const userId = c.req.param('userId');
  await storage.wipeUser(userId);
  await seedDatabase(storage, { includeUser: false });
  return c.json({ ok: true, reset: userId });
});

/** Re-seed Mind so the demo can be rerun instantly. */
api.post('/demo-seed', async (c) => {
  const storage = c.get('storage');
  await seedDatabase(storage, { includeUser: true, fresh: true });
  return c.json({ ok: true });
});
