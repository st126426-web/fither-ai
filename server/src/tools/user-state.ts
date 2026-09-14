import type { Plan, UserStateResult } from '../engine/types.ts';
import { RULES, totalSets } from '../safety/validator.ts';
import { filterLibrary, parseJson } from '../lib/util.ts';
import { missingFields } from './profile.ts';
import type { CheckinRow, PlanRow, Storage, UserRow } from '../storage/types.ts';

export function completionPct(completionJson: string): number {
  const sessions = parseJson<{ state: string }[]>(completionJson, []);
  if (!sessions.length) return 0;
  const score = sessions.reduce(
    (n, s) => n + (s.state === 'done' ? 1 : s.state === 'partial' ? 0.5 : 0),
    0,
  );
  return Math.round((score / sessions.length) * 100);
}

export function planVolume(row: PlanRow): number {
  const plan = parseJson<Plan | null>(row.plan_json, null);
  return plan ? totalSets(plan) : 0;
}

/**
 * Tool 1: get_user_state.
 *
 * The `derived` block is the whole point — it hands the model the exact
 * numbers the validator will enforce, instead of asking it to do arithmetic
 * across four weeks of history.
 */
export async function getUserState(storage: Storage, userId: string): Promise<UserStateResult> {
  const user = await storage.getUser(userId);
  if (!user) throw new Error(`unknown user: ${userId}`);

  const plans = await storage.listPlans(userId, 8);
  const checkins = await storage.listCheckins(userId, 4);

  const recent_plans = plans.slice(0, 4).map((p) => ({
    plan_id: p.id,
    week_number: p.week_number,
    status: p.status,
    volume_total_sets: planVolume(p),
    created_at: p.created_at,
  }));

  const recent_checkins = checkins.map((c: CheckinRow) => ({
    week_number: c.week_number,
    completion_pct: completionPct(c.completion_json),
    rpe_avg: c.rpe_avg,
    sleep_1to5: c.sleep_1to5,
    energy_1to5: c.energy_1to5,
    notes: c.notes,
  }));

  const lastActive = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
  const last_active_volume_sets = lastActive ? planVolume(lastActive) : null;

  const missed_last_week = recent_checkins.length > 0 && recent_checkins[0].completion_pct === 0;

  const completion_rate_4w = recent_checkins.length
    ? Math.round(recent_checkins.reduce((n, c) => n + c.completion_pct, 0) / recent_checkins.length)
    : 0;

  const maxWeek = plans.reduce((m, p) => Math.max(m, p.week_number), 0);
  const next_week_number = maxWeek + 1;

  let volume_ceiling_sets: number | null = null;
  let volume_floor_sets: number | null = null;
  if (last_active_volume_sets && last_active_volume_sets > 0) {
    if (missed_last_week) {
      volume_ceiling_sets = Math.floor(
        last_active_volume_sets * (1 - RULES.volume.min_decrease_after_missed_week_pct / 100),
      );
      volume_floor_sets = Math.floor(last_active_volume_sets * 0.5);
    } else {
      volume_ceiling_sets = Math.floor(
        last_active_volume_sets * (1 + RULES.volume.max_increase_pct / 100),
      );
    }
  }

  // The library is filtered from her CURRENT equipment and level. During
  // onboarding those are still being filled in, so the copy injected into the
  // prompt at the start of the turn can be empty or stale — this is the
  // authoritative list, and it is why the agent is told to call this before
  // planning.
  const { allowed } = filterLibrary({
    equipment: parseJson<string[]>(user.equipment_json, []),
    experience: user.experience ?? 'beginner',
    life_stage: user.life_stage,
  });

  return {
    profile: profileOf(user),
    missing_fields: missingFields(user),
    exercise_library: allowed.map((e) => ({
      id: e.id, name_th: e.name_th, name_en: e.name_en,
      pattern: e.pattern, equipment: e.equipment,
    })),
    recent_plans,
    recent_checkins,
    derived: {
      last_active_volume_sets,
      missed_last_week,
      completion_rate_4w,
      next_week_number,
      volume_ceiling_sets,
      volume_floor_sets,
    },
  };
}

export function profileOf(user: UserRow): UserStateResult['profile'] {
  return {
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
  };
}

/** BMI is a crude population measure — informational only, never a judgement. */
export function bmiOf(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm < 80) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}
