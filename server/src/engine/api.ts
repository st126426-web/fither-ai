import Anthropic from '@anthropic-ai/sdk';
import { APIConnectionError, APIError, RateLimitError } from '@anthropic-ai/sdk';
import type {
  CoachEngine, CoachRequest, CoachResult, CoachTools, SavePlanResult, ToolCallTrace,
} from './types.ts';
import { SYSTEM_PROMPT, TOOL_DEFS, buildUserPrompt } from './prompts.ts';
import { clampReply } from '../safety/validator.ts';

/** Cheapest current Claude model — this is a cost-capped demo path. */
export const DEFAULT_MODEL = 'claude-haiku-4-5';

export interface ApiEngineOptions {
  apiKey: string;
  model?: string;
  /** Deliberately low: plans are small and this path is the one that bills. */
  maxTokens?: number;
}

/**
 * Direct Anthropic API engine. Used only when an API key is explicitly
 * provided — never in local subscription mode.
 *
 * Uses a manual agentic loop rather than the beta tool runner so the retry
 * accounting, the max_tool_calls budget and the trace capture stay under our
 * control and out of a beta dependency.
 */
export class ApiEngine implements CoachEngine {
  readonly name = 'api' as const;
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(opts: ApiEngineOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model || DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? 8000;
  }

  async run(req: CoachRequest, tools: CoachTools): Promise<CoachResult> {
    const t0 = Date.now();
    let input_tokens = 0;
    let output_tokens = 0;
    const localTrace: ToolCallTrace[] = [];

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: buildUserPrompt(req) },
    ];

    let finalText = '';
    let calls = 0;
    let planRetriesExhausted = false;

    try {
      while (calls <= req.budget.max_tool_calls) {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: SYSTEM_PROMPT,
          tools: TOOL_DEFS as Anthropic.Tool[],
          messages,
        });

        input_tokens += response.usage.input_tokens;
        output_tokens += response.usage.output_tokens;

        if (response.stop_reason === 'refusal') {
          return this.errorResult(req, t0, 'blocked_safety', REFUSAL_TH, {
            input_tokens, output_tokens,
          });
        }

        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim() || finalText;

        if (response.stop_reason !== 'tool_use') break;

        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        messages.push({ role: 'assistant', content: response.content });

        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          calls++;
          const t1 = Date.now();
          let payload: unknown;
          let ok = true;
          try {
            payload = await dispatch(tools, tu.name, tu.input, req);
            if (tu.name === 'save_plan') {
              const r = payload as SavePlanResult;
              if (!r.ok && r.retries_left <= 0) planRetriesExhausted = true;
            }
          } catch (e) {
            ok = false;
            payload = { error: e instanceof Error ? e.message : String(e) };
          }
          localTrace.push({
            name: tu.name,
            args_summary: JSON.stringify(tu.input).slice(0, 120),
            ok,
            ms: Date.now() - t1,
          });
          results.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(payload),
            is_error: !ok,
          });
        }

        messages.push({ role: 'user', content: results });

        if (planRetriesExhausted) break;
      }
    } catch (e) {
      return this.errorResult(req, t0, 'engine_error', engineErrorMessage(e), {
        input_tokens, output_tokens,
      });
    }

    return {
      request_id: req.request_id,
      status: planRetriesExhausted ? 'validation_failed' : 'ok',
      intent: req.intent,
      reply: { text_th: clampReply(finalText || DEFAULT_TH) },
      artifacts: {},
      trace: {
        engine: 'api',
        tool_calls: localTrace,
        validator_runs: [],
        retries: 0,
        fallback_used: 'none',
        usage: { input_tokens, output_tokens, ms: Date.now() - t0 },
      },
    };
  }

  private errorResult(
    req: CoachRequest,
    t0: number,
    status: CoachResult['status'],
    text: string,
    usage: { input_tokens: number; output_tokens: number },
  ): CoachResult {
    return {
      request_id: req.request_id,
      status,
      intent: req.intent,
      reply: { text_th: clampReply(text) },
      artifacts: {},
      trace: {
        engine: 'api',
        tool_calls: [],
        validator_runs: [],
        retries: 0,
        fallback_used: 'none',
        usage: { ...usage, ms: Date.now() - t0 },
      },
    };
  }
}

export async function dispatch(
  tools: CoachTools,
  name: string,
  input: unknown,
  req: CoachRequest,
): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'get_user_state':
      return tools.get_user_state({ user_id: (args.user_id as string) || req.user_id });
    case 'save_profile':
      return tools.save_profile({
        ...(args as Record<string, never>),
        user_id: (args.user_id as string) || req.user_id,
      });
    case 'save_plan':
      return tools.save_plan({
        user_id: (args.user_id as string) || req.user_id,
        plan: args.plan,
        why_th: (args.why_th as string) ?? '',
        why_en: (args.why_en as string) ?? '',
      });
    case 'search_partners':
      return tools.search_partners(args as Parameters<CoachTools['search_partners']>[0]);
    case 'maps_fallback':
      return tools.maps_fallback({ query: (args.query as string) ?? '', area: args.area as string });
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function engineErrorMessage(e: unknown): string {
  // Most-specific first: retryable rate limits and connection faults are worth
  // telling the user about differently from a hard 4xx.
  if (e instanceof RateLimitError) return RATE_LIMIT_TH;
  if (e instanceof APIConnectionError) return CONNECTION_TH;
  if (e instanceof APIError) return `${GENERIC_TH} (${e.status ?? 'api'})`;
  return GENERIC_TH;
}

const DEFAULT_TH = 'รับทราบค่ะ เดี๋ยวจัดให้นะคะ';
const REFUSAL_TH = 'เรื่องนี้เกินขอบเขตที่โค้ชตอบได้ค่ะ เดี๋ยวให้โค้ชที่เป็นคนติดต่อกลับนะคะ';
const RATE_LIMIT_TH = 'ตอนนี้ระบบมีคนใช้งานเยอะค่ะ ลองใหม่อีกครั้งในสักครู่นะคะ';
const CONNECTION_TH = 'ตอนนี้เชื่อมต่อระบบไม่ได้ค่ะ ลองใหม่อีกครั้งนะคะ';
const GENERIC_TH = 'ขออภัยค่ะ ระบบขัดข้องชั่วคราว';
