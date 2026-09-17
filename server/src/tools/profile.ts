import type { ProfileFields, SaveProfileResult } from '../engine/types.ts';
import { nowIso, parseJson } from '../lib/util.ts';
import type { Storage, UserRow } from '../storage/types.ts';

/** Everything a plan cannot be generated without. */
export const REQUIRED_FIELDS = [
  'goal', 'days_per_week', 'session_minutes', 'equipment', 'experience', 'coach_tone',
] as const;
export type RequiredField = typeof REQUIRED_FIELDS[number];

const GOALS = ['strength', 'fat_loss', 'energy', 'habit'];
const EXPERIENCE = ['beginner', 'returning', 'intermediate'];
const LIFE_STAGES = ['none', 'postpartum', 'perimenopause', 'pregnant'];
const TONES = ['gentle', 'balanced', 'firm'];
const ACTIVITY = ['sedentary', 'light', 'active'];
const TRAIN_TIME = ['morning', 'midday', 'evening'];

const EQUIPMENT_VOCAB = [
  'bodyweight', 'mat', 'dumbbell', 'treadmill', 'bench', 'resistance_band', 'kettlebell', 'box',
];

/**
 * The agent hears Thai and writes what it heard. Without this, "ดัมเบล" would
 * be stored verbatim and then fail every equipment check — the same class of
 * bug that made a Thai district name miss a vetted gym.
 */
const EQUIPMENT_ALIASES: Record<string, string> = {
  ดัมเบล: 'dumbbell', ดัมเบลล์: 'dumbbell', dumbbells: 'dumbbell', weights: 'dumbbell',
  ลู่วิ่ง: 'treadmill', ลู่: 'treadmill',
  เสื่อ: 'mat', เสื่อโยคะ: 'mat', yogamat: 'mat', 'yoga mat': 'mat',
  ม้านั่ง: 'bench', เก้าอี้: 'bench',
  ยางยืด: 'resistance_band', ยาง: 'resistance_band', band: 'resistance_band',
  เคทเทิลเบล: 'kettlebell',
  กล่อง: 'box', ขั้นบันได: 'box', บันได: 'box', step: 'box',
  น้ำหนักตัว: 'bodyweight', ตัวเปล่า: 'bodyweight', none: 'bodyweight', ไม่มี: 'bodyweight',
};

export function normaliseEquipment(input: unknown): string[] {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[,\s]+/);
  const out = new Set<string>();
  for (const raw of list) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (!v) continue;
    if (EQUIPMENT_VOCAB.includes(v)) { out.add(v); continue; }
    const alias = EQUIPMENT_ALIASES[v] ?? EQUIPMENT_ALIASES[String(raw).trim()];
    if (alias) { out.add(alias); continue; }
    // Tolerate "2 dumbbells" / "มีดัมเบล 2 ตัว".
    const hit = Object.entries(EQUIPMENT_ALIASES).find(([k]) => v.includes(k.toLowerCase()))
      ?? Object.entries(EQUIPMENT_ALIASES).find(([k]) => String(raw).includes(k));
    if (hit) out.add(hit[1]);
  }
  // Bodyweight is always available; a plan with nothing else still works.
  out.add('bodyweight');
  if (out.has('dumbbell') || out.size > 1) out.add('mat');
  return [...out];
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/**
 * Near-misses that mean one of the enum values.
 *
 * A model told to map her words onto an enum mostly does, but "get in shape",
 * "toning", "lose weight" and "newbie" come back often enough to matter — and
 * a rejected value used to vanish into `ignored`, leaving the agent to ask the
 * same question again with the options spelled out. That is the single most
 * irritating thing this conversation can do, so the near-misses are accepted
 * here instead.
 */
const ENUM_ALIASES: Record<string, string> = {
  // goal
  fat: 'fat_loss', fatloss: 'fat_loss', 'lose weight': 'fat_loss', 'weight loss': 'fat_loss',
  'weight_loss': 'fat_loss', slim: 'fat_loss', lean: 'fat_loss', toning: 'fat_loss',
  'get in shape': 'habit', shape: 'habit', health: 'habit', healthy: 'habit',
  consistency: 'habit', routine: 'habit',
  strong: 'strength', muscle: 'strength', 'build muscle': 'strength', tone: 'strength',
  stamina: 'energy', endurance: 'energy', fitness: 'energy',
  // experience
  none: 'beginner', new: 'beginner', novice: 'beginner', newbie: 'beginner', never: 'beginner',
  'no experience': 'beginner',
  returned: 'returning', restarting: 'returning', 'used to': 'returning', rusty: 'returning',
  regular: 'intermediate', advanced: 'intermediate', experienced: 'intermediate',
  // coach_tone
  soft: 'gentle', kind: 'gentle', encouraging: 'gentle', supportive: 'gentle',
  normal: 'balanced', neutral: 'balanced', moderate: 'balanced', medium: 'balanced',
  direct: 'firm', tough: 'firm', strict: 'firm', push: 'firm', pushy: 'firm', hard: 'firm',
};

function pickEnum(v: unknown, allowed: string[]): string | undefined {
  const s = String(v ?? '').trim().toLowerCase();
  if (allowed.includes(s)) return s;
  const alias = ENUM_ALIASES[s] ?? ENUM_ALIASES[s.replace(/[\s_-]+/g, ' ')];
  return alias && allowed.includes(alias) ? alias : undefined;
}

/**
 * A rejection the agent can act on. `goal="in shape"` alone tells it nothing;
 * naming the allowed values lets it correct itself on the same turn instead of
 * re-interrogating her.
 */
function rejected(field: string, value: unknown, allowed: string[]): string {
  return `${field}="${String(value)}" not recognised — use one of: ${allowed.join(' | ')}`;
}

export function missingFields(user: UserRow | null): RequiredField[] {
  if (!user) return [...REQUIRED_FIELDS];
  const equipment = parseJson<string[]>(user.equipment_json, []);
  const missing: RequiredField[] = [];
  if (!user.goal) missing.push('goal');
  if (!user.days_per_week) missing.push('days_per_week');
  if (!user.session_minutes) missing.push('session_minutes');
  if (!equipment.length) missing.push('equipment');
  if (!user.experience) missing.push('experience');
  if (!user.coach_tone) missing.push('coach_tone');
  return missing;
}

/**
 * Tool 5: save_profile.
 *
 * This is what makes onboarding agentic. The agent talks to her in its own
 * words, extracts whatever she volunteered — often several fields in one
 * sentence — and records it. The reply tells it what is still missing, so it
 * always knows what to ask next without holding a script.
 *
 * Values are normalised and enum-checked here, never trusted raw.
 */
export async function saveProfile(
  storage: Storage,
  userId: string,
  fields: ProfileFields,
): Promise<SaveProfileResult> {
  const existing = await storage.getUser(userId);
  const patch: Partial<UserRow> = {};
  const saved: Record<string, unknown> = {};
  const ignored: string[] = [];

  if (fields.display_name?.trim()) {
    patch.display_name = fields.display_name.trim().slice(0, 40);
    saved.display_name = patch.display_name;
  }

  if (fields.goal !== undefined) {
    const v = pickEnum(fields.goal, GOALS);
    if (v) { patch.goal = v; saved.goal = v; } else ignored.push(rejected('goal', fields.goal, GOALS));
  }

  if (fields.days_per_week !== undefined) {
    const v = clampInt(fields.days_per_week, 1, 6);
    if (v) { patch.days_per_week = v; saved.days_per_week = v; } else ignored.push('days_per_week');
  }

  if (fields.session_minutes !== undefined) {
    const v = clampInt(fields.session_minutes, 10, 120);
    if (v) { patch.session_minutes = v; saved.session_minutes = v; } else ignored.push('session_minutes');
  }

  if (fields.equipment !== undefined) {
    const v = normaliseEquipment(fields.equipment);
    patch.equipment_json = JSON.stringify(v);
    saved.equipment = v;
  }

  if (fields.experience !== undefined) {
    const v = pickEnum(fields.experience, EXPERIENCE);
    if (v) { patch.experience = v; saved.experience = v; } else ignored.push(rejected('experience', fields.experience, EXPERIENCE));
  }

  if (fields.life_stage !== undefined) {
    const v = pickEnum(fields.life_stage, LIFE_STAGES);
    if (v) { patch.life_stage = v; saved.life_stage = v; } else ignored.push(rejected('life_stage', fields.life_stage, LIFE_STAGES));
  }

  if (fields.coach_tone !== undefined) {
    const v = pickEnum(fields.coach_tone, TONES);
    if (v) { patch.coach_tone = v; saved.coach_tone = v; } else ignored.push(rejected('coach_tone', fields.coach_tone, TONES));
  }

  if (fields.tone_note !== undefined) {
    patch.tone_note = String(fields.tone_note).slice(0, 300);
    saved.tone_note = patch.tone_note;
  }

  if (fields.motivation !== undefined) {
    patch.motivation = String(fields.motivation).slice(0, 300);
    saved.motivation = patch.motivation;
  }

  if (fields.target_weeks !== undefined) {
    const v = clampInt(fields.target_weeks, 2, 104);
    if (v) { patch.target_weeks = v; saved.target_weeks = v; } else ignored.push('target_weeks');
  }

  if (fields.target_event !== undefined) {
    patch.target_event = String(fields.target_event).slice(0, 120);
    saved.target_event = patch.target_event;
  }

  // Body metrics are optional and self-reported. Ranges are sanity checks, not
  // judgements — anything outside them is far more likely a typo than real.
  if (fields.age !== undefined) {
    const v = clampInt(fields.age, 13, 99);
    if (v) { patch.age = v; saved.age = v; } else ignored.push('age');
  }

  if (fields.height_cm !== undefined) {
    const v = Number(fields.height_cm);
    if (Number.isFinite(v) && v >= 120 && v <= 220) {
      patch.height_cm = Math.round(v * 10) / 10; saved.height_cm = patch.height_cm;
    } else ignored.push('height_cm');
  }

  if (fields.weight_kg !== undefined) {
    const v = Number(fields.weight_kg);
    if (Number.isFinite(v) && v >= 30 && v <= 250) {
      patch.weight_kg = Math.round(v * 10) / 10; saved.weight_kg = patch.weight_kg;
    } else ignored.push('weight_kg');
  }

  if (fields.injuries !== undefined) {
    patch.injuries = String(fields.injuries).slice(0, 300);
    saved.injuries = patch.injuries;
  }

  if (fields.sleep_hours !== undefined) {
    const v = Number(fields.sleep_hours);
    if (Number.isFinite(v) && v >= 3 && v <= 14) {
      patch.sleep_hours = Math.round(v * 10) / 10; saved.sleep_hours = patch.sleep_hours;
    } else ignored.push('sleep_hours');
  }

  if (fields.activity_level !== undefined) {
    const v = pickEnum(fields.activity_level, ACTIVITY);
    if (v) { patch.activity_level = v; saved.activity_level = v; } else ignored.push(rejected('activity_level', fields.activity_level, ACTIVITY));
  }

  if (fields.train_time !== undefined) {
    const v = pickEnum(fields.train_time, TRAIN_TIME);
    if (v) { patch.train_time = v; saved.train_time = v; } else ignored.push(rejected('train_time', fields.train_time, TRAIN_TIME));
  }

  if (fields.dislikes !== undefined) {
    patch.dislikes = String(fields.dislikes).slice(0, 300);
    saved.dislikes = patch.dislikes;
  }

  if (!existing) {
    await storage.upsertUser({
      id: userId,
      display_name: (patch.display_name as string) ?? 'เพื่อน',
      line_user_id: null,
      goal: (patch.goal as string) ?? null,
      days_per_week: (patch.days_per_week as number) ?? null,
      session_minutes: (patch.session_minutes as number) ?? null,
      equipment_json: (patch.equipment_json as string) ?? '[]',
      experience: (patch.experience as string) ?? null,
      life_stage: (patch.life_stage as string) ?? null,
      language: 'th',
      coach_tone: (patch.coach_tone as string) ?? null,
      tone_note: (patch.tone_note as string) ?? null,
      motivation: (patch.motivation as string) ?? null,
      target_weeks: (patch.target_weeks as number) ?? null,
      target_event: (patch.target_event as string) ?? null,
      age: (patch.age as number) ?? null,
      height_cm: (patch.height_cm as number) ?? null,
      weight_kg: (patch.weight_kg as number) ?? null,
      injuries: (patch.injuries as string) ?? null,
      sleep_hours: (patch.sleep_hours as number) ?? null,
      activity_level: (patch.activity_level as string) ?? null,
      train_time: (patch.train_time as string) ?? null,
      dislikes: (patch.dislikes as string) ?? null,
      created_at: nowIso(),
    });
  } else {
    await storage.updateUserProfile(userId, patch);
  }

  const user = await storage.getUser(userId);
  const missing = missingFields(user);

  // Optional, but a coach programmes better with them. Surfaced separately so
  // the agent can offer them once before planning rather than skipping them
  // silently the moment the required six are complete.
  const optional_missing: string[] = [];
  if (!user?.age && !user?.height_cm && !user?.weight_kg) optional_missing.push('body_metrics');
  if (!user?.injuries) optional_missing.push('injuries');
  if (!user?.train_time) optional_missing.push('train_time');
  if (!user?.target_weeks) optional_missing.push('target_weeks');

  return {
    ok: true,
    saved,
    ignored: ignored.length ? ignored : undefined,
    missing,
    optional_missing,
    ready_to_plan: missing.length === 0,
  };
}
