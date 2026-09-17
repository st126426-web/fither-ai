import type {
  CoachEngine, CoachRequest, CoachResult, CoachTools, GymIntentPayload,
  ProfileFields, QuickReply, UserStateResult,
} from './types.ts';
import { REQUIRED_FIELDS, type RequiredField } from '../tools/profile.ts';
import { buildTemplatePlan } from './template-planner.ts';
import { clampReply } from '../safety/validator.ts';
import { DAY_EN, DAY_TH, GOAL_EN, GOAL_TH } from '../lib/util.ts';

/**
 * Scripted engine covering the demo beats with zero tokens.
 *
 * It is not a stub: it drives the same tools and the same validator as the
 * real engines, and it simulates the *agentic* onboarding too — extracting
 * fields from free text, calling save_profile, and asking about whatever is
 * still missing. The extraction is keyword-based rather than a model, so a
 * mock-mode demo answers in plain sentences and still gets a real plan.
 */
/** Every mock reply is written in both languages and picked by her locale. */
function say(req: CoachRequest, th: string, en: string): CoachResult['reply'] {
  return { text_th: req.locale === 'en' ? en : th, text_en: en };
}

export class MockEngine implements CoachEngine {
  readonly name = 'mock' as const;

  async run(req: CoachRequest, tools: CoachTools): Promise<CoachResult> {
    const t0 = Date.now();
    const base = {
      request_id: req.request_id,
      intent: req.intent,
      artifacts: {} as CoachResult['artifacts'],
    };
    const trace = (): CoachResult['trace'] => ({
      engine: 'mock',
      tool_calls: [],
      validator_runs: [],
      retries: 0,
      fallback_used: 'none',
      usage: { input_tokens: 0, output_tokens: 0, ms: Date.now() - t0 },
    });

    if (req.intent === 'find_gym') {
      return { ...base, status: 'ok', reply: await this.gymReply(req, tools), trace: trace() };
    }

    let assumed: RequiredField[] = [];
    if (req.intent === 'onboard') {
      const turn = await this.onboardTurn(req, tools);
      if (turn.reply) return { ...base, status: 'ok', reply: turn.reply, trace: trace() };
      // Nothing missing any more — fall through and build the plan.
      assumed = turn.assumed;
    }

    if (req.intent === 'freeform') {
      return {
        ...base,
        status: 'ok',
        reply: await this.freeformReply(req, tools),
        trace: trace(),
      };
    }

    // onboard (complete) | weekly_replan — both end in a saved, validated plan.
    const state = await tools.get_user_state({ user_id: req.user_id });
    const gentle = state.derived.missed_last_week;
    const weekNumber = req.intent === 'onboard' ? 1 : state.derived.next_week_number;

    const plan = buildTemplatePlan(req.library.catalog, {
      week_number: weekNumber,
      days_per_week: state.profile.days_per_week ?? 3,
      session_minutes: state.profile.session_minutes ?? 45,
      volume_ceiling_sets: state.derived.volume_ceiling_sets,
      gentle,
    });

    const why = whyLine(req, state, gentle, weekNumber);
    const saved = await tools.save_plan({
      user_id: req.user_id, plan, why_th: why.th, why_en: why.en,
    });

    if (!saved.ok) {
      return {
        ...base,
        status: 'validation_failed',
        reply: say(req, clampReply(FALLBACK_TH), FALLBACK_EN),
        trace: trace(),
      };
    }

    const tone = state.profile.coach_tone ?? 'balanced';
    const o = openerFor(tone);
    const guess = assumedNoteShort(assumed);
    const th = req.intent === 'onboard'
      ? `${o.th} จัดแผนสัปดาห์แรกให้แล้ว ${plan.sessions.length} วัน วันละไม่เกิน ${state.profile.session_minutes} นาที${guess ? `\n${guess.th}` : ''}\n\nทำไมสัปดาห์นี้เป็นแบบนี้: ${why.th}`
      : gentle
        ? `กลับมาเริ่มใหม่แบบเบา ๆ นะคะ สัปดาห์ที่ ${weekNumber} ลดปริมาณลงให้แล้ว\n\nทำไมสัปดาห์นี้เป็นแบบนี้: ${why.th}`
        : `แผนสัปดาห์ที่ ${weekNumber} พร้อมแล้วค่ะ\n\nทำไมสัปดาห์นี้เป็นแบบนี้: ${why.th}`;
    const en = req.intent === 'onboard'
      ? `${o.en} Week 1 is ready — ${plan.sessions.length} days, up to ${state.profile.session_minutes} min each.${guess ? `\n${guess.en}` : ''}\n\nWhy this week: ${why.en}`
      : gentle
        ? `Restarting gently — week ${weekNumber} is lighter.\n\nWhy this week: ${why.en}`
        : `Week ${weekNumber} is ready.\n\nWhy this week: ${why.en}`;

    return {
      ...base,
      status: 'ok',
      reply: say(req, clampReply(th), clampReply(en)),
      artifacts: {
        plan: {
          plan_id: saved.plan_id,
          week_number: saved.week_number,
          status: 'active',
          volume_total_sets: saved.volume_total_sets,
          delta_vs_prev_pct: saved.delta_vs_prev_pct,
          why_th: why.th,
          why_en: why.en,
        },
      },
      trace: trace(),
    };
  }

  /**
   * One turn of onboarding. Extracts what her message revealed, saves it, and
   * returns the next question — or a null reply when there is nothing left to
   * ask and the caller should plan.
   *
   * The hard rule here is **forward progress**. Keyword extraction will always
   * miss things ("I want to get in shape" matches none of the goal words), and
   * the original version answered a miss by asking the identical question
   * again, forever. Now every field escalates: ask, then ask with tappable
   * choices, then assume a safe default and move on. Onboarding always ends in
   * a plan, however she types.
   */
  private async onboardTurn(
    req: CoachRequest, tools: CoachTools,
  ): Promise<{ reply: CoachResult['reply'] | null; assumed: RequiredField[] }> {
    const missing = new Set(req.missing_fields ?? []);
    const extracted = extractProfile(req.message ?? '');

    // A value we assumed on her behalf is still open for correction. Without
    // this, the filter below — which only records fields that are still
    // missing — would make our own guess permanent the moment we made it, and
    // "actually I can do 5 days" would go nowhere.
    const guessed = assumedEarlier(req.history);

    // Otherwise only record what is still unknown. Keyword matching is greedy —
    // without this, "ไม่เคยเล่นเวทเลย" re-detects the goal it already has and
    // the acknowledgement parrots an answer from three turns ago.
    const fresh: ProfileFields = {};
    for (const [k, v] of Object.entries(extracted)) {
      if (k === 'motivation') {
        // Her reason for being here is the first thing she says, not the last.
        if (missing.has('goal')) fresh.motivation = v as string;
        continue;
      }
      if (missing.has(k) || guessed.has(k as RequiredField)) {
        (fresh as Record<string, unknown>)[k] = v;
      }
    }

    let result = await tools.save_profile({ user_id: req.user_id, ...fresh });
    if (result.ready_to_plan) return { reply: null, assumed: [] };

    const a = Object.keys(result.saved).length > 0 && req.message ? ackFor(result.saved) : null;

    // Anything she has already been asked about twice gets a safe default
    // rather than a third identical question. Bounded by the field count, so
    // this cannot spin.
    const assumed: RequiredField[] = [];
    for (let guard = 0; guard < REQUIRED_FIELDS.length; guard += 1) {
      const field = result.missing[0] as RequiredField | undefined;
      if (!field || asksSoFar(req.history, field) < 2) break;
      result = await tools.save_profile({ user_id: req.user_id, ...DEFAULTS[field] });
      assumed.push(field);
      if (result.ready_to_plan) break;
    }

    if (result.ready_to_plan) return { reply: null, assumed };

    const next = result.missing[0] as RequiredField;
    const q = QUESTION[next] ?? QUESTION.goal;

    // Second time of asking: she typed something the keyword engine could not
    // read. Saying the same sentence again is the failure — offer the options
    // instead, and be honest that picking one is the fast path.
    const stuck = asksSoFar(req.history, next) >= 1;
    const nudge = stuck ? NUDGE : null;
    const note = assumed.length ? assumedNoteShort(assumed) : null;

    const lines = (lang: 'th' | 'en') => [
      a ? a[lang] : null,
      note ? note[lang] : null,
      `${q[lang]}${nudge ? ` ${nudge[lang]}` : ''}`,
    ].filter(Boolean).join('\n\n');

    return {
      reply: {
        ...say(req, clampReply(lines('th')), clampReply(lines('en'))),
        quick_replies: stuck ? ONBOARD_CHOICES[next] : undefined,
      },
      assumed,
    };
  }

  /**
   * Free text without a matched intent.
   *
   * This must never tell her to type a magic phrase — that is a dead end, and
   * hosted mode runs on this engine, so every hosted visitor would hit it. It
   * answers from real state instead: her next session, her tone, her own stated
   * reason. A keyword engine cannot hold a conversation, but it can be useful
   * and honest about its limits.
   */
  private async freeformReply(req: CoachRequest, tools: CoachTools): Promise<CoachResult['reply']> {
    const st = await tools.get_user_state({ user_id: req.user_id });
    const msg = req.message ?? '';
    const tone = st.profile.coach_tone ?? 'balanced';
    const next = this.nextSessionLabel(req);
    const nextEn = this.nextSessionLabel(req, 'en');

    // Tired / sore / low energy — the most common thing she will type.
    if (/เหนื่อย|ล้า|ไม่ไหว|ไม่มีแรง|ปวดเมื่อย|เพลีย|tired|exhausted|sore|drained/i.test(msg)) {
      return say(req,
        tone === 'firm'
          ? 'รับทราบค่ะ วันที่เหนื่อยไม่ต้องฝืนเต็มที่ ทำแค่ครึ่งเดียวของเซสชันก็ยังนับว่าทำแล้ว แล้วค่อยกลับมาเต็มที่วันถัดไปนะคะ'
          : `ขอบคุณที่บอกนะคะ วันที่เหนื่อยแบบนี้ไม่ต้องฝืนเลยค่ะ ทำแค่ครึ่งเดียว หรือเลื่อนไปวันอื่นก็ได้ ไม่เสียแผนนะคะ${next ? `

ถ้าพอไหว ครั้งต่อไปคือ${next}` : ''}`,
        tone === 'firm'
          ? 'Noted. On a flat day, half the session still counts — do that and come back properly tomorrow.'
          : `Thanks for telling me. Don't force it today — half the session, or move it to another day. Nothing is lost.${nextEn ? `

When you're up for it, next is ${nextEn}.` : ''}`);
    }

    // What should I do today / right now.
    if (/วันนี้|ตอนนี้|ทำอะไร|เริ่มตรงไหน|today|right now|what should|what do i/i.test(msg)) {
      return say(req,
        next
          ? `ครั้งต่อไปของคุณคือ${next}ค่ะ เปิดดูรายละเอียดท่าได้ในแท็บ "แผน" มีคลิปและวิธีทำทีละขั้นให้ดูทุกท่าเลย`
          : 'ยังไม่มีแผนที่ใช้งานอยู่ค่ะ เล่าให้ฟังหน่อยได้ไหมคะว่าตอนนี้มีเวลาสัปดาห์ละกี่วัน แล้วเดี๋ยวจัดให้',
        next
          ? `Next up is ${nextEn}. The Plan tab has every exercise with step-by-step cues and a video.`
          : 'No active plan yet. Tell me how many days a week you have and I will build one.');
    }

    // Food — honest: this is a mock area of the product.
    if (/กิน|อาหาร|มื้อ|โปรตีน|eat|food|meal|protein|diet/i.test(msg)) {
      return say(req,
        'เรื่องอาหารมีตัวอย่างเมนูให้ดูในแท็บ "มื้ออาหาร" ค่ะ ตอนนี้ยังเป็นตัวอย่างสำหรับสาธิต ยังไม่ได้ปรับตามตัวคุณจริง ๆ นะคะ\nหลักง่าย ๆ คือกินโปรตีนให้พอในแต่ละมื้อ และอย่าเทรนตอนท้องว่างมากค่ะ',
        'There are sample meals on the Meals tab — demo content for now, not personalised yet.\nThe simple rule: get enough protein at each meal, and do not train on a very empty stomach.');
    }

    // Doubt / motivation.
    if (/ท้อ|ไม่อยาก|ขี้เกียจ|ไหวไหม|จะทำได้|give up|motivat|lazy|can i do/i.test(msg)) {
      const becauseTh = st.profile.motivation ? `

คุณเคยบอกไว้ว่า "${st.profile.motivation}" ค่ะ` : '';
      const becauseEn = st.profile.motivation ? `

You told me: "${st.profile.motivation}".` : '';
      return say(req,
        `รู้สึกแบบนี้ได้เป็นเรื่องปกติมากค่ะ ไม่ต้องรู้สึกผิดเลย เดือนแรกความสม่ำเสมอสำคัญกว่าความหนักนะคะ${becauseTh}`,
        `Feeling like this is completely normal — no guilt needed. In the first month, showing up matters more than going hard.${becauseEn}`);
    }

    return say(req,
      `รับทราบค่ะ 🙂${next ? ` ครั้งต่อไปของคุณคือ${next}` : ''}
ถ้าอยากให้หายิมใกล้บ้าน หรืออยากเล่าว่าสัปดาห์นี้เป็นยังไง บอกได้เลยค่ะ`,
      `Noted 🙂${nextEn ? ` Next up is ${nextEn}.` : ''}
Tell me any time if you want a gym nearby, or how the week is going.`);
  }

  /** "วันเสาร์ · ขาและหลัง" for the next session she has not marked done. */
  private nextSessionLabel(req: CoachRequest, lang: 'th' | 'en' = 'th'): string | null {
    const plan = req.active_plan;
    if (!plan?.sessions.length) return null;
    const s = plan.sessions.find((x) => !x.state) ?? plan.sessions[0];
    return lang === 'en'
      ? `${DAY_EN[s.day] ?? s.day} · ${s.title_en} (${s.duration_min} min)`
      : `วัน${DAY_TH[s.day] ?? s.day} · ${s.title_th} (${s.duration_min} นาที)`;
  }

  private async gymReply(req: CoachRequest, tools: CoachTools): Promise<CoachResult['reply']> {
    const p = (req.payload ?? {}) as GymIntentPayload;
    const found = await tools.search_partners({
      area: p.area,
      price_tier_max: p.price_tier_max,
      tags: p.must_have_tags,
      beginner_friendly_only: true,
      limit: 3,
    });

    if (found.count > 0) {
      const top = found.results[0];
      return {
        text_th: clampReply(
          `ถ้าเริ่มรู้สึกว่าที่บ้านเบาไปแล้ว ลองที่นี่ดูค่ะ: ${top.name} (${top.area})\n`
          + `เหมาะกับคุณเพราะ ${top.match_reasons.slice(0, 2).join(' และ ')}\n`
          + `ไม่ต้องรีบสมัครรายปีนะคะ ลองไปดูก่อนสัก 1 ครั้งก็ได้`,
        ),
        text_en: `${top.name} in ${top.area} — beginner-vetted. Try a single visit before committing.`,
      };
    }

    const fb = await tools.maps_fallback({ query: 'gym for beginners', area: p.area });
    const top = fb.results[0];
    return {
      text_th: clampReply(
        `ตอนนี้ยังไม่มียิมพาร์ทเนอร์ที่เราตรวจสอบแล้วในโซนนี้ค่ะ\n`
        + `หาจากการค้นหาทั่วไปได้: ${top?.name ?? 'ยิมใกล้บ้าน'} (${top?.area ?? '-'})\n`
        + `⚠️ ${fb.disclaimer_th}`,
      ),
      text_en: `No vetted partner nearby. ${top?.name ?? 'A generic result'} — ${fb.disclaimer_en}`,
    };
  }
}

// ── keyword extraction: the mock stand-in for the model ─────────────────
/**
 * Keyword tables. Order matters — the first table to match wins, so the more
 * specific goal sits above the more general one.
 *
 * These will never cover everything a person can type, which is why
 * `onboardTurn` no longer depends on them succeeding. They only decide whether
 * she gets a plan in five turns or in seven. The plain-enum tokens at the end
 * of each row are what the choice chips send, so a tap and a typed sentence
 * travel the same path.
 */
const GOAL_WORDS: [RegExp, string][] = [
  [/ลดไขมัน|ลดน้ำหนัก|ลดพุง|ผอม|หุ่น|กระชับ|fat[ _]?loss|lose (weight|fat)|slim|lean|trim|tone up|in shape|fit into/i, 'fat_loss'],
  [/แข็งแรง|กล้ามเนื้อ|เวท|ยกน้ำหนัก|strength|strong|muscle|tone|lift/i, 'strength'],
  [/มีแรง|เหนื่อยง่าย|พลังงาน|สดชื่น|energy|stamina|fitness|fitter|endurance|keep up with/i, 'energy'],
  [/นิสัย|สม่ำเสมอ|เริ่มต้น|วินัย|habit|consistent|routine|get started|stick with/i, 'habit'],
  // Catch-all: she said she wants to change something but not what. "Healthier"
  // and "get in shape" are the two most common openers and used to match
  // nothing at all, which is what left the conversation asking forever.
  [/สุขภาพ|ดูแลตัวเอง|ฟิต|healthy|healthier|get in shape|shape|feel better|better shape|look better/i, 'habit'],
];
const EXPERIENCE_WORDS: [RegExp, string][] = [
  [/เคย.*หยุด|หยุดไป|กลับมา|ห่างไป|used to|stopped|returning|coming back|again|rusty/i, 'returning'],
  [/ไม่เคย|มือใหม่|เพิ่งเริ่ม|ไม่เป็น|never|beginner|new|first time|no experience|from scratch/i, 'beginner'],
  [/ออกอยู่|ประจำ|สม่ำเสมอ|regular|currently|intermediate|already train|i train/i, 'intermediate'],
];
const TONE_WORDS: [RegExp, string][] = [
  [/อ่อนโยน|ใจดี|ไม่กดดัน|เบา ?ๆ|ค่อย ?ๆ|gentle|soft|no pressure|easy on me|kind|encourag/i, 'gentle'],
  [/ดุ|เข้ม|ผลัก|กดดัน|ตรงไปตรงมา|firm|push|tough|strict|hard on me|direct|challenge me/i, 'firm'],
  [/ปกติ|กลาง ?ๆ|ธรรมดา|balanced|normal|middle|in between|either/i, 'balanced'],
];
const EQUIPMENT_WORDS: [RegExp, string][] = [
  [/ดัมเบล|dumbbell|weights/i, 'dumbbell'],
  [/ลู่วิ่ง|treadmill/i, 'treadmill'],
  [/เสื่อ|yoga ?mat|mat/i, 'mat'],
  [/ยางยืด|resistance ?band/i, 'resistance_band'],
  [/ม้านั่ง|bench/i, 'bench'],
  [/เคทเทิล|kettlebell/i, 'kettlebell'],
  [/ไม่มี(อะไร|เลย|อุปกรณ์)|ตัวเปล่า|nothing|no (equipment|gear|weights)|bodyweight|body ?weight/i, 'bodyweight'],
];

export function extractProfile(message: string): ProfileFields {
  const out: ProfileFields = {};
  if (!message.trim()) return out;

  for (const [re, v] of GOAL_WORDS) if (re.test(message)) { out.goal = v; break; }
  for (const [re, v] of EXPERIENCE_WORDS) if (re.test(message)) { out.experience = v; break; }
  for (const [re, v] of TONE_WORDS) if (re.test(message)) { out.coach_tone = v; break; }

  const equipment = EQUIPMENT_WORDS.filter(([re]) => re.test(message)).map(([, v]) => v);
  if (equipment.length) out.equipment = equipment;

  // "3 วัน" / "3 days a week"
  const days = message.match(/(\d)\s*(วัน|day)/i);
  if (days) out.days_per_week = Number(days[1]);
  else {
    // "เสาร์อาทิตย์" / "weekends" — count the days she actually named.
    const named = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์']
      .filter((d) => message.includes(d)).length;
    if (named) out.days_per_week = named;
    else if (/เสาร์อาทิตย์|สุดสัปดาห์|weekend/i.test(message)) out.days_per_week = 2;
  }

  // "45 นาที" / "an hour"
  const mins = message.match(/(\d{2,3})\s*(นาที|min)/i);
  if (mins) out.session_minutes = Number(mins[1]);
  else if (/ชั่วโมง|1 ?hour|an hour/i.test(message)) out.session_minutes = 60;
  else if (/ครึ่งชั่วโมง|half an hour/i.test(message)) out.session_minutes = 30;

  // Her first substantive message is usually why she is here. Keep it: the
  // why-line is supposed to reference something she actually said.
  if (out.goal && message.trim().length > 12) out.motivation = message.trim().slice(0, 300);

  return out;
}

const QUESTION: Record<string, { th: string; en: string }> = {
  goal: {
    th: 'ยินดีที่ได้รู้จักค่ะ 🙂 อยากเริ่มออกกำลังกายเพราะอะไรคะ เล่าให้ฟังได้เลย',
    en: 'Lovely to meet you. What made you want to start training?',
  },
  days_per_week: {
    th: 'สัปดาห์หนึ่งพอจะมีเวลากี่วันคะ',
    en: 'How many days a week do you realistically have?',
  },
  session_minutes: {
    th: 'แต่ละครั้งพอมีเวลาประมาณเท่าไหร่คะ',
    en: 'And roughly how long each time?',
  },
  equipment: {
    th: 'ที่บ้านหรือที่คอนโดมีอุปกรณ์อะไรพอใช้ได้บ้างคะ ไม่มีก็ไม่เป็นไรนะคะ',
    en: 'What equipment do you have around? None is fine too.',
  },
  experience: {
    th: 'เคยออกกำลังกายแบบมีโปรแกรมมาก่อนไหมคะ',
    en: 'Have you followed a training programme before?',
  },
  coach_tone: {
    th: 'อีกข้อเดียวค่ะ อยากให้โค้ชคุยกับคุณแบบไหนดีคะ แบบอ่อนโยนไม่กดดัน หรือแบบตรงไปตรงมาช่วยผลักหน่อย',
    en: 'Last one — how do you want me to talk to you? Gentle and no pressure, or direct and pushing a little?',
  },
};

/**
 * How many times the coach has already put this question to her.
 *
 * The mock writes its questions verbatim from QUESTION, so the conversation
 * history is a reliable record of what has been asked — no extra state, and it
 * works identically on LINE and in the web app because both share one history.
 */
export function asksSoFar(history: CoachRequest['history'], field: RequiredField): number {
  const q = QUESTION[field];
  if (!q || !history?.length) return 0;
  return history.filter(
    (h) => h.role === 'coach' && (h.text.includes(q.th) || h.text.includes(q.en)),
  ).length;
}

/**
 * Fields the coach has already admitted to guessing at, read back out of what
 * it told her. Every default is announced in the reply (see assumedNoteShort),
 * so the transcript is the record — no extra state to keep in sync.
 */
export function assumedEarlier(history: CoachRequest['history']): Set<RequiredField> {
  const out = new Set<RequiredField>();
  for (const h of history ?? []) {
    if (h.role !== 'coach') continue;
    for (const f of REQUIRED_FIELDS) {
      const l = ASSUMED_LABEL[f];
      if (h.text.includes(l.th) || h.text.includes(l.en)) out.add(f);
    }
  }
  return out;
}

const NUDGE = {
  th: 'หรือแตะเลือกด้านล่างก็ได้ค่ะ',
  en: 'Or just tap one below.',
};

/**
 * Tappable answers, used once free text has failed to parse. Each `data`
 * carries words the extractor above definitely recognises, so a tap travels
 * the same path as typing — there is no second parser to keep in sync.
 */
export const ONBOARD_CHOICES: Record<RequiredField, QuickReply[]> = {
  goal: [
    { label_th: 'แข็งแรงขึ้น', label_en: 'Get stronger', data: 'action=say&text=strength' },
    { label_th: 'ลดไขมัน', label_en: 'Lose fat', data: 'action=say&text=fat loss' },
    { label_th: 'มีแรงมากขึ้น', label_en: 'More energy', data: 'action=say&text=energy' },
    { label_th: 'สร้างนิสัย', label_en: 'Build the habit', data: 'action=say&text=habit' },
  ],
  days_per_week: [
    { label_th: '2 วัน', label_en: '2 days', data: 'action=say&text=2 days' },
    { label_th: '3 วัน', label_en: '3 days', data: 'action=say&text=3 days' },
    { label_th: '4 วัน', label_en: '4 days', data: 'action=say&text=4 days' },
  ],
  session_minutes: [
    { label_th: '20 นาที', label_en: '20 min', data: 'action=say&text=20 min' },
    { label_th: '30 นาที', label_en: '30 min', data: 'action=say&text=30 min' },
    { label_th: '45 นาที', label_en: '45 min', data: 'action=say&text=45 min' },
    { label_th: '1 ชั่วโมง', label_en: '1 hour', data: 'action=say&text=60 min' },
  ],
  equipment: [
    { label_th: 'ไม่มีเลย', label_en: 'Nothing', data: 'action=say&text=no equipment' },
    { label_th: 'ดัมเบล', label_en: 'Dumbbells', data: 'action=say&text=dumbbell' },
    { label_th: 'เสื่อ + ยางยืด', label_en: 'Mat + band', data: 'action=say&text=mat resistance band' },
    { label_th: 'ลู่วิ่ง', label_en: 'Treadmill', data: 'action=say&text=treadmill' },
  ],
  experience: [
    { label_th: 'ไม่เคยเลย', label_en: 'Never have', data: 'action=say&text=beginner' },
    { label_th: 'เคยแล้วหยุดไป', label_en: 'Used to, stopped', data: 'action=say&text=returning' },
    { label_th: 'ทำอยู่ประจำ', label_en: 'I train now', data: 'action=say&text=intermediate' },
  ],
  coach_tone: [
    { label_th: 'อ่อนโยน ไม่กดดัน', label_en: 'Gentle, no pressure', data: 'action=say&text=gentle' },
    { label_th: 'ปกติ', label_en: 'Balanced', data: 'action=say&text=balanced' },
    { label_th: 'ตรงไปตรงมา ช่วยผลัก', label_en: 'Direct, push me', data: 'action=say&text=firm' },
  ],
};

/**
 * What we assume when she has been asked twice and we still do not know.
 * Every one of these is the conservative choice — the smallest week we would
 * be willing to give anyone — because a wrong guess here is corrected by her
 * first check-in, while a third identical question ends the conversation.
 */
const DEFAULTS: Record<RequiredField, ProfileFields> = {
  goal: { goal: 'habit' },
  days_per_week: { days_per_week: 3 },
  session_minutes: { session_minutes: 30 },
  equipment: { equipment: ['bodyweight'] },
  experience: { experience: 'beginner' },
  coach_tone: { coach_tone: 'balanced' },
};

const ASSUMED_LABEL: Record<RequiredField, { th: string; en: string }> = {
  goal: { th: 'เริ่มจากสร้างนิสัยก่อน', en: 'starting with the habit' },
  days_per_week: { th: 'สัปดาห์ละ 3 วัน', en: '3 days a week' },
  session_minutes: { th: 'ครั้งละ 30 นาที', en: '30 minutes a session' },
  equipment: { th: 'ใช้น้ำหนักตัว', en: 'bodyweight only' },
  experience: { th: 'เริ่มจากระดับมือใหม่', en: 'beginner level' },
  coach_tone: { th: 'คุยแบบปกติ', en: 'a balanced tone' },
};

/** Never assume something about her silently — say it, and say it is editable. */
function assumedNoteShort(assumed: RequiredField[]): { th: string; en: string } | null {
  if (!assumed.length) return null;
  const th = assumed.map((f) => ASSUMED_LABEL[f].th).join(' ');
  const en = assumed.map((f) => ASSUMED_LABEL[f].en).join(', ');
  return {
    th: `ยังไม่แน่ใจเลยขอตั้งไว้ว่า ${th} ก่อนนะคะ แก้ได้ตลอดเลยค่ะ`,
    en: `I wasn't sure, so I've assumed ${en} for now — you can change that any time.`,
  };
}

function ackFor(saved: Record<string, unknown>): { th: string; en: string } {
  if (saved.goal) {
    return {
      th: `รับทราบค่ะ เป้าหมาย${GOAL_TH[String(saved.goal)] ?? ''}`,
      en: `Got it — ${GOAL_EN[String(saved.goal)] ?? 'noted'}.`,
    };
  }
  if (saved.days_per_week) {
    return { th: `โอเคค่ะ สัปดาห์ละ ${saved.days_per_week} วัน`, en: `${saved.days_per_week} days a week.` };
  }
  if (saved.session_minutes) {
    return { th: `ได้เลยค่ะ ครั้งละ ${saved.session_minutes} นาที`, en: `${saved.session_minutes} minutes a session.` };
  }
  if (saved.equipment) return { th: 'รับทราบเรื่องอุปกรณ์แล้วค่ะ', en: 'Noted what you have.' };
  if (saved.experience) return { th: 'เข้าใจแล้วค่ะ', en: 'Understood.' };
  if (saved.coach_tone) return { th: 'จำไว้แล้วนะคะ', en: 'Noted — I will keep to that.' };
  return { th: 'รับทราบค่ะ', en: 'Got it.' };
}

function openerFor(tone: string): { th: string; en: string } {
  if (tone === 'gentle') return { th: 'ค่อย ๆ ไปด้วยกันนะคะ 🙂', en: 'We will take this gently 🙂' };
  if (tone === 'firm') return { th: 'เอาล่ะ มาเริ่มกันเลย', en: 'Right — let us get started.' };
  return { th: 'ยินดีที่ได้เจอกันค่ะ 🙂', en: 'Good to meet you 🙂' };
}

function whyLine(req: CoachRequest, state: UserStateResult, gentle: boolean, week: number) {
  if (req.intent === 'onboard') {
    const because = state.profile.motivation ? `${state.profile.motivation} ` : '';
    return {
      th: `${because}สัปดาห์แรกเน้นให้ร่างกายจำท่าก่อน ยังไม่เพิ่มน้ำหนัก จะได้ไม่ปวดจนไม่อยากทำต่อ`,
      en: 'Week one is about learning the movements, not loading them — so you still want to come back.',
    };
  }
  if (gentle) {
    return {
      th: `สัปดาห์ที่แล้วชีวิตยุ่ง เลยเริ่มใหม่ที่ปริมาณน้อยลงประมาณ ${Math.abs(pctDrop(state))}% ร่างกายจะได้ไม่ต้องกระโดดกลับไปที่เดิม`,
      en: `Last week was busy, so we restart about ${Math.abs(pctDrop(state))}% lighter rather than jumping back in.`,
    };
  }
  return {
    th: `สัปดาห์ที่แล้วทำได้ ${state.derived.completion_rate_4w}% สัปดาห์ที่ ${week} เลยขยับขึ้นทีละนิดเท่านั้น`,
    en: `You completed ${state.derived.completion_rate_4w}% last week, so week ${week} steps up only slightly.`,
  };
}

function pctDrop(state: UserStateResult): number {
  const prev = state.derived.last_active_volume_sets ?? 0;
  const cap = state.derived.volume_ceiling_sets ?? 0;
  if (!prev || !cap) return 20;
  return Math.round(((cap - prev) / prev) * 100);
}

const FREEFORM_TH = 'ขอบคุณที่บอกนะคะ 🙂 ถ้าอยากดูแผนสัปดาห์นี้ พิมพ์ว่า "ขอดูแผน" ได้เลย หรือถ้าพร้อมลองออกไปยิมข้างนอกแล้ว บอกได้เลยค่ะ';
const FREEFORM_EN = 'Thanks for telling me. Say "show my plan", or tell me when you are ready for a gym.';
const FALLBACK_TH = 'ขอโทษค่ะ ตอนนี้จัดแผนให้ไม่สำเร็จ เดี๋ยวทีมงานจะตรวจสอบให้นะคะ';
const FALLBACK_EN = 'Sorry — the plan could not be generated. The team has been notified.';
