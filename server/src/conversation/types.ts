import type { Day } from '../engine/types.ts';

export interface QuickAction {
  label_th: string;
  label_en: string;
  /** Same postback payload the LINE buttons carry. */
  data: string;
}

export interface ChatExercise {
  exercise_id: string;
  name_th: string;
  name_en: string;
  sets: number;
  reps: number;
  load_note: string;
  video_url: string;
}

export interface ChatSessionSummary {
  index: number;
  day: Day;
  title_th: string;
  title_en: string;
  duration_min: number;
  exercise_count: number;
  /** Carried so LINE can render the full plan card without a second lookup. */
  exercises: ChatExercise[];
}

export interface MockRow {
  title_th: string; title_en: string;
  sub_th: string; sub_en: string;
  badge?: string;
}

/**
 * Surface-neutral cards. LINE renders them as Flex; the web app renders them
 * with its own components. Neither format leaks into the router.
 */
export type ChatCard =
  | {
    kind: 'plan';
    plan_id: string;
    week_number: number;
    why_th: string | null;
    why_en: string | null;
    volume_total_sets: number;
    delta_vs_prev_pct: number | null;
    sessions: ChatSessionSummary[];
  }
  | { kind: 'checkin'; week_number: number; sessions: ChatSessionSummary[] }
  | {
    kind: 'venue';
    name: string; area: string; price_tier: number; vetted: boolean;
    note_th: string | null; note_en: string | null;
    reasons_th: string[]; reasons_en: string[];
    lat?: number | null; lng?: number | null;
  }
  | { kind: 'handoff' }
  | {
    kind: 'mock_list';
    title_th: string; title_en: string;
    subtitle_th: string; subtitle_en: string;
    accent: string;
    rows: MockRow[];
    deep_link: string;
  };

/** One message from the coach, in both languages, independent of surface. */
export interface AgentMessage {
  text_th: string;
  text_en?: string;
  quick_replies?: QuickAction[];
  card?: ChatCard;
}

/** A normalised inbound event — from LINE, or from the web chat. */
export interface ChatEvent {
  type: 'follow' | 'text' | 'postback';
  source: 'line' | 'web' | 'script';
  /** LINE user id, or a web session marker. */
  external_id: string;
  text?: string;
  data?: string;
}
