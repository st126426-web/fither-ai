import type { Plan } from '../engine/types.ts';

export interface UserRow {
  id: string;
  display_name: string;
  line_user_id: string | null;
  goal: string | null;
  days_per_week: number | null;
  session_minutes: number | null;
  equipment_json: string;
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
  created_at: string;
}

export interface PlanRow {
  id: string;
  user_id: string;
  week_number: number;
  status: 'draft' | 'active' | 'superseded';
  plan_json: string;
  why_text_th: string | null;
  why_text_en: string | null;
  engine: string | null;
  created_at: string;
}

export interface CheckinRow {
  id: string;
  user_id: string;
  week_number: number;
  completion_json: string;
  rpe_avg: number | null;
  sleep_1to5: number | null;
  energy_1to5: number | null;
  notes: string | null;
  flags_json: string;
  created_at: string;
}

export interface PartnerRow {
  id: string;
  name: string;
  area: string;
  price_tier: number;
  beginner_friendly: number;
  tags_json: string;
  lat: number | null;
  lng: number | null;
  note: string | null;
  note_en: string | null;
}

export interface EventRow {
  id: string;
  user_id: string;
  type: string;
  payload_json: string;
  created_at: string;
}

export interface UsageRow {
  id: string;
  engine: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface ConversationRow {
  user_id: string;
  step: string;
  draft_json: string;
  updated_at: string;
}

export interface PartnerFilters {
  area?: string;
  price_tier_max?: number;
  tags?: string[];
  beginner_friendly_only?: boolean;
  limit?: number;
}

/**
 * One storage contract, two implementations (SQLite locally, D1 hosted).
 * Everything is async so the SQLite side can pretend to be D1.
 */
export interface Storage {
  init(): Promise<void>;

  getUser(userId: string): Promise<UserRow | null>;
  getUserByLineId(lineUserId: string): Promise<UserRow | null>;
  upsertUser(user: UserRow): Promise<void>;
  updateUserProfile(userId: string, patch: Partial<UserRow>): Promise<UserRow | null>;

  insertPlan(row: PlanRow): Promise<void>;
  getPlan(planId: string): Promise<PlanRow | null>;
  getActivePlan(userId: string): Promise<PlanRow | null>;
  listPlans(userId: string, limit?: number): Promise<PlanRow[]>;
  supersedePlans(userId: string, weekNumber?: number): Promise<void>;
  updatePlanJson(planId: string, plan: Plan): Promise<void>;

  insertCheckin(row: CheckinRow): Promise<void>;
  listCheckins(userId: string, limit?: number): Promise<CheckinRow[]>;

  searchPartners(filters: PartnerFilters): Promise<PartnerRow[]>;
  replacePartners(rows: PartnerRow[]): Promise<void>;
  countPartners(): Promise<number>;

  insertEvent(row: EventRow): Promise<void>;
  listEvents(userId: string, limit?: number): Promise<EventRow[]>;

  insertUsage(row: UsageRow): Promise<void>;
  usageTotals(): Promise<{ engine: string; calls: number; input_tokens: number; output_tokens: number }[]>;
  countApiCallsToday(): Promise<number>;

  getConversation(userId: string): Promise<ConversationRow | null>;
  setConversation(row: ConversationRow): Promise<void>;
  clearConversation(userId: string): Promise<void>;

  wipeUser(userId: string): Promise<void>;
}
