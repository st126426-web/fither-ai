export const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:8787';
export const DEMO_POLISH = (import.meta.env.VITE_DEMO_POLISH as string) === 'true';

export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface PlanExercise { exercise_id: string; sets: number; reps: number; load_note: string }
export interface PlanSession {
  day: Day; title_th: string; title_en: string; duration_min: number;
  state?: 'done' | 'skipped' | null; exercises: PlanExercise[];
}
export interface Plan { week_number: number; sessions: PlanSession[] }

export interface Exercise {
  id: string; name_en: string; name_th: string; equipment: string[];
  level: string; pattern: string; video_url: string; tip_th: string; tip_en: string;
  steps_th?: string[]; steps_en?: string[]; mistake_th?: string; mistake_en?: string;
}

export interface AppState {
  onboarded: boolean;
  missing_fields: string[];
  user: {
    id: string; display_name: string; goal: string | null;
    days_per_week: number | null; session_minutes: number | null;
    equipment: string[]; experience: string | null; life_stage: string | null; language: string;
    coach_tone: string | null; tone_note: string | null; motivation: string | null;
    target_weeks: number | null; target_event: string | null;
    age: number | null; height_cm: number | null; weight_kg: number | null; bmi: number | null;
    injuries: string | null; sleep_hours: number | null; activity_level: string | null;
    train_time: string | null; dislikes: string | null;
  } | null;
  active_plan: { plan_id: string; week_number: number; why_th: string | null; why_en: string | null; plan: Plan | null } | null;
  history: {
    plan_id: string; week_number: number; status: string; volume_total_sets: number;
    why_th: string | null; why_en: string | null; engine: string | null;
    created_at: string; sessions: number;
  }[];
  volume_changes: Record<string, number | null>;
  checkins: { week_number: number; completion_pct: number; notes: string | null; flags: unknown[] }[];
  events: { id: string; type: string; payload: Record<string, unknown>; created_at: string }[];
  venue: Record<string, unknown> | null;
  coach_handoff: boolean;
  streak: { weeks: number; forgiven: number };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  state: (userId: string) => req<AppState>(`/api/state/${userId}`),
  exercises: () => req<Exercise[]>('/api/exercises'),
  usage: () => req<{ by_engine: { engine: string; calls: number; input_tokens: number; output_tokens: number }[]; total: { calls: number; input_tokens: number; output_tokens: number }; engine: string }>('/api/usage'),
  updateProfile: (userId: string, body: Record<string, unknown>) =>
    req<{ ok: boolean }>(`/api/user/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  setSessionState: (planId: string, index: number, state: 'done' | 'skipped' | null) =>
    req<{ ok: boolean; plan: Plan }>(`/api/plan/${planId}/session-state`, {
      method: 'POST', body: JSON.stringify({ index, state }),
    }),
  moveDay: (planId: string, index: number, day: Day) =>
    req<{ ok: boolean; plan: Plan }>(`/api/plan/${planId}/move-day`, {
      method: 'POST', body: JSON.stringify({ index, day }),
    }),
  reset: (userId: string) => req<{ ok: boolean }>(`/api/demo-reset/${userId}`, { method: 'POST' }),
};

export type Lang = 'th' | 'en';

export const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DAY: Record<Lang, Record<string, string>> = {
  th: { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัส', fri: 'ศุกร์', sat: 'เสาร์', sun: 'อาทิตย์' },
  en: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
};
const DAY_SHORT: Record<Lang, Record<string, string>> = {
  th: { mon: 'จ', tue: 'อ', wed: 'พ', thu: 'พฤ', fri: 'ศ', sat: 'ส', sun: 'อา' },
  en: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' },
};
const GOAL: Record<Lang, Record<string, string>> = {
  th: { strength: 'แข็งแรงขึ้น', fat_loss: 'ลดไขมัน', energy: 'มีแรงมากขึ้น', habit: 'สร้างนิสัย' },
  en: { strength: 'Get stronger', fat_loss: 'Lose fat', energy: 'More energy', habit: 'Build the habit' },
};
const EQUIPMENT: Record<Lang, Record<string, string>> = {
  th: {
    bodyweight: 'น้ำหนักตัว', dumbbell: 'ดัมเบล', treadmill: 'ลู่วิ่ง', mat: 'เสื่อโยคะ',
    bench: 'ม้านั่ง', resistance_band: 'ยางยืด', kettlebell: 'เคทเทิลเบล', box: 'กล่อง/ขั้นบันได',
  },
  en: {
    bodyweight: 'Bodyweight', dumbbell: 'Dumbbells', treadmill: 'Treadmill', mat: 'Yoga mat',
    bench: 'Bench', resistance_band: 'Resistance band', kettlebell: 'Kettlebell', box: 'Box / step',
  },
};
const EXPERIENCE: Record<Lang, Record<string, string>> = {
  th: { beginner: 'ไม่เคยเลย', returning: 'เคย แต่หยุดไปนาน', intermediate: 'ออกอยู่เรื่อย ๆ' },
  en: { beginner: 'Never before', returning: 'Used to, stopped a while', intermediate: 'Train regularly' },
};
const TONE: Record<Lang, Record<string, string>> = {
  th: { gentle: 'อ่อนโยน ไม่กดดัน', balanced: 'ปกติ', firm: 'ตรงไปตรงมา ช่วยผลัก' },
  en: { gentle: 'Gentle, no pressure', balanced: 'Balanced', firm: 'Direct, push me' },
};
const LIFE_STAGE: Record<Lang, Record<string, string>> = {
  th: { none: 'ไม่มี', postpartum: 'หลังคลอด', perimenopause: 'ใกล้วัยทอง', pregnant: 'ตั้งครรภ์' },
  en: { none: 'None', postpartum: 'Postpartum', perimenopause: 'Perimenopause', pregnant: 'Pregnant' },
};
const EVENT_LABEL: Record<Lang, Record<string, string>> = {
  th: {
    joined: 'เริ่มใช้ FitHer',
    plan_created: 'สร้างแผนสัปดาห์แรก',
    plan_replanned: 'ปรับแผนใหม่',
    plan_rejected: 'แผนไม่ผ่านการตรวจความปลอดภัย',
    checkin_recorded: 'เช็คอินประจำสัปดาห์',
    venue_recommended: 'แนะนำที่ออกกำลังกาย',
    red_flag_handoff: 'ส่งต่อให้โค้ชที่เป็นคน',
    profile_updated: 'แก้ไขโปรไฟล์',
    template_fallback_used: 'ใช้แผนสำรอง',
  },
  en: {
    joined: 'Joined FitHer',
    plan_created: 'First week created',
    plan_replanned: 'Plan adjusted',
    plan_rejected: 'Plan rejected by the safety check',
    checkin_recorded: 'Weekly check-in',
    venue_recommended: 'Gym recommended',
    red_flag_handoff: 'Handed to a human coach',
    profile_updated: 'Profile updated',
    template_fallback_used: 'Fallback plan used',
  },
};

export const dayLabel = (d: string, lang: Lang) => DAY[lang][d] ?? d;
export const dayShort = (d: string, lang: Lang) => DAY_SHORT[lang][d] ?? d;
export const dayBadge = (d: string, lang: Lang) =>
  (lang === 'th' ? (DAY[lang][d] ?? d).slice(0, 2) : (DAY_SHORT[lang][d] ?? d));
export const goalLabel = (g: string | null, lang: Lang) => (g ? GOAL[lang][g] ?? g : '');
export const equipmentLabel = (e: string, lang: Lang) => EQUIPMENT[lang][e] ?? e;
export const experienceLabel = (e: string, lang: Lang) => EXPERIENCE[lang][e] ?? e;
export const toneLabel = (t: string, lang: Lang) => TONE[lang][t] ?? t;
export const lifeStageLabel = (s: string, lang: Lang) => LIFE_STAGE[lang][s] ?? s;
export const eventLabel = (type: string, lang: Lang) => EVENT_LABEL[lang][type] ?? type;

export function totalSets(plan: Plan | null): number {
  if (!plan) return 0;
  return plan.sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets, 0), 0);
}

