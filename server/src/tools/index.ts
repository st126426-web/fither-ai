import type {
  CoachRequest, CoachTools, FallbackUsed, SavePlanResult, SavedPlanRef,
  ToolCallTrace, ValidatorRun, VenueRecommendation,
} from '../engine/types.ts';
import { validatePlan } from '../safety/validator.ts';
import { filterLibrary, nowIso, parseJson, uid } from '../lib/util.ts';
import type { Storage } from '../storage/types.ts';
import { getUserState } from './user-state.ts';
import { saveProfile } from './profile.ts';
import { mapsFallback, searchPartners } from './partner-search.ts';

export interface ToolState {
  tool_calls: ToolCallTrace[];
  validator_runs: ValidatorRun[];
  retries: number;
  fallback_used: FallbackUsed;
  saved_plan?: SavedPlanRef;
  venue?: VenueRecommendation;
}

/**
 * Binds the five tools to a storage instance and one request, and records
 * everything the engine does so the orchestrator can build CoachResult.trace
 * without the engine having to cooperate.
 */
export function createTools(storage: Storage, req: CoachRequest): { tools: CoachTools; state: ToolState } {
  const state: ToolState = {
    tool_calls: [],
    validator_runs: [],
    retries: 0,
    fallback_used: 'none',
  };

  async function traced<T>(name: string, args: unknown, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      const out = await fn();
      state.tool_calls.push({ name, args_summary: summarise(args), ok: true, ms: Date.now() - t0 });
      return out;
    } catch (e) {
      state.tool_calls.push({ name, args_summary: summarise(args), ok: false, ms: Date.now() - t0 });
      throw e;
    }
  }

  const tools: CoachTools = {
    get_user_state: (args) =>
      traced('get_user_state', args, () => getUserState(storage, args.user_id || req.user_id)),

    save_profile: ({ user_id, ...fields }) =>
      traced('save_profile', fields, () => saveProfile(storage, user_id || req.user_id, fields)),

    save_plan: (args) =>
      traced('save_plan', { week: (args.plan as { week_number?: number })?.week_number }, async () => {
        return savePlan(storage, req, state, args);
      }),

    search_partners: (args) =>
      traced('search_partners', args, async () => {
        const out = await searchPartners(storage, args);
        if (out.count > 0) {
          const top = out.results[0];
          state.venue = {
            partner_id: top.partner_id,
            name: top.name,
            area: top.area,
            price_tier: top.price_tier,
            vetted: true,
            lat: top.lat,
            lng: top.lng,
            note: top.note,
            note_en: top.note_en,
            match_reasons: top.match_reasons,
            match_reasons_en: top.match_reasons_en,
          };
        }
        return out;
      }),

    maps_fallback: (args) =>
      traced('maps_fallback', args, async () => {
        const out = await mapsFallback(args);
        state.fallback_used = 'maps_fallback';
        const top = out.results[0];
        if (top) {
          state.venue = {
            partner_id: `fallback_${top.name.replace(/\W+/g, '_').toLowerCase()}`,
            name: top.name,
            area: top.area,
            price_tier: 0,
            vetted: false,
            note: top.note,
            note_en: top.note_en,
            match_reasons: [out.disclaimer_th],
            match_reasons_en: [out.disclaimer_en],
          };
        }
        return out;
      }),
  };

  return { tools, state };
}

/**
 * Tool 2: save_plan. The validator runs BEFORE the write; failures come back
 * to the model as fix hints rather than as a thrown error.
 */
async function savePlan(
  storage: Storage,
  req: CoachRequest,
  state: ToolState,
  args: { user_id: string; plan: unknown; why_th: string; why_en: string },
): Promise<SavePlanResult> {
  const userId = args.user_id || req.user_id;
  const user = await storage.getUser(userId);
  if (!user) throw new Error(`unknown user: ${userId}`);

  const st = await getUserState(storage, userId);
  const attempt = state.validator_runs.length + 1;

  // Rebuild from the user row as it is NOW. req.library was computed before
  // the agent ran, and during onboarding her equipment did not exist yet —
  // validating against that snapshot rejected perfectly valid exercise IDs.
  const { allowed } = filterLibrary({
    equipment: parseJson<string[]>(user.equipment_json, []),
    experience: user.experience ?? 'beginner',
    life_stage: user.life_stage,
  });

  const result = validatePlan(args.plan, {
    library: allowed,
    equipment: parseJson<string[]>(user.equipment_json, []),
    experience: user.experience ?? 'beginner',
    life_stage: user.life_stage,
    session_minutes: user.session_minutes ?? 45,
    days_per_week: user.days_per_week ?? 3,
    last_active_volume_sets: st.derived.last_active_volume_sets,
    missed_last_week: st.derived.missed_last_week,
    why_th: args.why_th,
    why_en: args.why_en,
  });

  state.validator_runs.push({
    attempt,
    passed: result.ok,
    codes: result.errors.map((e) => e.code),
  });

  if (!result.ok) {
    state.retries = attempt;
    await storage.insertEvent({
      id: uid('ev'),
      user_id: userId,
      type: 'plan_rejected',
      payload_json: JSON.stringify({
        request_id: req.request_id,
        attempt,
        codes: result.errors.map((e) => e.code),
        errors: result.errors,
      }),
      created_at: nowIso(),
    });
    return {
      ok: false,
      retries_left: Math.max(0, req.budget.max_plan_retries - attempt + 1),
      errors: result.errors,
    };
  }

  // The validated, coerced plan — not args.plan, which may still be a JSON
  // string or carry a day written as "Monday".
  const plan = result.plan!;
  const planId = uid('plan');
  await storage.supersedePlans(userId);
  await storage.insertPlan({
    id: planId,
    user_id: userId,
    week_number: plan.week_number,
    status: 'active',
    plan_json: JSON.stringify(plan),
    why_text_th: args.why_th,
    why_text_en: args.why_en,
    engine: req.budget.engine,
    created_at: nowIso(),
  });

  await storage.insertEvent({
    id: uid('ev'),
    user_id: userId,
    type: plan.week_number === 1 ? 'plan_created' : 'plan_replanned',
    payload_json: JSON.stringify({
      request_id: req.request_id,
      plan_id: planId,
      week_number: plan.week_number,
      volume_total_sets: result.volume_total_sets,
      delta_vs_prev_pct: result.delta_vs_prev_pct,
      why_th: args.why_th,
      engine: req.budget.engine,
    }),
    created_at: nowIso(),
  });

  state.saved_plan = {
    plan_id: planId,
    week_number: plan.week_number,
    status: 'active',
    volume_total_sets: result.volume_total_sets,
    delta_vs_prev_pct: result.delta_vs_prev_pct,
    why_th: args.why_th,
    why_en: args.why_en,
  };

  return {
    ok: true,
    plan_id: planId,
    week_number: plan.week_number,
    volume_total_sets: result.volume_total_sets,
    delta_vs_prev_pct: result.delta_vs_prev_pct,
  };
}

function summarise(args: unknown): string {
  try {
    const s = JSON.stringify(args);
    return s.length > 120 ? `${s.slice(0, 119)}…` : s;
  } catch {
    return '[unserialisable]';
  }
}
