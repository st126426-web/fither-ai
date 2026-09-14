// Seed data is imported (not read from disk) so the identical module graph
// works under tsx on Node and under esbuild/wrangler on Cloudflare Workers.
import exercisesJson from '../../seed/exercises.json';
import guideJson from '../../seed/exercise-guide.json';
import partnersJson from '../../seed/partners.json';
import mindJson from '../../seed/mind.json';
import mapsFallbackJson from '../../seed/maps-fallback.json';
import type { LibraryEntry } from '../engine/types.ts';
import type { PartnerRow } from '../storage/types.ts';

type Guide = { steps_th: string[]; steps_en: string[]; mistake_th: string; mistake_en: string };
const GUIDE = guideJson as unknown as Record<string, Guide>;

/**
 * Beginners need to know *how*, not just *what*. Each exercise carries three
 * cues and the single most common mistake, in both languages.
 */
export const EXERCISES: LibraryEntry[] = (exercisesJson as LibraryEntry[]).map((e) => ({
  ...e,
  steps_th: GUIDE[e.id]?.steps_th ?? [],
  steps_en: GUIDE[e.id]?.steps_en ?? [],
  mistake_th: GUIDE[e.id]?.mistake_th ?? '',
  mistake_en: GUIDE[e.id]?.mistake_en ?? '',
}));

export const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export const MIND = mindJson as {
  id: string; display_name: string; line_user_id: string | null;
  goal: string; days_per_week: number; session_minutes: number;
  equipment: string[]; experience: string; life_stage: string; language: string;
  coach_tone?: string; motivation?: string;
};

export const MAPS_FALLBACK = mapsFallbackJson as {
  disclaimer_th: string; disclaimer_en: string;
  venues: { name: string; area: string; note: string; note_en: string }[];
};

export const PARTNER_ROWS: PartnerRow[] = (partnersJson as {
  id: string; name: string; area: string; price_tier: number;
  beginner_friendly: number; tags: string[]; lat: number; lng: number;
  note: string; note_en: string;
}[]).map((p) => ({
  id: p.id,
  name: p.name,
  area: p.area,
  price_tier: p.price_tier,
  beginner_friendly: p.beginner_friendly,
  tags_json: JSON.stringify(p.tags),
  lat: p.lat,
  lng: p.lng,
  note: p.note,
  note_en: p.note_en,
}));
