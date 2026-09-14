import type { Day, LibraryEntry, Plan, PlanSession, UserStateResult } from './types.ts';
import { totalSets } from '../safety/validator.ts';

const DAY_ROTATIONS: Record<number, Day[]> = {
  1: ['wed'],
  2: ['tue', 'sat'],
  3: ['mon', 'wed', 'sat'],
  4: ['mon', 'tue', 'thu', 'sat'],
  5: ['mon', 'tue', 'wed', 'fri', 'sat'],
};

/** Beginner sessions are built around this order so each one is balanced. */
const SESSION_SHAPES: string[][] = [
  ['mobility', 'squat', 'pull', 'core'],
  ['cardio', 'hinge', 'push', 'core'],
  ['mobility', 'lunge', 'push', 'pull'],
  ['cardio', 'squat', 'hinge', 'core'],
];

const TITLES: { th: string; en: string }[] = [
  { th: 'ขาและหลัง (เบา ๆ)', en: 'Legs & back (easy)' },
  { th: 'สะโพกและอก', en: 'Hips & chest' },
  { th: 'ทั้งตัว', en: 'Full body' },
  { th: 'ขาและแกนกลาง', en: 'Legs & core' },
];

export interface TemplateOpts {
  week_number: number;
  days_per_week: number;
  session_minutes: number;
  /** Hard cap on total sets, from derived.volume_ceiling_sets. */
  volume_ceiling_sets: number | null;
  gentle: boolean;
}

function pick(pool: LibraryEntry[], pattern: string, offset: number, used: Set<string>): LibraryEntry | null {
  const candidates = pool.filter((e) => e.pattern === pattern);
  if (!candidates.length) return null;
  for (let i = 0; i < candidates.length; i++) {
    const e = candidates[(offset + i) % candidates.length];
    if (!used.has(e.id)) return e;
  }
  return candidates[offset % candidates.length];
}

function loadNote(e: LibraryEntry, week: number, reps: number): string {
  if (e.pattern === 'cardio' && e.equipment.includes('treadmill')) return `${reps} นาที`;
  if (e.pattern === 'cardio' || e.pattern === 'mobility') return 'น้ำหนักตัว';
  if (e.equipment.includes('dumbbell')) return week <= 1 ? 'เบา' : 'เท่าเดิม';
  return 'น้ำหนักตัว';
}

function repsFor(e: LibraryEntry): number {
  if (e.pattern === 'cardio') return e.equipment.includes('treadmill') ? 12 : 10;
  if (e.pattern === 'mobility') return 8;
  if (e.pattern === 'core') return 12;
  return 10;
}

/**
 * Deterministic plan builder. Used by MockEngine for zero-token demos and as
 * the fallback when the model exhausts its save_plan retries — so the user
 * always ends up with a valid plan.
 */
export function buildTemplatePlan(
  library: LibraryEntry[],
  opts: TemplateOpts,
): Plan {
  const days = DAY_ROTATIONS[Math.min(Math.max(opts.days_per_week, 1), 5)] ?? DAY_ROTATIONS[3];
  const perSession = opts.session_minutes <= 20 ? 3
    : opts.session_minutes <= 30 ? 4
      : opts.session_minutes <= 45 ? 5 : 6;
  const baseSets = opts.gentle || opts.week_number <= 1 ? 2 : 3;

  const sessions: PlanSession[] = days.map((day, si) => {
    const shape = SESSION_SHAPES[(si + opts.week_number) % SESSION_SHAPES.length];
    const used = new Set<string>();
    const exercises = [];

    for (let i = 0; i < perSession; i++) {
      const pattern = shape[i % shape.length];
      let e = pick(library, pattern, si + opts.week_number + i, used);
      // Fall back to any unused exercise if the pattern is not represented in
      // this user's filtered library.
      if (!e) e = library.find((x) => !used.has(x.id)) ?? library[0];
      if (!e) break;
      used.add(e.id);
      const reps = repsFor(e);
      const sets = e.pattern === 'mobility' || e.pattern === 'cardio' ? 1 : baseSets;
      exercises.push({ exercise_id: e.id, sets, reps, load_note: loadNote(e, opts.week_number, reps) });
    }

    const title = TITLES[(si + opts.week_number) % TITLES.length];
    return {
      day,
      title_th: title.th,
      title_en: title.en,
      duration_min: Math.min(opts.session_minutes, 10 + exercises.length * 7),
      state: null,
      exercises,
    } satisfies PlanSession;
  });

  const plan: Plan = { week_number: opts.week_number, sessions };
  return trimToCeiling(plan, opts.volume_ceiling_sets);
}

/** Shed volume until the plan is under the validator's ceiling. */
export function trimToCeiling(plan: Plan, ceiling: number | null): Plan {
  if (!ceiling || ceiling <= 0) return plan;
  let guard = 200;
  while (totalSets(plan) > ceiling && guard-- > 0) {
    // 1. Shave a set off the heaviest exercise still above 1.
    const candidates: { s: number; e: number; sets: number }[] = [];
    plan.sessions.forEach((s, si) => s.exercises.forEach((x, xi) => {
      if (x.sets > 1) candidates.push({ s: si, e: xi, sets: x.sets });
    }));
    if (candidates.length) {
      const target = candidates.reduce((a, b) => (b.sets > a.sets ? b : a));
      plan.sessions[target.s].exercises[target.e].sets -= 1;
      continue;
    }
    // 2. Everything is at 1 set — drop the last exercise of the longest session.
    const longest = plan.sessions
      .map((s, i) => ({ i, n: s.exercises.length }))
      .sort((a, b) => b.n - a.n)[0];
    if (longest && longest.n > 1) {
      plan.sessions[longest.i].exercises.pop();
      plan.sessions[longest.i].duration_min = Math.max(
        10, 10 + plan.sessions[longest.i].exercises.length * 7,
      );
      continue;
    }
    // 3. Still over — drop a whole session.
    if (plan.sessions.length > 1) { plan.sessions.pop(); continue; }
    break;
  }
  return plan;
}

/** Ceiling to aim for given the user's history. */
export function ceilingFor(state: UserStateResult): number | null {
  return state.derived.volume_ceiling_sets;
}
