import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────
// PlanSchema — the only shape a plan may ever take.
// Exercises are by ID only: the agent can never invent a movement.
// ─────────────────────────────────────────────────────────────────────────

export const DayEnum = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type Day = z.infer<typeof DayEnum>;

export const PlanExerciseSchema = z.object({
  exercise_id: z.string().min(1),
  sets: z.number().int().min(1).max(5),
  reps: z.number().int().min(3).max(20),
  load_note: z.string().max(80).default(''),
});

export const PlanSessionSchema = z.object({
  day: DayEnum,
  title_th: z.string().min(1).max(60),
  title_en: z.string().min(1).max(60),
  duration_min: z.number().int().min(10).max(120),
  state: z.enum(['done', 'skipped']).nullable().optional(),
  exercises: z.array(PlanExerciseSchema).min(1).max(10),
});

export const PlanSchema = z.object({
  week_number: z.number().int().min(1),
  sessions: z.array(PlanSessionSchema).min(1).max(6),
});

export type PlanExercise = z.infer<typeof PlanExerciseSchema>;
export type PlanSession = z.infer<typeof PlanSessionSchema>;
export type Plan = z.infer<typeof PlanSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Workflow input — CoachRequest
// ─────────────────────────────────────────────────────────────────────────

export type CoachIntent = 'onboard' | 'weekly_replan' | 'find_gym' | 'freeform';
export type EngineName = 'agent-sdk' | 'api' | 'mock';
export type Locale = 'th' | 'en';

export interface OnboardingAnswers {
  goal: 'strength' | 'fat_loss' | 'energy' | 'habit';
  days_per_week: number;
  session_minutes: number;
  equipment: string[];
  experience: 'beginner' | 'returning' | 'intermediate';
  life_stage?: 'none' | 'postpartum' | 'perimenopause' | 'pregnant';
}

export interface CheckinPayload {
  week_number: number;
  sessions: { day: Day; state: 'done' | 'partial' | 'skipped' }[];
  rpe_avg?: number;
  sleep_1to5?: number;
  energy_1to5?: number;
  notes?: string;
}

export interface GymIntentPayload {
  area?: string;
  price_tier_max?: 1 | 2 | 3;
  must_have_tags?: string[];
}

export interface CoachRequest {
  /** uuid — idempotency key and the correlation id on every event/usage row. */
  request_id: string;
  user_id: string;
  /** Set by the deterministic router, never by the model. */
  intent: CoachIntent;
  source: 'line' | 'web' | 'script';
  locale: Locale;

  message?: string;
  payload?: OnboardingAnswers | CheckinPayload | GymIntentPayload;

  /**
   * Injected into the system prompt rather than fetched by a tool, so the
   * model physically cannot pick an exercise outside the user's equipment
   * and experience tier.
   */
  library: {
    allowed_exercise_ids: string[];
    catalog: LibraryEntry[];
    excluded_reason?: Record<string, string>;
  };

  /** Current profile, so the agent can match her tone and skip known fields. */
  profile?: UserStateResult['profile'];
  /** Required profile fields still unknown. Drives the onboarding question. */
  missing_fields?: string[];
  /** Recent turns, so a multi-turn onboarding stays coherent. */
  history?: { role: 'user' | 'coach'; text: string }[];
  /** Non-blocking safety signals the agent must acknowledge. */
  warnings?: SafetyFlag[];
  /** The active plan, so a reply can reference it without a tool round-trip. */
  active_plan?: Plan | null;

  budget: {
    engine: EngineName;
    /** Tool-call budget for the manual API loop. */
    max_tool_calls: number;
    max_plan_retries: number;
    /**
     * Agent SDK turn budget. A turn is consumed by every tool round-trip, so
     * this must leave room for get_user_state + save_profile + save_plan and
     * its retries. Reusing max_tool_calls here made the plan step run out of
     * turns and surface a generic error exactly when the plan should appear.
     */
    max_turns: number;
  };
}

export interface LibraryEntry {
  id: string;
  name_en: string;
  name_th: string;
  equipment: string[];
  level: 'beginner' | 'intermediate' | 'advanced';
  pattern: string;
  contraindications: string[];
  video_url: string;
  tip_th: string;
  tip_en: string;
  /** Beginner how-to: three cues and the one common mistake. */
  steps_th?: string[];
  steps_en?: string[];
  mistake_th?: string;
  mistake_en?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Workflow output — CoachResult
// ─────────────────────────────────────────────────────────────────────────

export type CoachStatus = 'ok' | 'blocked_safety' | 'validation_failed' | 'engine_error';

export interface QuickReply { label: string; data: string }

export interface CoachReply {
  /** <= 500 chars, enforced after generation. */
  text_th: string;
  text_en?: string;
  /** LINE Flex Message payload: plan | checkin | venue | handoff card. */
  flex?: unknown;
  quick_replies?: QuickReply[];
}

export interface SavedPlanRef {
  plan_id: string;
  week_number: number;
  status: 'draft' | 'active' | 'superseded';
  volume_total_sets: number;
  delta_vs_prev_pct: number | null;
  why_th: string;
  why_en: string;
}

export interface VenueRecommendation {
  partner_id: string;
  name: string;
  area: string;
  price_tier: number;
  vetted: boolean;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  note_en?: string | null;
  match_reasons: string[];
  match_reasons_en?: string[];
}

export interface SafetyFlag {
  code: string;
  matched_term: string;
  severity: 'block' | 'warn';
  /** Intents where this flag warns instead of blocking. */
  warn_intents?: string[];
}

export interface ToolCallTrace {
  name: string;
  args_summary: string;
  ok: boolean;
  ms: number;
}

export interface ValidatorRun {
  attempt: number;
  passed: boolean;
  codes: ValidationCode[];
}

export type FallbackUsed = 'none' | 'template_plan' | 'mock_engine' | 'maps_fallback';

export interface CoachTrace {
  engine: EngineName;
  tool_calls: ToolCallTrace[];
  validator_runs: ValidatorRun[];
  retries: number;
  fallback_used: FallbackUsed;
  usage: { input_tokens: number; output_tokens: number; ms: number };
}

export interface CoachResult {
  request_id: string;
  status: CoachStatus;
  intent: CoachIntent;
  reply: CoachReply;
  artifacts: {
    plan?: SavedPlanRef;
    venue?: VenueRecommendation;
    flags?: SafetyFlag[];
  };
  trace: CoachTrace;
}

// ─────────────────────────────────────────────────────────────────────────
// Tool contracts
// ─────────────────────────────────────────────────────────────────────────

export type ValidationCode =
  | 'VOLUME_INCREASE_EXCEEDED'
  | 'VOLUME_NOT_REDUCED_AFTER_MISSED_WEEK'
  | 'SESSION_TOO_LONG'
  | 'UNKNOWN_EXERCISE_ID'
  | 'EQUIPMENT_MISMATCH'
  | 'LEVEL_TOO_ADVANCED'
  | 'CONTRAINDICATION'
  | 'SETS_OUT_OF_RANGE'
  | 'REPS_OUT_OF_RANGE'
  | 'LOAD_JUMP_TOO_BIG'
  | 'TOO_MANY_SESSIONS'
  | 'SCHEMA_INVALID'
  | 'GUILT_LANGUAGE'
  | 'RED_FLAG_BLOCK';

export interface ValidationError {
  code: ValidationCode;
  path: string;
  message_en: string;
  fix_hint: string;
}

export interface UserStateResult {
  profile: {
    display_name: string;
    goal: string | null;
    days_per_week: number | null;
    session_minutes: number | null;
    equipment: string[];
    experience: string | null;
    life_stage: string | null;
    language: string;
    coach_tone: string | null;
    tone_note: string | null;
    motivation: string | null;
    target_weeks: number | null;
    target_event: string | null;
    age: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    injuries: string | null;
    sleep_hours: number | null;
    activity_level: string | null;
    train_time: string | null;
    dislikes: string | null;
    /** Derived, never stored — recomputed whenever height or weight changes. */
    bmi: number | null;
  };
  /** Required profile fields still unknown. Empty means a plan can be built. */
  missing_fields: string[];
  /**
   * The ONLY exercise IDs valid for her right now, filtered from her current
   * equipment and level. Authoritative — the copy in the system prompt is a
   * snapshot from before this turn's profile updates.
   */
  exercise_library: {
    id: string; name_th: string; name_en: string; pattern: string; equipment: string[];
  }[];
  recent_plans: {
    plan_id: string; week_number: number; status: string;
    volume_total_sets: number; created_at: string;
  }[];
  recent_checkins: {
    week_number: number; completion_pct: number; rpe_avg: number | null;
    sleep_1to5: number | null; energy_1to5: number | null; notes: string | null;
  }[];
  /**
   * Pre-computed so the model is handed the exact numbers the validator
   * enforces instead of being asked to do arithmetic.
   */
  derived: {
    last_active_volume_sets: number | null;
    missed_last_week: boolean;
    completion_rate_4w: number;
    next_week_number: number;
    volume_ceiling_sets: number | null;
    volume_floor_sets: number | null;
  };
}

export interface ProfileFields {
  display_name?: string;
  goal?: string;
  days_per_week?: number;
  session_minutes?: number;
  equipment?: string[] | string;
  experience?: string;
  life_stage?: string;
  /** How she wants to be coached: gentle | balanced | firm. */
  coach_tone?: string;
  /** Her own words about the tone she wants. */
  tone_note?: string;
  /** Why this matters to her — used to personalise the why-line. */
  motivation?: string;
  /** Her own timeframe in weeks, e.g. 12. */
  target_weeks?: number;
  /** What the timeframe is for, in her words. */
  target_event?: string;
  age?: number;
  height_cm?: number;
  weight_kg?: number;
  /** Past or ongoing niggles to programme around, in her words. */
  injuries?: string;
  sleep_hours?: number;
  activity_level?: string;
  train_time?: string;
  /** Movements or styles she will not do. Respecting this is adherence. */
  dislikes?: string;
}

export interface SaveProfileResult {
  ok: true;
  saved: Record<string, unknown>;
  /** Values that failed enum validation and were not stored. */
  ignored?: string[];
  /** Required fields still unknown — what to ask about next. */
  missing: string[];
  /** Optional but useful: offer these once before planning, never insist. */
  optional_missing: string[];
  ready_to_plan: boolean;
}

export type SavePlanResult =
  | { ok: true; plan_id: string; week_number: number; volume_total_sets: number; delta_vs_prev_pct: number | null }
  | { ok: false; retries_left: number; errors: ValidationError[] };

export interface PartnerSearchResult {
  count: number;
  results: {
    partner_id: string; name: string; area: string; price_tier: number;
    beginner_friendly: boolean; tags: string[]; lat: number | null;
    lng: number | null; note: string | null; note_en: string | null;
    match_reasons: string[]; match_reasons_en: string[];
  }[];
}

export interface MapsFallbackResult {
  vetted: false;
  results: { name: string; area: string; note: string; note_en: string }[];
  disclaimer_th: string;
  disclaimer_en: string;
}

/** The agent's tools. */
export interface CoachTools {
  get_user_state(args: { user_id: string }): Promise<UserStateResult>;
  save_profile(args: { user_id: string } & ProfileFields): Promise<SaveProfileResult>;
  save_plan(args: { user_id: string; plan: unknown; why_th: string; why_en: string }): Promise<SavePlanResult>;
  search_partners(args: {
    area?: string; price_tier_max?: number; tags?: string[];
    beginner_friendly_only?: boolean; limit?: number;
  }): Promise<PartnerSearchResult>;
  maps_fallback(args: { query: string; area?: string }): Promise<MapsFallbackResult>;
}

// ─────────────────────────────────────────────────────────────────────────
// The engine contract. All LLM usage goes through this — no exceptions.
// ─────────────────────────────────────────────────────────────────────────

export interface CoachEngine {
  readonly name: EngineName;
  run(req: CoachRequest, tools: CoachTools): Promise<CoachResult>;
}
