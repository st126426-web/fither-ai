import rules from './rules.json';
import { PlanSchema, type LibraryEntry, type Plan, type SafetyFlag, type ValidationCode, type ValidationError } from '../engine/types.ts';

export const RULES = rules;

export interface ValidationContext {
  library: LibraryEntry[];
  equipment: string[];
  experience: string;
  life_stage: string | null;
  session_minutes: number;
  days_per_week: number;
  /** Total sets of the last active plan. null on week 1. */
  last_active_volume_sets: number | null;
  missed_last_week: boolean;
  why_th?: string;
  why_en?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  volume_total_sets: number;
  delta_vs_prev_pct: number | null;
  /** The coerced, schema-valid plan. Present only when parsing succeeded. */
  plan?: Plan;
}

export function totalSets(plan: Plan): number {
  return plan.sessions.reduce(
    (sum, s) => sum + s.exercises.reduce((n, e) => n + e.sets, 0),
    0,
  );
}

function err(code: ValidationCode, path: string, message_en: string, fix_hint: string): ValidationError {
  return { code, path, message_en, fix_hint };
}

const DAY_ALIASES: Record<string, string> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu',
  friday: 'fri', saturday: 'sat', sunday: 'sun',
  จันทร์: 'mon', อังคาร: 'tue', พุธ: 'wed', พฤหัสบดี: 'thu', พฤหัส: 'thu',
  ศุกร์: 'fri', เสาร์: 'sat', อาทิตย์: 'sun',
};

/**
 * Normalises harmless representation differences before validation: a plan
 * handed over as a JSON string, a day written as "Monday" or "จันทร์", a
 * missing load_note. Anything genuinely ambiguous (a day as a number) is left
 * alone so it fails loudly rather than being silently guessed at.
 */
export function coercePlan(raw: unknown): unknown {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return raw; }
  }
  if (!value || typeof value !== 'object') return value;

  const plan = value as { sessions?: unknown };
  if (!Array.isArray(plan.sessions)) return value;

  for (const s of plan.sessions) {
    if (!s || typeof s !== 'object') continue;
    const session = s as { day?: unknown; exercises?: unknown };
    if (typeof session.day === 'string') {
      const key = session.day.trim().toLowerCase();
      session.day = DAY_ALIASES[key] ?? key.slice(0, 3);
    }
    if (Array.isArray(session.exercises)) {
      for (const x of session.exercises) {
        if (x && typeof x === 'object' && (x as { load_note?: unknown }).load_note == null) {
          (x as { load_note?: unknown }).load_note = '';
        }
      }
    }
  }
  return value;
}

/**
 * A load note is acceptable when it contains no jump phrase and is built
 * entirely from recognised segments. The rule exists to stop progression
 * leaps ("เพิ่มเป็น 20 kg"), not to police formatting — so a composed note
 * like "10 นาที ชัน 3%" passes.
 */
export function loadNoteOk(note: string): boolean {
  let rest = (note ?? '').trim();
  if (!rest) return true;
  if (rules.load_note.deny_patterns.some((p) => new RegExp(p, 'i').test(rest))) return false;

  let guard = 12;
  while (rest && guard-- > 0) {
    const match = rules.load_note.segment_patterns
      .map((p) => new RegExp(p, 'i').exec(rest))
      .find((m) => m && m[0].length > 0);
    if (!match) return false;
    rest = rest.slice(match[0].length).replace(/^[\s,;/·]+/, '');
  }
  return rest.length === 0;
}

/**
 * The deterministic gate. The model never decides whether a plan is safe —
 * this does, and it runs before anything is written to storage.
 */
export function validatePlan(raw: unknown, ctx: ValidationContext): ValidationResult {
  const parsed = PlanSchema.safeParse(coercePlan(raw));
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 6).map((i) => {
      const path = i.path.join('.') || 'plan';
      const isRange = i.code === 'too_big' || i.code === 'too_small';
      // Only call it a range violation when it actually is one. Labelling a
      // missing field "REPS_OUT_OF_RANGE" sends the model off fixing the
      // wrong thing, which is exactly how a retry gets wasted.
      let code: ValidationCode = 'SCHEMA_INVALID';
      if (isRange && /\.sets$/.test(path)) code = 'SETS_OUT_OF_RANGE';
      else if (isRange && /\.reps$/.test(path)) code = 'REPS_OUT_OF_RANGE';

      const hint = isRange
        ? `Keep ${path.split('.').pop()} within the documented range.`
        : `Field "${path}" is wrong or missing. Return JSON matching PlanSchema exactly.`;
      return err(code, path, i.message, hint);
    });
    return { ok: false, errors, volume_total_sets: 0, delta_vs_prev_pct: null };
  }

  const plan = parsed.data;
  const errors: ValidationError[] = [];
  const byId = new Map(ctx.library.map((e) => [e.id, e]));
  const allowedLevels: string[] =
    (rules.experience_tiers as Record<string, string[]>)[ctx.experience] ?? ['beginner'];
  const banned: string[] =
    (rules.life_stage_contraindications as Record<string, string[]>)[ctx.life_stage ?? 'none'] ?? [];
  const equipment = new Set(ctx.equipment.map((e) => e.toLowerCase()));

  // --- session-level rules -------------------------------------------
  if (plan.sessions.length > ctx.days_per_week + rules.session.max_sessions_per_week_over_target) {
    errors.push(err(
      'TOO_MANY_SESSIONS', 'sessions',
      `Plan has ${plan.sessions.length} sessions but the user trains ${ctx.days_per_week} days/week.`,
      `Return at most ${ctx.days_per_week} sessions.`,
    ));
  }

  plan.sessions.forEach((s, si) => {
    if (s.duration_min > ctx.session_minutes + rules.session.duration_tolerance_min) {
      errors.push(err(
        'SESSION_TOO_LONG', `sessions[${si}].duration_min`,
        `Session is ${s.duration_min} min but the user's limit is ${ctx.session_minutes} min.`,
        `Cut exercises until duration_min <= ${ctx.session_minutes}.`,
      ));
    }

    s.exercises.forEach((x, xi) => {
      const p = `sessions[${si}].exercises[${xi}]`;
      const lib = byId.get(x.exercise_id);

      if (!lib) {
        errors.push(err(
          'UNKNOWN_EXERCISE_ID', `${p}.exercise_id`,
          `"${x.exercise_id}" is not in the exercise library.`,
          'Use only exercise IDs from the provided library list.',
        ));
        return;
      }

      const fits = lib.equipment.some((e) => equipment.has(e.toLowerCase()));
      if (!fits) {
        errors.push(err(
          'EQUIPMENT_MISMATCH', `${p}.exercise_id`,
          `"${lib.id}" needs ${lib.equipment.join('/')} but the user has ${ctx.equipment.join('/')}.`,
          'Swap for an exercise that matches the user\'s equipment.',
        ));
      }

      if (!allowedLevels.includes(lib.level)) {
        errors.push(err(
          'LEVEL_TOO_ADVANCED', `${p}.exercise_id`,
          `"${lib.id}" is ${lib.level} but the user is ${ctx.experience}.`,
          'Pick a beginner-level exercise instead.',
        ));
      }

      const hit = lib.contraindications.find((c) => banned.includes(c));
      if (hit) {
        errors.push(err(
          'CONTRAINDICATION', `${p}.exercise_id`,
          `"${lib.id}" is tagged ${hit}, blocked for life stage "${ctx.life_stage}".`,
          `Avoid any exercise tagged ${banned.join(', ')}.`,
        ));
      }

      if (x.sets < rules.ranges.sets_min || x.sets > rules.ranges.sets_max) {
        errors.push(err(
          'SETS_OUT_OF_RANGE', `${p}.sets`,
          `sets=${x.sets} is outside ${rules.ranges.sets_min}-${rules.ranges.sets_max}.`,
          `Use ${rules.ranges.sets_min}-${rules.ranges.sets_max} sets.`,
        ));
      }

      if (x.reps < rules.ranges.reps_min || x.reps > rules.ranges.reps_max) {
        errors.push(err(
          'REPS_OUT_OF_RANGE', `${p}.reps`,
          `reps=${x.reps} is outside ${rules.ranges.reps_min}-${rules.ranges.reps_max}.`,
          `Use ${rules.ranges.reps_min}-${rules.ranges.reps_max} reps.`,
        ));
      }

      if (!loadNoteOk(x.load_note)) {
        errors.push(err(
          'LOAD_JUMP_TOO_BIG', `${p}.load_note`,
          `load_note "${x.load_note}" is not a recognised, gradual progression.`,
          'Use "เท่าเดิม", "+1 step", a weight like "4 kg ต่อข้าง", or minutes for cardio.',
        ));
      }
    });
  });

  // --- weekly volume rules -------------------------------------------
  const volume = totalSets(plan);
  let delta: number | null = null;
  if (ctx.last_active_volume_sets && ctx.last_active_volume_sets > 0) {
    const prev = ctx.last_active_volume_sets;
    delta = Math.round(((volume - prev) / prev) * 1000) / 10;

    if (ctx.missed_last_week) {
      const required = rules.volume.min_decrease_after_missed_week_pct;
      if (delta > -required) {
        errors.push(err(
          'VOLUME_NOT_REDUCED_AFTER_MISSED_WEEK', 'sessions',
          `After a missed week volume must drop at least ${required}% (was ${prev} sets, now ${volume}, ${delta}%).`,
          `Return a plan with at most ${Math.floor(prev * (1 - required / 100))} total sets.`,
        ));
      }
    } else if (delta > rules.volume.max_increase_pct) {
      errors.push(err(
        'VOLUME_INCREASE_EXCEEDED', 'sessions',
        `Volume rose ${delta}% (${prev} -> ${volume} sets); the cap is ${rules.volume.max_increase_pct}%.`,
        `Return a plan with at most ${Math.floor(prev * (1 + rules.volume.max_increase_pct / 100))} total sets.`,
      ));
    }
  }

  // --- guilt language in the why-line --------------------------------
  const guilt = findGuiltWords(`${ctx.why_th ?? ''} ${ctx.why_en ?? ''}`);
  if (guilt.length) {
    errors.push(err(
      'GUILT_LANGUAGE', 'why_text',
      `The why-line contains guilt language: ${guilt.join(', ')}.`,
      'Rewrite without blame. A missed week is information, not a failure.',
    ));
  }

  return { ok: errors.length === 0, errors, volume_total_sets: volume, delta_vs_prev_pct: delta, plan };
}

export function findGuiltWords(text: string): string[] {
  const lower = (text ?? '').toLowerCase();
  return rules.guilt_words.filter((w) => lower.includes(w.toLowerCase()));
}

/** "no", "not", "np", "don't" … — checked as whole tokens, not substrings. */
const EN_NEGATORS = new Set([
  'no', 'not', 'none', 'never', 'without', 'np', 'nope', 'nil', 'zero',
  'nothing', 'dont', 'doesnt', 'didnt', 'havent', 'hasnt', 'isnt', 'wasnt', 'cant',
]);
const TH_NEGATORS = ['ไม่มี', 'ไม่ได้', 'ยังไม่', 'ไม่', 'ปราศจาก'];

/** How close a negator has to sit to count as negating this term. */
const EN_NEGATION_TOKENS = 3;
const TH_NEGATION_CHARS = 12;

const isAscii = (s: string) => !/[^ -]/.test(s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every index where `term` occurs as a word.
 *
 * Latin terms anchor to a word START but deliberately allow suffixes, so
 * "sprain" still catches "sprained". Thai has no word spacing, so it falls back
 * to a plain substring scan — which is exactly why `not_when` exists below.
 */
function* occurrences(hay: string, term: string): Generator<number> {
  if (isAscii(term)) {
    for (const m of hay.matchAll(new RegExp(`(?<![a-z])${escapeRe(term)}`, 'g'))) {
      yield m.index!;
    }
    return;
  }
  for (let from = 0; ; ) {
    const at = hay.indexOf(term, from);
    if (at === -1) return;
    yield at;
    from = at + term.length;
  }
}

/** "no injury", "np injury", "ไม่มีบาดเจ็บ" — she is answering, not reporting. */
function isNegated(hay: string, at: number): boolean {
  const before = hay.slice(Math.max(0, at - 40), at);

  if (TH_NEGATORS.some((n) => before.slice(-TH_NEGATION_CHARS).includes(n))) return true;

  const tokens = before.split(/[^a-z']+/).map((w) => w.replace(/'/g, '')).filter(Boolean);
  return tokens.slice(-EN_NEGATION_TOKENS).some((w) => EN_NEGATORS.has(w));
}

/**
 * A match that is really part of a longer, harmless word.
 *
 * This matters most for Thai: ท้อง means "pregnant" but is also inside หน้าท้อง
 * ("abdomen") and ท้องเสีย ("diarrhoea"). Without this, "อยากลดหน้าท้อง" —
 * "I want to lose belly fat", one of the most common goals this product exists
 * to serve — was read as a pregnancy disclosure and handed to a human coach.
 */
function inExcludedContext(hay: string, at: number, term: string, notWhen: string[]): boolean {
  return notWhen.some((phrase) => {
    for (let from = 0; ; ) {
      const p = hay.indexOf(phrase, from);
      if (p === -1) return false;
      if (at >= p && at + term.length <= p + phrase.length) return true;
      from = p + 1;
    }
  });
}

/**
 * Runs on raw user text BEFORE any engine call, so safety never depends on
 * a model round-trip succeeding.
 *
 * Suppression is opt-in per rule, never global. Only rules the coach actually
 * asks about — pain, injury, pregnancy — set `negatable`, because those are the
 * ones where "no" is the expected answer. Acute signals (chest, dizziness,
 * distress) always flag: "no chest pain" blocking is a cheap false positive,
 * and missing a real one is not a mistake worth risking.
 */
export function scanRedFlags(text: string | undefined | null): SafetyFlag[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const flags: SafetyFlag[] = [];

  for (const rule of rules.red_flags) {
    const r = rule as typeof rule & { negatable?: boolean; not_when?: string[] };
    const notWhen = r.not_when ?? [];

    for (const term of rule.terms) {
      const t = term.toLowerCase();
      let hit = false;

      for (const at of occurrences(lower, t)) {
        if (inExcludedContext(lower, at, t, notWhen)) continue;
        if (r.negatable && isNegated(lower, at)) continue;
        hit = true;
        break;
      }

      if (!hit) continue;
      flags.push({
        code: rule.code,
        matched_term: term,
        severity: rule.severity as 'block' | 'warn',
        warn_intents: (rule as { warn_intents?: string[] }).warn_intents ?? [],
      });
      break;
    }
  }
  return flags;
}

/**
 * Whether these flags stop planning *in this context*.
 *
 * A generic ache is the most common reason a beginner starts training at all
 * ("my back hurts when I carry my kid"). Blocking onboarding on it makes the
 * product unusable, so `warn_intents` in rules.json downgrades those to a
 * warning — still recorded, still surfaced to the agent, but the conversation
 * continues. Acute signals (injury, chest, dizziness, pregnancy, distress)
 * block in every context.
 */
export function hasBlockingFlag(flags: SafetyFlag[], intent?: string): boolean {
  return flags.some((f) => f.severity === 'block' && !(intent && f.warn_intents?.includes(intent)));
}

/** Flags that did not block but the agent must still respond to. */
export function warningFlags(flags: SafetyFlag[], intent?: string): SafetyFlag[] {
  return flags.filter((f) => f.severity !== 'block' || (intent && f.warn_intents?.includes(intent)));
}

/**
 * Last-resort guard against LINE rejecting an oversized message. LINE's real
 * text cap is 5000 characters, and the adapter already slices at 4900, so this
 * should essentially never fire — it used to sit at 500, which silently chopped
 * ordinary coach replies mid-word ("…and we'l…") and read as the agent breaking
 * off mid-sentence. Reply brevity is a prompt concern, not a validator one.
 *
 * When it does fire, prefer a sentence end, then a word break, so the trimmed
 * reply still reads as a finished thought.
 */
export function clampReply(text: string, max = rules.reply.max_chars): string {
  const t = (text ?? '').trim();
  if (t.length <= max) return t;

  const head = t.slice(0, max - 1);
  const floor = Math.floor(max * 0.6);
  const sentenceEnd = Math.max(
    head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('\n'),
  );
  if (sentenceEnd > floor) return `${t.slice(0, sentenceEnd + 1).trimEnd()}…`;

  // Thai does not space between words, so this often finds nothing — the hard
  // cut below is the correct fallback there rather than a bug.
  const wordEnd = head.lastIndexOf(' ');
  if (wordEnd > floor) return `${t.slice(0, wordEnd).trimEnd()}…`;

  return `${head}…`;
}
