import type { MapsFallbackResult, PartnerSearchResult } from '../engine/types.ts';
import { MAPS_FALLBACK } from '../lib/seed.ts';
import { parseJson } from '../lib/util.ts';
import type { Storage } from '../storage/types.ts';

const TAG_REASON_TH: Record<string, string> = {
  'ladies-hours': 'มีช่วงเวลาเฉพาะผู้หญิง',
  'ladies-only': 'ยิมผู้หญิงล้วน',
  'small-group': 'คลาสกลุ่มเล็ก ไม่กดดัน',
  'pt-included': 'มีเทรนเนอร์ช่วยดูฟอร์ม',
  'beginner-course': 'มีคอร์สปูพื้นฐานสำหรับมือใหม่',
  budget: 'ราคาย่อมเยา',
  'low-impact': 'แรงกระแทกต่ำ',
  'postpartum-friendly': 'รองรับคุณแม่หลังคลอด',
  'walk-in': 'เข้าใช้แบบรายครั้งได้',
  '24h': 'เปิด 24 ชั่วโมง',
  pool: 'มีสระว่ายน้ำ',
  parking: 'มีที่จอดรถ',
  shower: 'มีห้องอาบน้ำ',
};

const TAG_REASON_EN: Record<string, string> = {
  'ladies-hours': 'Has women-only hours',
  'ladies-only': 'Women-only gym',
  'small-group': 'Small classes, low pressure',
  'pt-included': 'A trainer checks your form',
  'beginner-course': 'Runs a foundations course for beginners',
  budget: 'Affordable',
  'low-impact': 'Low impact',
  'postpartum-friendly': 'Postpartum friendly',
  'walk-in': 'Pay per visit, no membership',
  '24h': 'Open 24 hours',
  pool: 'Has a pool',
  parking: 'Has parking',
  shower: 'Has showers',
};

const VETTED_TH = 'ผ่านการตรวจสอบว่าเป็นมิตรกับมือใหม่';
const VETTED_EN = 'Vetted as beginner-friendly';

/**
 * Areas are stored in English but the user — and therefore the agent — writes
 * them in Thai. Without this, "ลาดพร้าว" matched nothing and the agent fell
 * through to the unvetted maps fallback even though a vetted Ladprao gym
 * exists. Matching is on the canonical English name.
 */
const AREA_ALIASES: Record<string, string> = {
  อารีย์: 'Ari', อารี: 'Ari',
  สาทร: 'Sathorn',
  ลาดพร้าว: 'Ladprao',
  ทองหล่อ: 'Thonglor',
  รัชดา: 'Ratchada', รัชดาภิเษก: 'Ratchada',
  อ่อนนุช: 'On Nut', ออนนุช: 'On Nut',
  บางนา: 'Bangna',
  สีลม: 'Silom',
  สุขุมวิท: 'Sukhumvit',
  พร้อมพงษ์: 'Phrom Phong',
  ลุมพินี: 'Lumpini',
};

export function normaliseArea(input?: string): string | undefined {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;
  const direct = AREA_ALIASES[raw];
  if (direct) return direct;
  // Tolerate "แถวลาดพร้าว" / "Ladprao area" by looking for a known name inside.
  const lower = raw.toLowerCase();
  for (const [th, en] of Object.entries(AREA_ALIASES)) {
    if (raw.includes(th)) return en;
    if (lower.includes(en.toLowerCase())) return en;
  }
  return raw;
}

/** Tool 3: search_partners — beginner-vetted venues from the seeded DB. */
export async function searchPartners(
  storage: Storage,
  args: {
    area?: string; price_tier_max?: number; tags?: string[];
    beginner_friendly_only?: boolean; limit?: number;
  },
): Promise<PartnerSearchResult> {
  const area = normaliseArea(args.area);
  let rows = await storage.searchPartners({
    area,
    price_tier_max: args.price_tier_max,
    tags: args.tags,
    beginner_friendly_only: args.beginner_friendly_only ?? true,
    limit: args.limit ?? 3,
  });

  // A vetted partner in the wrong district still beats an unvetted stranger,
  // so widen the search before letting the agent reach for maps_fallback.
  if (rows.length === 0 && area) {
    rows = await storage.searchPartners({
      price_tier_max: args.price_tier_max,
      tags: args.tags,
      beginner_friendly_only: args.beginner_friendly_only ?? true,
      limit: args.limit ?? 3,
    });
  }

  const results = rows.map((r) => {
    const tags = parseJson<string[]>(r.tags_json, []);
    const match_reasons: string[] = [];
    const match_reasons_en: string[] = [];
    if (r.beginner_friendly) { match_reasons.push(VETTED_TH); match_reasons_en.push(VETTED_EN); }
    for (const t of tags) {
      if (TAG_REASON_TH[t]) { match_reasons.push(TAG_REASON_TH[t]); match_reasons_en.push(TAG_REASON_EN[t] ?? t); }
      if (match_reasons.length >= 3) break;
    }
    return {
      partner_id: r.id,
      name: r.name,
      area: r.area,
      price_tier: r.price_tier,
      beginner_friendly: !!r.beginner_friendly,
      tags,
      lat: r.lat,
      lng: r.lng,
      note: r.note,
      note_en: r.note_en,
      match_reasons,
      match_reasons_en,
    };
  });

  return { count: results.length, results };
}

/**
 * Tool 4: maps_fallback — a deliberate stub over static JSON. Always labelled
 * vetted:false so the agent has to say so.
 */
export async function mapsFallback(args: { query: string; area?: string }): Promise<MapsFallbackResult> {
  const q = (args.query ?? '').toLowerCase();
  const area = (args.area ?? '').toLowerCase();
  const all = MAPS_FALLBACK.venues;
  const filtered = area
    ? all.filter((v) => v.area.toLowerCase().includes(area))
    : all.filter((v) => !q || v.name.toLowerCase().includes(q) || v.note.toLowerCase().includes(q));

  return {
    vetted: false,
    results: (filtered.length ? filtered : all).slice(0, 3),
    disclaimer_th: MAPS_FALLBACK.disclaimer_th,
    disclaimer_en: MAPS_FALLBACK.disclaimer_en,
  };
}
