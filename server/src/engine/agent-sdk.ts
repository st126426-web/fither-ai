import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { CoachEngine, CoachRequest, CoachResult, CoachTools, SavePlanResult, ToolCallTrace } from './types.ts';
import {
  SAVE_PLAN_DESCRIPTION, SAVE_PROFILE_DESCRIPTION, SYSTEM_PROMPT, buildUserPrompt,
} from './prompts.ts';
import { clampReply } from '../safety/validator.ts';

const SERVER_NAME = 'fither';
const T = (n: string) => `mcp__${SERVER_NAME}__${n}`;

/**
 * Local live-demo engine. Runs through the Claude Agent SDK using the
 * logged-in `claude` CLI's subscription auth — no API key, no per-token
 * billing against an API account.
 *
 * The four FitHer tools are exposed as in-process SDK MCP tools and all
 * built-in Claude Code tools are disabled (`tools: []`), so the agent has
 * exactly the four tools the proposal specifies and no filesystem access.
 */
export class AgentSdkEngine implements CoachEngine {
  readonly name = 'agent-sdk' as const;

  async run(req: CoachRequest, tools: CoachTools): Promise<CoachResult> {
    const t0 = Date.now();
    const traced: ToolCallTrace[] = [];
    let planRetriesExhausted = false;

    const call = async (name: string, fn: () => Promise<unknown>) => {
      const t1 = Date.now();
      try {
        const out = await fn();
        traced.push({ name, args_summary: '', ok: true, ms: Date.now() - t1 });
        return { content: [{ type: 'text' as const, text: JSON.stringify(out) }] };
      } catch (e) {
        traced.push({ name, args_summary: '', ok: false, ms: Date.now() - t1 });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: String(e) }) }],
          isError: true,
        };
      }
    };

    const server = createSdkMcpServer({
      name: SERVER_NAME,
      version: '1.0.0',
      tools: [
        tool(
          'get_user_state',
          'Get the user profile, recent plans and check-ins, and a derived block with the exact '
          + 'volume numbers the safety validator enforces. Call this first.',
          { user_id: z.string() },
          async (args) => call('get_user_state', () =>
            tools.get_user_state({ user_id: args.user_id || req.user_id })),
        ),
        tool(
          'save_profile',
          SAVE_PROFILE_DESCRIPTION,
          {
            user_id: z.string(),
            goal: z.enum(['strength', 'fat_loss', 'energy', 'habit']).optional(),
            days_per_week: z.number().optional(),
            session_minutes: z.number().optional(),
            equipment: z.array(z.string()).optional()
              .describe('bodyweight, mat, dumbbell, treadmill, bench, resistance_band, kettlebell, box. Thai accepted.'),
            experience: z.enum(['beginner', 'returning', 'intermediate']).optional(),
            life_stage: z.enum(['none', 'postpartum', 'perimenopause', 'pregnant']).optional(),
            coach_tone: z.enum(['gentle', 'balanced', 'firm']).optional()
              .describe('How she wants to be coached.'),
            tone_note: z.string().optional().describe('Her own words about the tone she wants.'),
            motivation: z.string().optional().describe('Why this matters to her, in her words.'),
            target_weeks: z.number().optional().describe('Her own timeframe in weeks.'),
            target_event: z.string().optional().describe('What the timeframe is for.'),
            age: z.number().optional(),
            height_cm: z.number().optional(),
            weight_kg: z.number().optional(),
            injuries: z.string().optional().describe('Niggles to programme around, her words.'),
            sleep_hours: z.number().optional(),
            activity_level: z.enum(['sedentary', 'light', 'active']).optional(),
            train_time: z.enum(['morning', 'midday', 'evening']).optional(),
            dislikes: z.string().optional().describe('What she refuses to do.'),
          },
          async ({ user_id, ...fields }) => call('save_profile', () =>
            tools.save_profile({ user_id: user_id || req.user_id, ...fields })),
        ),
        tool(
          'save_plan',
          SAVE_PLAN_DESCRIPTION,
          {
            user_id: z.string(),
            plan: z.any().describe('Must match PlanSchema; exercise_id values must come from the library.'),
            why_th: z.string().describe('One line in Thai: why this week looks like this. No guilt language.'),
            why_en: z.string().describe('The same line in English.'),
          },
          async (args) => call('save_plan', async () => {
            const out = await tools.save_plan({
              user_id: args.user_id || req.user_id,
              plan: args.plan,
              why_th: args.why_th,
              why_en: args.why_en,
            }) as SavePlanResult;
            if (!out.ok && out.retries_left <= 0) planRetriesExhausted = true;
            return out;
          }),
        ),
        tool(
          'search_partners',
          'Search FitHer beginner-vetted partner venues. Always try this before maps_fallback.',
          {
            area: z.string().optional(),
            price_tier_max: z.number().optional(),
            tags: z.array(z.string()).optional(),
            beginner_friendly_only: z.boolean().optional(),
            limit: z.number().optional(),
          },
          async (args) => call('search_partners', () => tools.search_partners(args)),
        ),
        tool(
          'maps_fallback',
          'Generic venue search. Results are NOT beginner-vetted and you must say so in Thai. '
          + 'Only call this when search_partners returned zero results.',
          { query: z.string(), area: z.string().optional() },
          async (args) => call('maps_fallback', () =>
            tools.maps_fallback({ query: args.query, area: args.area })),
        ),
      ],
    });

    let text = '';
    let input_tokens = 0;
    let output_tokens = 0;
    let status: CoachResult['status'] = 'ok';
    let failure: string | null = null;

    try {
      for await (const message of query({
        prompt: buildUserPrompt(req),
        options: {
          systemPrompt: SYSTEM_PROMPT,
          // No built-in Claude Code tools — the agent gets exactly these five.
          tools: [],
          mcpServers: { [SERVER_NAME]: server },
          allowedTools: [
            T('get_user_state'), T('save_profile'), T('save_plan'),
            T('search_partners'), T('maps_fallback'),
          ],
          maxTurns: req.budget.max_turns,
        },
      })) {
        if (message.type === 'result') {
          // The SDK reports cached input separately. Our system prompt and the
          // exercise library are large and stable, so they are nearly always a
          // cache hit — reading `input_tokens` alone reports 3–4 tokens for a
          // turn that actually consumed thousands, and /api/usage then shows a
          // cost that is off by orders of magnitude.
          const u = message.usage as {
            input_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
            output_tokens?: number;
          } | undefined;
          input_tokens = (u?.input_tokens ?? 0)
            + (u?.cache_creation_input_tokens ?? 0)
            + (u?.cache_read_input_tokens ?? 0);
          output_tokens = u?.output_tokens ?? 0;
          if (message.subtype === 'success') {
            text = message.result;
          } else {
            // Never swallow the reason — a silent "ระบบขัดข้อง" is impossible
            // to diagnose from the outside.
            status = 'engine_error';
            failure = message.subtype;
            console.error(
              `[FitHer] agent-sdk failed: ${message.subtype}`,
              (message as { errors?: string[] }).errors ?? '',
              `turns=${message.num_turns}`,
            );
          }
        }
      }
    } catch (e) {
      console.error('[FitHer] agent-sdk threw:', e);
      return {
        request_id: req.request_id,
        status: 'engine_error',
        intent: req.intent,
        reply: { text_th: clampReply(req.locale === 'en' ? GENERIC_EN : GENERIC_TH) },
        artifacts: {},
        trace: {
          engine: 'agent-sdk',
          tool_calls: traced,
          validator_runs: [],
          retries: 0,
          fallback_used: 'none',
          usage: { input_tokens, output_tokens, ms: Date.now() - t0 },
        },
      };
    }

    return {
      request_id: req.request_id,
      status: planRetriesExhausted ? 'validation_failed' : status,
      intent: req.intent,
      // A run can succeed having only called a tool, leaving no text. That is
      // not a failure and must not be shown as one — but the caller is told,
      // because a filler line is not an answer to anything.
      reply: {
        text_th: clampReply(
          text
          || (status === 'ok' ? continuationFor(req.locale) : messageFor(failure, req.locale)),
        ),
      },
      silent: !text,
      artifacts: {},
      trace: {
        engine: 'agent-sdk',
        tool_calls: traced,
        validator_runs: [],
        retries: 0,
        fallback_used: 'none',
        usage: { input_tokens, output_tokens, ms: Date.now() - t0 },
      },
    };
  }
}

/**
 * A failure the user can act on beats a generic apology. Running out of turns
 * mid-plan is the common one and simply needs another message.
 */
function messageFor(failure: string | null, locale: 'th' | 'en'): string {
  if (failure === 'error_max_turns') {
    return locale === 'en'
      ? 'That took me longer than expected. Send that again and I will pick up where I left off.'
      : 'ขอโทษค่ะ คิดนานไปหน่อย ส่งข้อความเดิมอีกครั้งได้ไหมคะ เดี๋ยวทำต่อให้เลย';
  }
  return locale === 'en' ? GENERIC_EN : GENERIC_TH;
}

/** The agent did its work but said nothing. Keep the conversation moving. */
function continuationFor(locale: 'th' | 'en'): string {
  return locale === 'en'
    ? 'Got it — noted.'
    : 'รับทราบค่ะ 🙂';
}

const GENERIC_TH = 'ขออภัยค่ะ ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งนะคะ';
const GENERIC_EN = 'Sorry — something went wrong on our side. Please try again.';
