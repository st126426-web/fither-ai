import type { Config } from '../config.ts';
import type {
  CheckinPayload, CoachEngine, CoachRequest, CoachResult, EngineName, Plan, SafetyFlag,
} from './types.ts';
import { ApiEngine } from './api.ts';
import { MockEngine } from './mock.ts';
import { buildTemplatePlan } from './template-planner.ts';
import { clampReply, hasBlockingFlag, scanRedFlags, warningFlags } from '../safety/validator.ts';
import { createTools } from '../tools/index.ts';
import { getUserState } from '../tools/user-state.ts';
import { missingFields } from '../tools/profile.ts';
import { profileOf } from '../tools/user-state.ts';
import { filterLibrary, nowIso, parseJson, uid } from '../lib/util.ts';
import type { Storage } from '../storage/types.ts';

export const HANDOFF_TH =
  'ขอบคุณที่บอกนะคะ 🙏 อาการแบบนี้เราจะไม่จัดโปรแกรมให้เองค่ะ '
  + 'ขอส่งต่อให้โค้ชที่เป็นคนติดต่อกลับหาคุณ และถ้าอาการไม่ดีขึ้น แนะนำให้พบแพทย์นะคะ '
  + 'ระหว่างนี้พักก่อน ไม่ต้องฝืนค่ะ';

export const HANDOFF_EN =
  'Thanks for telling me. We will not auto-generate a plan for this. '
  + 'A human coach will follow up, and please see a doctor if it does not improve.';

/**
 * Builds the CoachRequest, runs the pre-flight safety gate, picks an engine,
 * runs it, and reconciles what the tools actually did into the result.
 *
 * Engines report their own text and usage; everything factual (the saved plan,
 * the venue, the validator runs) comes from the tool layer, so an engine
 * cannot claim to have saved a plan it did not save.
 */
export async function runCoach(
  storage: Storage,
  cfg: Config,
  input: Omit<CoachRequest, 'library' | 'budget' | 'request_id'> & { request_id?: string },
): Promise<CoachResult> {
  const request_id = input.request_id ?? uid('req');
  const user = await storage.getUser(input.user_id);
  // During agentic onboarding the profile is still being filled in, so an
  // absent or partial user row is normal rather than an error.
  if (!user && input.intent !== 'onboard' && input.intent !== 'freeform') {
    throw new Error(`unknown user: ${input.user_id}`);
  }

  // --- 1. Pre-flight safety gate (deterministic, zero tokens) ---------
  const checkinNotes = (input.payload as CheckinPayload | undefined)?.notes;
  const flags = scanRedFlags([input.message, checkinNotes].filter(Boolean).join(' '));
  if (hasBlockingFlag(flags, input.intent)) {
    return handoff(storage, cfg, request_id, input.user_id, input.intent, flags);
  }
  const warnings = warningFlags(flags, input.intent);
  if (warnings.length) {
    await storage.insertEvent({
      id: uid('ev'), user_id: input.user_id, type: 'safety_warning',
      payload_json: JSON.stringify({ request_id, intent: input.intent, warnings }),
      created_at: nowIso(),
    });
  }

  // --- 2. Build the request ------------------------------------------
  const { allowed, excluded_reason } = filterLibrary({
    equipment: parseJson<string[]>(user?.equipment_json, []),
    experience: user?.experience ?? 'beginner',
    life_stage: user?.life_stage ?? null,
  });

  const activeRow = await storage.getActivePlan(input.user_id);
  const engineName = await resolveEngine(storage, cfg);
  const req: CoachRequest = {
    request_id,
    user_id: input.user_id,
    intent: input.intent,
    source: input.source,
    locale: input.locale,
    message: input.message,
    payload: input.payload,
    library: {
      allowed_exercise_ids: allowed.map((e) => e.id),
      catalog: allowed,
      excluded_reason,
    },
    profile: user ? profileOf(user) : undefined,
    missing_fields: missingFields(user),
    history: input.history,
    warnings,
    active_plan: parseJson<Plan | null>(activeRow?.plan_json, null),
    budget: { engine: engineName, max_tool_calls: 8, max_plan_retries: 2, max_turns: 20 },
  };

  // --- 3. Run ---------------------------------------------------------
  const { tools, state } = createTools(storage, req);
  const engine = await makeEngine(engineName, cfg);
  let result = await engine.run(req, tools);

  // --- 4. Reconcile with what the tools actually did ------------------
  result = {
    ...result,
    artifacts: {
      ...result.artifacts,
      plan: state.saved_plan ?? result.artifacts.plan,
      venue: state.venue ?? result.artifacts.venue,
      flags: flags.length ? flags : result.artifacts.flags,
    },
    trace: {
      ...result.trace,
      tool_calls: state.tool_calls.length ? state.tool_calls : result.trace.tool_calls,
      validator_runs: state.validator_runs,
      retries: state.retries,
      fallback_used: state.fallback_used !== 'none' ? state.fallback_used : result.trace.fallback_used,
    },
  };

  if (state.venue) {
    await storage.insertEvent({
      id: uid('ev'),
      user_id: req.user_id,
      type: 'venue_recommended',
      payload_json: JSON.stringify({ request_id, ...state.venue }),
      created_at: nowIso(),
    });
  }

  // --- 5. Template fallback: a plan intent must always end in a plan ---
  // Onboarding is exempt while the profile is still incomplete — the agent is
  // mid-conversation there, and shipping a plan built on unknowns would be
  // worse than asking one more question.
  //
  // Whether she is still mid-interview is a question about NOW, not about the
  // state the turn started in: the agent can fill the last field and then stop
  // without a word, and that silent turn is exactly where a missing plan shows.
  // A turn where it actually said something is left alone — it may well be
  // asking her the one optional question before it plans.
  const afterUser = await storage.getUser(input.user_id);
  const profileComplete = missingFields(afterUser).length === 0;
  const startedComplete = (req.missing_fields?.length ?? 0) === 0;
  const needsPlan = req.intent === 'weekly_replan'
    || (req.intent === 'onboard' && profileComplete && (startedComplete || result.silent === true));
  if (needsPlan && !result.artifacts.plan) {
    result = await templateFallback(storage, req, result, tools);
  }

  // --- 6. Instrumentation --------------------------------------------
  await storage.insertUsage({
    id: uid('use'),
    engine: engineName,
    input_tokens: result.trace.usage.input_tokens,
    output_tokens: result.trace.usage.output_tokens,
    created_at: nowIso(),
  });
  console.log(
    `[FitHer] ${req.intent} engine=${engineName} in=${result.trace.usage.input_tokens} `
    + `out=${result.trace.usage.output_tokens} ms=${result.trace.usage.ms} `
    + `tools=${result.trace.tool_calls.length} retries=${result.trace.retries} status=${result.status}`,
  );

  result.reply.text_th = clampReply(result.reply.text_th);
  return result;
}

/** After the model exhausts its retries, ship a validated template plan. */
async function templateFallback(
  storage: Storage,
  req: CoachRequest,
  result: CoachResult,
  tools: ReturnType<typeof createTools>['tools'],
): Promise<CoachResult> {
  const st = await getUserState(storage, req.user_id);
  const gentle = st.derived.missed_last_week;
  const week = req.intent === 'onboard' ? 1 : st.derived.next_week_number;

  // Same staleness trap as save_plan: rebuild from her current profile.
  const user = await storage.getUser(req.user_id);
  const { allowed } = filterLibrary({
    equipment: parseJson<string[]>(user?.equipment_json, []),
    experience: user?.experience ?? 'beginner',
    life_stage: user?.life_stage ?? null,
  });

  const plan = buildTemplatePlan(allowed.length ? allowed : req.library.catalog, {
    week_number: week,
    days_per_week: st.profile.days_per_week ?? 3,
    session_minutes: st.profile.session_minutes ?? 45,
    volume_ceiling_sets: st.derived.volume_ceiling_sets,
    gentle,
  });

  const why_th = gentle
    ? 'สัปดาห์นี้เริ่มใหม่แบบเบาลง เพื่อให้ร่างกายค่อย ๆ กลับเข้าจังหวะ'
    : 'ค่อย ๆ เพิ่มทีละนิดตามที่ทำได้จริงในสัปดาห์ที่ผ่านมา';
  const why_en = gentle
    ? 'A lighter restart so your body eases back into rhythm.'
    : 'A small step up, based on what you actually completed last week.';

  const saved = await tools.save_plan({ user_id: req.user_id, plan, why_th, why_en });
  if (!saved.ok) return result;

  await storage.insertEvent({
    id: uid('ev'),
    user_id: req.user_id,
    type: 'template_fallback_used',
    payload_json: JSON.stringify({ request_id: req.request_id, plan_id: saved.plan_id }),
    created_at: nowIso(),
  });

  return {
    ...result,
    status: 'ok',
    reply: {
      text_th: clampReply(`แผนสัปดาห์ที่ ${saved.week_number} พร้อมแล้วค่ะ\n\nทำไมสัปดาห์นี้เป็นแบบนี้: ${why_th}`),
      text_en: why_en,
    },
    artifacts: {
      ...result.artifacts,
      plan: {
        plan_id: saved.plan_id,
        week_number: saved.week_number,
        status: 'active',
        volume_total_sets: saved.volume_total_sets,
        delta_vs_prev_pct: saved.delta_vs_prev_pct,
        why_th,
        why_en,
      },
    },
    trace: { ...result.trace, fallback_used: 'template_plan' },
  };
}

async function handoff(
  storage: Storage,
  cfg: Config,
  request_id: string,
  user_id: string,
  intent: CoachRequest['intent'],
  flags: SafetyFlag[],
): Promise<CoachResult> {
  await storage.insertEvent({
    id: uid('ev'),
    user_id,
    type: 'red_flag_handoff',
    payload_json: JSON.stringify({ request_id, flags, intent }),
    created_at: nowIso(),
  });
  console.log(`[FitHer] RED FLAG ${flags.map((f) => f.code).join(',')} — plan generation blocked, 0 tokens`);
  return {
    request_id,
    status: 'blocked_safety',
    intent,
    reply: { text_th: clampReply(HANDOFF_TH), text_en: HANDOFF_EN },
    artifacts: { flags },
    trace: {
      engine: cfg.engine,
      tool_calls: [],
      validator_runs: [],
      retries: 0,
      fallback_used: 'none',
      usage: { input_tokens: 0, output_tokens: 0, ms: 0 },
    },
  };
}

/** Hard cost guardrail: the API engine falls back to mock past its daily cap. */
export async function resolveEngine(storage: Storage, cfg: Config): Promise<EngineName> {
  if (cfg.engine !== 'api') return cfg.engine;
  const used = await storage.countApiCallsToday();
  if (used >= cfg.apiDailyCallCap) {
    console.warn(`[FitHer] API daily cap reached (${used}/${cfg.apiDailyCallCap}) — falling back to mock.`);
    return 'mock';
  }
  return 'api';
}

export type EngineFactory = (name: EngineName, cfg: Config) => CoachEngine | Promise<CoachEngine>;

/**
 * Only the engines that can run anywhere. The Agent SDK drives the `claude`
 * CLI as a subprocess, so it is Node-only — and referencing it from shared code
 * (even behind a dynamic import) drags it and its Node-only dependencies into
 * the Cloudflare Worker bundle, which can never use it. The Node entry point
 * registers it instead; the Worker never learns it exists.
 */
const portableEngines: EngineFactory = (name, cfg) => {
  if (name === 'api') {
    return new ApiEngine({ apiKey: cfg.anthropicApiKey!, model: cfg.anthropicModel });
  }
  // Asking for the Agent SDK here means a Node entry point forgot to call
  // registerNodeEngines(). Quietly handing back MockEngine would run the
  // keyword engine for the rest of the session while every log line still
  // read `engine=agent-sdk` — the failure is invisible exactly when it
  // matters, mid-demo. Fail loudly instead.
  if (name === 'agent-sdk') {
    throw new Error(
      'COACH_ENGINE=agent-sdk but no Node engine factory is registered. '
      + 'Call registerNodeEngines() from src/engine/node-engines.ts at the entry point '
      + '(it cannot be registered in shared code — the Worker bundle cannot host it).',
    );
  }
  return new MockEngine();
};

let engineFactory: EngineFactory = portableEngines;

export function registerEngineFactory(factory: EngineFactory): void {
  engineFactory = factory;
}

export function makeEngine(name: EngineName, cfg: Config): CoachEngine | Promise<CoachEngine> {
  return engineFactory(name, cfg);
}
