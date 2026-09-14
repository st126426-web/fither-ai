import { MIND, PARTNER_ROWS } from './seed.ts';
import { nowIso } from './util.ts';
import type { Storage } from '../storage/types.ts';

export interface SeedOptions {
  /** Create Mind's user row (skip it to reset her to the onboarding state). */
  includeUser?: boolean;
  /** Wipe her plans/check-ins/events first. */
  fresh?: boolean;
}

export async function seedDatabase(storage: Storage, opts: SeedOptions = {}): Promise<void> {
  await storage.init();
  await storage.replacePartners(PARTNER_ROWS);

  if (opts.fresh) await storage.wipeUser(MIND.id);

  if (opts.includeUser) {
    const existing = await storage.getUser(MIND.id);
    await storage.upsertUser({
      id: MIND.id,
      display_name: MIND.display_name,
      line_user_id: existing?.line_user_id ?? MIND.line_user_id,
      goal: MIND.goal,
      days_per_week: MIND.days_per_week,
      session_minutes: MIND.session_minutes,
      equipment_json: JSON.stringify(MIND.equipment),
      experience: MIND.experience,
      life_stage: MIND.life_stage,
      language: MIND.language,
      coach_tone: MIND.coach_tone ?? 'balanced',
      tone_note: existing?.tone_note ?? null,
      motivation: MIND.motivation ?? null,
      target_weeks: existing?.target_weeks ?? null,
      target_event: existing?.target_event ?? null,
      age: existing?.age ?? null,
      height_cm: existing?.height_cm ?? null,
      weight_kg: existing?.weight_kg ?? null,
      injuries: existing?.injuries ?? null,
      sleep_hours: existing?.sleep_hours ?? null,
      activity_level: existing?.activity_level ?? null,
      train_time: existing?.train_time ?? null,
      dislikes: existing?.dislikes ?? null,
      created_at: existing?.created_at ?? nowIso(),
    });
  }
}
