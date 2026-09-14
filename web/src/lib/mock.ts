// MOCK-ONLY data. Bundled into the static build at compile time — the mock
// sections make zero network calls and keep working with the API down.
import meals from '../../../server/seed/mock/meals.json';
import communities from '../../../server/seed/mock/communities.json';
import events from '../../../server/seed/mock/events.json';
import coaches from '../../../server/seed/mock/coaches.json';
import weeklyFeed from '../../../server/seed/mock/weekly-feed.json';
import challenges from '../../../server/seed/mock/challenges.json';
import bodyStats from '../../../server/seed/mock/body-stats.json';

export interface Meal {
  id: string; title_th: string; title_en: string; goal: string;
  kcal: number; protein_g: number; carb_g: number; fat_g: number;
  meal: string; tint: string; tags_th: string[]; tags_en: string[];
}
export interface Community {
  id: string; name_th: string; name_en: string; area: string; members: number;
  when_th: string; when_en: string; level_th: string; level_en: string;
  tint: string; blurb_th: string; blurb_en: string;
}
export interface EventItem {
  id: string; title_th: string; title_en: string; date: string;
  area: string; price_th: string; price_en: string; tint: string; spots_left: number;
}
export interface Coach {
  id: string; name_th: string; name_en: string; initials: string; tint: string;
  match_pct: number; specialty_th: string; specialty_en: string;
  style_tags_th: string[]; style_tags_en: string[];
  price_th: string; price_en: string; area: string; years: number;
}
export interface FeedItem {
  id: string; kind: string; title_th: string; title_en: string;
  body_th: string; body_en: string; tint: string; icon: string;
}
export interface Challenge {
  id: string; title_th: string; title_en: string; progress: number; target: number;
  unit_th: string; unit_en: string; badge: string; state: string; tint: string;
}

export const MEALS = meals as Meal[];
export const COMMUNITIES = communities as Community[];
export const EVENTS = events as EventItem[];
export const COACHES = coaches as Coach[];
export const FEED = weeklyFeed as FeedItem[];
export const CHALLENGES = challenges as Challenge[];
export const BODY_STATS = bodyStats as {
  weight_kg: { date: string; value: number }[];
  measurements: { label_th: string; label_en: string; value: number; unit: string; delta: number }[];
};

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string, lang: 'th' | 'en'): string {
  const d = new Date(iso);
  const months = lang === 'en' ? MONTHS_EN : MONTHS_TH;
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
