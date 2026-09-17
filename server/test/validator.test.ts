import { describe, expect, it } from 'vitest';
import {
  clampReply, coercePlan, findGuiltWords, loadNoteOk, hasBlockingFlag, scanRedFlags, totalSets,
  validatePlan, warningFlags, type ValidationContext,
} from '../src/safety/validator.ts';
import {
  ONBOARD_CHOICES, asksSoFar, assumedEarlier, extractProfile,
} from '../src/engine/mock.ts';
import {
  REQUIRED_FIELDS, missingFields, normaliseEquipment, saveProfile,
} from '../src/tools/profile.ts';
import { SqliteStorage } from '../src/storage/sqlite.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTemplatePlan } from '../src/engine/template-planner.ts';
import { EXERCISES } from '../src/lib/seed.ts';
import { detectLang, filterLibrary } from '../src/lib/util.ts';
import { bmiOf } from '../src/tools/user-state.ts';
import { normaliseArea } from '../src/tools/partner-search.ts';
import type { Plan, ValidationCode } from '../src/engine/types.ts';

const MIND_EQUIPMENT = ['dumbbell', 'treadmill', 'bodyweight', 'mat'];

/** A throwaway database per test, so profile writes cannot leak between them. */
let dbSeq = 0;
async function freshStorage(): Promise<SqliteStorage> {
  dbSeq += 1;
  const storage = new SqliteStorage(join(tmpdir(), `fither-test-${process.pid}-${dbSeq}.db`));
  await storage.init();
  return storage;
}

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    library: EXERCISES,
    equipment: MIND_EQUIPMENT,
    experience: 'beginner',
    life_stage: 'none',
    session_minutes: 45,
    days_per_week: 3,
    last_active_volume_sets: null,
    missed_last_week: false,
    why_th: 'ค่อย ๆ เริ่มจากท่าพื้นฐานก่อนนะคะ',
    why_en: 'Starting with the basics.',
    ...over,
  };
}

function session(exercises: Plan['sessions'][number]['exercises'], over: Partial<Plan['sessions'][number]> = {}) {
  return {
    day: 'mon' as const,
    title_th: 'ทั้งตัว',
    title_en: 'Full body',
    duration_min: 40,
    exercises,
    ...over,
  };
}

const BASIC = [
  { exercise_id: 'ex_bw_squat', sets: 2, reps: 10, load_note: 'น้ำหนักตัว' },
  { exercise_id: 'ex_db_row', sets: 2, reps: 10, load_note: 'เบา' },
];

function plan(sessions: Plan['sessions'], week = 1): Plan {
  return { week_number: week, sessions };
}

function codes(errors: { code: ValidationCode }[]) {
  return errors.map((e) => e.code);
}

describe('validatePlan — happy path', () => {
  it('accepts a conservative beginner week 1', () => {
    const r = validatePlan(plan([session(BASIC)]), ctx());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.volume_total_sets).toBe(4);
  });
});

describe('validatePlan — weekly volume', () => {
  it('rejects a volume increase beyond 10%', () => {
    const big = Array.from({ length: 4 }, () => session(BASIC));
    const r = validatePlan(plan(big, 2), ctx({ last_active_volume_sets: 10, days_per_week: 4 }));
    expect(r.ok).toBe(false);
    expect(codes(r.errors)).toContain('VOLUME_INCREASE_EXCEEDED');
  });

  it('accepts an increase within 10%', () => {
    const r = validatePlan(plan([session(BASIC)], 2), ctx({ last_active_volume_sets: 4 }));
    expect(r.ok).toBe(true);
    expect(r.delta_vs_prev_pct).toBe(0);
  });

  it('rejects a plan that does not drop >= 20% after a missed week', () => {
    const r = validatePlan(
      plan([session(BASIC)], 2),
      ctx({ last_active_volume_sets: 4, missed_last_week: true }),
    );
    expect(r.ok).toBe(false);
    expect(codes(r.errors)).toContain('VOLUME_NOT_REDUCED_AFTER_MISSED_WEEK');
  });

  it('accepts a gentler restart after a missed week', () => {
    const lighter = [{ exercise_id: 'ex_bw_squat', sets: 3, reps: 10, load_note: 'น้ำหนักตัว' }];
    const r = validatePlan(
      plan([session(lighter)], 2),
      ctx({ last_active_volume_sets: 10, missed_last_week: true }),
    );
    expect(r.ok).toBe(true);
    expect(r.delta_vs_prev_pct).toBe(-70);
  });
});

describe('validatePlan — library and equipment', () => {
  it('rejects an invented exercise id', () => {
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_barbell_snatch', sets: 2, reps: 5, load_note: 'เบา' }])]),
      ctx(),
    );
    expect(codes(r.errors)).toContain('UNKNOWN_EXERCISE_ID');
  });

  it('rejects an exercise the user has no equipment for', () => {
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_band_row', sets: 2, reps: 10, load_note: 'เบา' }])]),
      ctx(),
    );
    expect(codes(r.errors)).toContain('EQUIPMENT_MISMATCH');
  });

  it('rejects an intermediate exercise for a beginner', () => {
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_bw_pushup', sets: 2, reps: 8, load_note: 'น้ำหนักตัว' }])]),
      ctx(),
    );
    expect(codes(r.errors)).toContain('LEVEL_TOO_ADVANCED');
  });

  it('respects contraindications for a postpartum life stage', () => {
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_bw_plank', sets: 2, reps: 10, load_note: 'น้ำหนักตัว' }])]),
      ctx({ life_stage: 'postpartum' }),
    );
    expect(codes(r.errors)).toContain('CONTRAINDICATION');
  });
});

describe('validatePlan — ranges and progression', () => {
  it('rejects sets outside 1-5', () => {
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_bw_squat', sets: 9, reps: 10, load_note: 'น้ำหนักตัว' }])]),
      ctx(),
    );
    expect(codes(r.errors)).toContain('SETS_OUT_OF_RANGE');
  });

  it('rejects reps outside 3-20', () => {
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_bw_squat', sets: 2, reps: 40, load_note: 'น้ำหนักตัว' }])]),
      ctx(),
    );
    expect(codes(r.errors)).toContain('REPS_OUT_OF_RANGE');
  });

  it('rejects a load note that is not a gradual progression', () => {
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_db_row', sets: 2, reps: 10, load_note: 'เพิ่มเป็น 20 kg เลย' }])]),
      ctx(),
    );
    expect(codes(r.errors)).toContain('LOAD_JUMP_TOO_BIG');
  });

  it('accepts "+1 step" and "เท่าเดิม"', () => {
    const r = validatePlan(
      plan([session([
        { exercise_id: 'ex_db_row', sets: 2, reps: 10, load_note: '+1 ขั้น' },
        { exercise_id: 'ex_db_goblet_squat', sets: 2, reps: 10, load_note: 'เท่าเดิม' },
      ])]),
      ctx(),
    );
    expect(r.ok).toBe(true);
  });
});

describe('validatePlan — session limits', () => {
  it('rejects a session longer than the user allows', () => {
    const r = validatePlan(
      plan([session(BASIC, { duration_min: 60 })]),
      ctx({ session_minutes: 45 }),
    );
    expect(codes(r.errors)).toContain('SESSION_TOO_LONG');
  });

  it('rejects more sessions than days_per_week', () => {
    const r = validatePlan(
      plan([session(BASIC), session(BASIC), session(BASIC), session(BASIC)]),
      ctx({ days_per_week: 3 }),
    );
    expect(codes(r.errors)).toContain('TOO_MANY_SESSIONS');
  });
});

describe('guilt language', () => {
  it('rejects a why-line that blames the user', () => {
    const r = validatePlan(
      plan([session(BASIC)]),
      ctx({ why_th: 'สัปดาห์ที่แล้วขี้เกียจ สัปดาห์นี้ต้องชดเชยให้หมด' }),
    );
    expect(codes(r.errors)).toContain('GUILT_LANGUAGE');
  });

  it('catches English guilt words too', () => {
    expect(findGuiltWords('You fell off — time to make up for it')).not.toHaveLength(0);
    expect(findGuiltWords('A lighter restart so your body eases back in')).toHaveLength(0);
  });
});

describe('red-flag scan', () => {
  it.each([
    ['สัปดาห์นี้เจ็บเข่าตอนลงบันได', 'PAIN'],
    ['รู้สึกเวียนหัวตอนออกกำลัง', 'DIZZY'],
    ['เพิ่งรู้ว่าท้องค่ะ', 'PREGNANCY'],
    ['I think I have a knee injury', 'INJURY'],
  ])('flags %s as %s', (text, code) => {
    const flags = scanRedFlags(text);
    expect(flags.map((f) => f.code)).toContain(code);
    expect(hasBlockingFlag(flags)).toBe(true);
  });

  it('does not flag ordinary check-in notes', () => {
    expect(scanRedFlags('งานยุ่งมากเลยได้ทำแค่สองวันค่ะ')).toHaveLength(0);
  });
});

describe('profile edits flow through to the next plan', () => {
  it('45->30 minutes and removing dumbbells constrains the generated plan', () => {
    // Acceptance criterion 11: change the profile, and the next generated plan
    // must respect it — enforced by the same validator, not by the model.
    const { allowed } = filterLibrary({
      equipment: ['bodyweight', 'mat'],
      experience: 'beginner',
      life_stage: 'none',
    });
    expect(allowed.some((e) => e.equipment.includes('dumbbell') && e.equipment.length === 1)).toBe(false);

    const generated = buildTemplatePlan(allowed, {
      week_number: 2,
      days_per_week: 3,
      session_minutes: 30,
      volume_ceiling_sets: null,
      gentle: false,
    });

    const r = validatePlan(generated, ctx({
      equipment: ['bodyweight', 'mat'],
      session_minutes: 30,
      library: EXERCISES,
    }));

    expect(r.ok).toBe(true);
    expect(generated.sessions.every((s) => s.duration_min <= 30)).toBe(true);
    const ids = generated.sessions.flatMap((s) => s.exercises.map((e) => e.exercise_id));
    expect(ids).not.toContain('ex_db_row');
    expect(ids).not.toContain('ex_db_goblet_squat');
  });
});

describe('template planner', () => {
  it('never exceeds the volume ceiling', () => {
    const { allowed } = filterLibrary({
      equipment: MIND_EQUIPMENT, experience: 'beginner', life_stage: 'none',
    });
    const p = buildTemplatePlan(allowed, {
      week_number: 2, days_per_week: 3, session_minutes: 45,
      volume_ceiling_sets: 12, gentle: true,
    });
    expect(totalSets(p)).toBeLessThanOrEqual(12);
    expect(validatePlan(p, ctx({ last_active_volume_sets: 20, missed_last_week: true })).ok).toBe(true);
  });
});

describe('reply length', () => {
  it('clamps to the LINE limit', () => {
    expect(clampReply('ก'.repeat(6000)).length).toBeLessThanOrEqual(4900);
    expect(clampReply('สั้น')).toBe('สั้น');
  });

  // The old 500-char cap chopped ordinary replies mid-word, which read as the
  // coach breaking off mid-sentence and was the whole reason chat felt broken.
  it('leaves a normal conversational reply untouched', () => {
    const reply = 'That is a big goal — a marathon! '.repeat(20).trim();
    expect(reply.length).toBeGreaterThan(500);
    expect(clampReply(reply)).toBe(reply);
    expect(clampReply(reply).endsWith('…')).toBe(false);
  });

  it('breaks on a sentence end rather than mid-word when it must trim', () => {
    const out = clampReply(`${'Run today. '.repeat(600)}xyzzy`, 60);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toBe('Run today. Run today. Run today. Run today. Run today.…');
  });
});

describe('model-output coercion', () => {
  // A live Agent SDK run lost three retries to these exact slips.
  it('accepts a plan handed over as a JSON string', () => {
    const r = validatePlan(JSON.stringify(plan([session(BASIC)])), ctx());
    expect(r.ok).toBe(true);
    expect(r.plan?.sessions).toHaveLength(1);
  });

  it('normalises a day written as "Monday" or "จันทร์"', () => {
    const r = validatePlan(
      plan([
        session(BASIC, { day: 'Monday' as never }),
        session(BASIC, { day: 'พฤหัส' as never }),
      ]),
      ctx({ days_per_week: 3 }),
    );
    expect(r.ok).toBe(true);
    expect(r.plan?.sessions.map((s) => s.day)).toEqual(['mon', 'thu']);
  });

  it('fills in a missing load_note rather than failing on it', () => {
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_bw_squat', sets: 2, reps: 10 } as never])]),
      ctx(),
    );
    expect(r.ok).toBe(true);
  });

  it('leaves an ambiguous numeric day alone so it fails loudly', () => {
    const coerced = coercePlan(plan([session(BASIC, { day: 3 as never })])) as typeof BASIC extends never ? never : { sessions: { day: unknown }[] };
    expect(coerced.sessions[0].day).toBe(3);
    expect(validatePlan(coerced, ctx()).ok).toBe(false);
  });

  it('reports a missing reps field as a schema error, not a range error', () => {
    // Mislabelling this as REPS_OUT_OF_RANGE sent the model off fixing the
    // wrong thing and burned a retry.
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_bw_squat', sets: 2, load_note: 'น้ำหนักตัว' } as never])]),
      ctx(),
    );
    expect(r.ok).toBe(false);
    expect(codes(r.errors)).toContain('SCHEMA_INVALID');
    expect(codes(r.errors)).not.toContain('REPS_OUT_OF_RANGE');
  });

  it('still reports a genuine out-of-range reps value as a range error', () => {
    const r = validatePlan(
      plan([session([{ exercise_id: 'ex_bw_squat', sets: 2, reps: 30, load_note: 'น้ำหนักตัว' }])]),
      ctx(),
    );
    expect(codes(r.errors)).toContain('REPS_OUT_OF_RANGE');
  });
});

describe('load notes police jumps, not formatting', () => {
  // A live run rejected "10 นาที ชัน 3%" — a perfectly gradual note — and
  // burned a retry on it.
  it.each([
    'น้ำหนักตัว', 'เท่าเดิม', 'เบา', '+1 ขั้น', '4 kg ต่อข้าง', '3 kg ข้างละ',
    '12 นาที', '10 นาที ชัน 3%', 'ชัน 6%', 'พัก 60 วินาที', '',
  ])('accepts %s', (note) => {
    expect(loadNoteOk(note)).toBe(true);
  });

  it.each([
    'เพิ่มเป็น 20 kg เลย', 'เพิ่มอีก 5 kg', '+5 ขั้น', 'สองเท่าของสัปดาห์ที่แล้ว', 'ยกให้สุดแรง',
  ])('rejects %s', (note) => {
    expect(loadNoteOk(note)).toBe(false);
  });
});

describe('partner area matching', () => {
  // A live agent run searched "ลาดพร้าว" against a DB storing "Ladprao",
  // matched nothing, and fell through to an unvetted maps result even though
  // a vetted Ladprao gym exists.
  it.each([
    ['ลาดพร้าว', 'Ladprao'],
    ['แถวลาดพร้าว', 'Ladprao'],
    ['อารีย์', 'Ari'],
    ['อ่อนนุช', 'On Nut'],
    ['Ladprao', 'Ladprao'],
    ['ladprao area', 'Ladprao'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normaliseArea(input)).toBe(expected);
  });

  it('leaves an unknown area untouched', () => {
    expect(normaliseArea('Nowhere')).toBe('Nowhere');
    expect(normaliseArea('')).toBeUndefined();
    expect(normaliseArea(undefined)).toBeUndefined();
  });
});

describe('context-aware red flags', () => {
  // "I want to get stronger, carrying my kid always hurts my back" is the most
  // common reason a beginner starts. Blocking onboarding on it broke the whole
  // flow; acute signals must still block everywhere.
  it('does not block onboarding on a generic ache', () => {
    const flags = scanRedFlags('อยากแข็งแรงขึ้นค่ะ อุ้มลูกแล้วปวดหลังตลอด');
    expect(flags.map((f) => f.code)).toContain('PAIN');
    expect(hasBlockingFlag(flags, 'onboard')).toBe(false);
    expect(warningFlags(flags, 'onboard')).toHaveLength(1);
  });

  it('still blocks the same words at the weekly check-in', () => {
    const flags = scanRedFlags('สัปดาห์นี้เจ็บเข่าตอนลงบันได');
    expect(hasBlockingFlag(flags, 'weekly_replan')).toBe(true);
  });

  it.each(['INJURY', 'DIZZY', 'PREGNANCY', 'CHEST', 'DISTRESS'])(
    'blocks %s even during onboarding', (code) => {
      const text = {
        INJURY: 'เพิ่งบาดเจ็บข้อเท้ามาค่ะ',
        DIZZY: 'เวียนหัวบ่อยมากค่ะ',
        PREGNANCY: 'ตอนนี้ตั้งครรภ์อยู่ค่ะ',
        CHEST: 'แน่นหน้าอกเวลาเดินเร็ว',
        DISTRESS: 'รู้สึกซึมเศร้ามากเลยค่ะ',
      }[code]!;
      const flags = scanRedFlags(text);
      expect(flags.map((f) => f.code)).toContain(code);
      expect(hasBlockingFlag(flags, 'onboard')).toBe(true);
    },
  );
});

describe('red flags survive the answer "no"', () => {
  // The coach asks "any injuries to watch out for?", so a negative is the most
  // likely reply there is. Substring matching read "no injury" as an injury
  // report and handed her to a human coach mid-onboarding.
  it.each([
    'np injury',
    'no injury',
    'no injuries at all',
    'I have no pain anywhere',
    "I don't have any injuries",
    'not pregnant',
    'ไม่มีบาดเจ็บค่ะ',
    'ไม่เจ็บตรงไหนเลยค่ะ',
    'เพิ่งคลอดลูก ไม่ได้ท้องแล้วค่ะ',
  ])('does not flag %s', (text) => {
    expect(hasBlockingFlag(scanRedFlags(text), 'onboard')).toBe(false);
  });

  // ท้อง ("pregnant") is a substring of หน้าท้อง ("abdomen"), so wanting to
  // lose belly fat — one of the most common goals this product serves — was
  // read as a pregnancy disclosure and blocked.
  it.each([
    'อยากลดหน้าท้องค่ะ',
    'อยากให้หน้าท้องกระชับขึ้น',
    'ท้องเสียเมื่อวาน',
  ])('does not read %s as a pregnancy disclosure', (text) => {
    expect(scanRedFlags(text).map((f) => f.code)).not.toContain('PREGNANCY');
  });

  it('still blocks a real disclosure that happens to contain a negation elsewhere', () => {
    const flags = scanRedFlags('ไม่ได้ออกกำลังกายเลย ตอนนี้ท้อง 3 เดือนค่ะ');
    expect(flags.map((f) => f.code)).toContain('PREGNANCY');
    expect(hasBlockingFlag(flags, 'onboard')).toBe(true);
  });

  it('detects the plural "injuries", which substring matching missed entirely', () => {
    expect(scanRedFlags('I have two old injuries').map((f) => f.code)).toContain('INJURY');
  });

  // Deliberate asymmetry: a false positive here costs one awkward handoff,
  // a false negative could cost a great deal more.
  it.each(['no chest pain', 'not dizzy', 'I am not depressed'])(
    'never lets a negation suppress the acute signal in %s', (text) => {
      expect(hasBlockingFlag(scanRedFlags(text), 'onboard')).toBe(true);
    },
  );
});

describe('profile extraction and normalisation', () => {
  it('pulls several fields out of one sentence', () => {
    const p = extractProfile('ว่างแค่เสาร์อาทิตย์ ครั้งละชั่วโมง');
    expect(p.days_per_week).toBe(2);
    expect(p.session_minutes).toBe(60);
  });

  it('reads goal, tone and experience from natural sentences', () => {
    expect(extractProfile('อยากแข็งแรงขึ้นค่ะ').goal).toBe('strength');
    expect(extractProfile('ไม่เคยเล่นเวทเลยค่ะ').experience).toBe('beginner');
    expect(extractProfile('อยากให้พูดอ่อนโยนหน่อย ไม่ต้องกดดัน').coach_tone).toBe('gentle');
    expect(extractProfile('ช่วยผลักหน่อย ดุได้เลย').coach_tone).toBe('firm');
  });

  it('normalises Thai equipment words to library tags', () => {
    expect(normaliseEquipment(['ดัมเบล', 'ลู่วิ่ง'])).toEqual(
      expect.arrayContaining(['dumbbell', 'treadmill', 'bodyweight']),
    );
    // Nothing at home still yields a usable plan.
    expect(normaliseEquipment(['ไม่มี'])).toContain('bodyweight');
  });

  it('knows which required fields are still missing', () => {
    expect(missingFields(null)).toHaveLength(6);
  });
});

describe('reply language follows her, not the product default', () => {
  it.each([
    ['อยากแข็งแรงขึ้นค่ะ', 'th'],
    ['I want to get stronger', 'en'],
    ['3 days a week, 45 min', 'en'],
    ['ok ค่ะ', 'th'],
    ['', 'th'],
  ])('%s -> %s', (text, expected) => {
    expect(detectLang(text)).toBe(expected);
  });
});

describe('body metrics and timeframe', () => {
  it('computes BMI only from a plausible height and weight', () => {
    expect(bmiOf(165, 58)).toBe(21.3);
    expect(bmiOf(null, 58)).toBeNull();
    expect(bmiOf(165, null)).toBeNull();
  });
});

describe('every exercise carries beginner guidance', () => {
  it('has three cues and a common mistake in both languages', () => {
    for (const e of EXERCISES) {
      expect(e.steps_th, e.id).toHaveLength(3);
      expect(e.steps_en, e.id).toHaveLength(3);
      expect(e.mistake_th, e.id).toBeTruthy();
      expect(e.mistake_en, e.id).toBeTruthy();
      expect(e.video_url, e.id).toMatch(/^https:\/\//);
    }
  });
});

describe('library staleness (the onboarding plan bug)', () => {
  // The request's library snapshot is built before the agent runs. During
  // onboarding her equipment does not exist yet, so that snapshot is empty —
  // validating against it rejected genuinely valid IDs and no plan could ever
  // be saved on the turn she finished onboarding.
  it('a valid plan passes once equipment is known, even though a stale empty library would reject it', () => {
    const staleEmpty = validatePlan(
      plan([session(BASIC)]),
      ctx({ library: [] }),
    );
    expect(staleEmpty.ok).toBe(false);
    expect(codes(staleEmpty.errors)).toContain('UNKNOWN_EXERCISE_ID');

    const fresh = validatePlan(plan([session(BASIC)]), ctx({ library: EXERCISES }));
    expect(fresh.ok).toBe(true);
  });

  it('filterLibrary returns a usable list for every equipment combination', () => {
    for (const eq of [['bodyweight'], ['bodyweight', 'mat'], ['dumbbell', 'mat'], MIND_EQUIPMENT]) {
      const { allowed } = filterLibrary({ equipment: eq, experience: 'beginner', life_stage: 'none' });
      expect(allowed.length, eq.join('+')).toBeGreaterThan(5);
    }
  });
});

describe('onboarding always moves forward', () => {
  it('reads the openers that used to match nothing at all', () => {
    // The bug: none of these hit a goal keyword, so the profile stayed empty
    // and the same question came back every turn, forever.
    expect(extractProfile('i want to get in shape').goal).toBeTruthy();
    expect(extractProfile('just want to feel better').goal).toBeTruthy();
    expect(extractProfile('อยากหุ่นดีขึ้นค่ะ').goal).toBeTruthy();
    expect(extractProfile('want to be healthier').goal).toBeTruthy();
  });

  it('counts how many times a question has already been put to her', () => {
    const asked = (n: number) => Array.from({ length: n }, () => ({
      role: 'coach' as const, text: 'Lovely to meet you. What made you want to start training?',
    }));
    expect(asksSoFar([], 'goal')).toBe(0);
    expect(asksSoFar(asked(1), 'goal')).toBe(1);
    expect(asksSoFar(asked(2), 'goal')).toBe(2);
    // A question about one field is not a question about another.
    expect(asksSoFar(asked(2), 'coach_tone')).toBe(0);
  });

  it('remembers which values it guessed, so she can still correct them', () => {
    const history = [
      { role: 'coach' as const, text: "I wasn't sure, so I've assumed 3 days a week for now — you can change that any time." },
    ];
    expect(assumedEarlier(history).has('days_per_week')).toBe(true);
    expect(assumedEarlier(history).has('goal')).toBe(false);
    expect(assumedEarlier([]).size).toBe(0);
  });

  it('offers a tappable answer for every required field', () => {
    // A field with no fallback choices is a field she can get stuck on.
    for (const field of REQUIRED_FIELDS) {
      const choices = ONBOARD_CHOICES[field];
      expect(choices?.length, field).toBeGreaterThan(1);
      for (const c of choices) {
        expect(c.data).toMatch(/^action=say&text=/);
        expect(c.label_th).toBeTruthy();
        expect(c.label_en).toBeTruthy();
      }
    }
  });

  it('every choice chip sends words the extractor can actually read', () => {
    // A chip the parser cannot read is the dead end wearing a button.
    const reads: Record<string, (p: ReturnType<typeof extractProfile>) => unknown> = {
      goal: (p) => p.goal,
      days_per_week: (p) => p.days_per_week,
      session_minutes: (p) => p.session_minutes,
      equipment: (p) => p.equipment,
      experience: (p) => p.experience,
      coach_tone: (p) => p.coach_tone,
    };
    for (const field of REQUIRED_FIELDS) {
      for (const c of ONBOARD_CHOICES[field]) {
        const text = new URLSearchParams(c.data).get('text') ?? '';
        expect(reads[field](extractProfile(text)), `${field}: "${text}"`).toBeTruthy();
      }
    }
  });
});

describe('near-miss enum values are accepted, not bounced back as a question', () => {
  it.each([
    ['goal', 'get in shape'],
    ['goal', 'lose weight'],
    ['goal', 'toning'],
    ['experience', 'newbie'],
    ['experience', 'no experience'],
    ['coach_tone', 'encouraging'],
    ['coach_tone', 'tough'],
  ])('maps %s="%s" instead of ignoring it', async (field, value) => {
    const storage = await freshStorage();
    const res = await saveProfile(storage, 'u_test', { [field]: value } as never);
    expect(res.saved[field], `${field}="${value}"`).toBeTruthy();
    expect(res.ignored).toBeUndefined();
  });

  it('tells the agent the allowed values when it truly cannot map one', async () => {
    const storage = await freshStorage();
    const res = await saveProfile(storage, 'u_test', { goal: 'purple' } as never);
    expect(res.saved.goal).toBeUndefined();
    expect(res.ignored?.[0]).toContain('strength');
    expect(res.ignored?.[0]).toContain('fat_loss');
  });
});
