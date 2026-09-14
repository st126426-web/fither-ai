import { RULES } from '../safety/validator.ts';
import { EXERCISES } from './seed.ts';
import type { LibraryEntry } from '../engine/types.ts';

export function uid(prefix = ''): string {
  const r = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${r.replace(/-/g, '').slice(0, 12)}` : r;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export interface LibraryFilter {
  equipment: string[];
  experience: string;
  life_stage: string | null;
}

/**
 * Pre-filters the library before it is injected into the prompt. This is why
 * UNKNOWN_EXERCISE_ID / EQUIPMENT_MISMATCH are near-impossible rather than
 * merely caught after the fact.
 */
export function filterLibrary(f: LibraryFilter): {
  allowed: LibraryEntry[];
  excluded_reason: Record<string, string>;
} {
  const equipment = new Set(f.equipment.map((e) => e.toLowerCase()));
  const levels: string[] = (RULES.experience_tiers as Record<string, string[]>)[f.experience] ?? ['beginner'];
  const banned: string[] =
    (RULES.life_stage_contraindications as Record<string, string[]>)[f.life_stage ?? 'none'] ?? [];

  const allowed: LibraryEntry[] = [];
  const excluded_reason: Record<string, string> = {};

  for (const e of EXERCISES) {
    if (!e.equipment.some((eq) => equipment.has(eq.toLowerCase()))) {
      excluded_reason[e.id] = `needs ${e.equipment.join('/')}`;
      continue;
    }
    if (!levels.includes(e.level)) {
      excluded_reason[e.id] = `level ${e.level}`;
      continue;
    }
    const hit = e.contraindications.find((c) => banned.includes(c));
    if (hit) {
      excluded_reason[e.id] = `contraindicated: ${hit}`;
      continue;
    }
    allowed.push(e);
  }
  return { allowed, excluded_reason };
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const DAY_TH: Record<string, string> = {
  mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี',
  fri: 'ศุกร์', sat: 'เสาร์', sun: 'อาทิตย์',
};

export const DAY_EN: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export const GOAL_TH: Record<string, string> = {
  strength: 'แข็งแรงขึ้น',
  fat_loss: 'ลดไขมัน',
  energy: 'มีแรงมากขึ้น',
  habit: 'สร้างนิสัยออกกำลังกาย',
};

export const GOAL_EN: Record<string, string> = {
  strength: 'getting stronger',
  fat_loss: 'losing fat',
  energy: 'more energy',
  habit: 'building the habit',
};

export const EQUIPMENT_TH: Record<string, string> = {
  bodyweight: 'น้ำหนักตัว',
  dumbbell: 'ดัมเบล',
  treadmill: 'ลู่วิ่ง',
  mat: 'เสื่อโยคะ',
  bench: 'ม้านั่ง',
  resistance_band: 'ยางยืด',
  kettlebell: 'เคทเทิลเบล',
  box: 'กล่อง/ขั้นบันได',
};

/**
 * Reply in the language she wrote in. A Thai-first product still has to answer
 * an English question in English — anything else reads as broken.
 * Any Thai script at all means Thai; otherwise Latin letters mean English.
 */
export function detectLang(text?: string | null): 'th' | 'en' {
  if (!text) return 'th';
  const thai = (text.match(/[\u0E00-\u0E7F]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return thai === 0 && latin > 0 ? 'en' : 'th';
}
