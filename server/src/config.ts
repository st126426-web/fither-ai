import type { EngineName } from './engine/types.ts';

export interface Config {
  mode: 'local' | 'hosted';
  engine: EngineName;
  anthropicApiKey?: string;
  anthropicModel?: string;
  apiDailyCallCap: number;
  lineChannelSecret?: string;
  lineChannelAccessToken?: string;
  sqlitePath: string;
  port: number;
}

export type EnvRecord = Record<string, string | undefined>;

export function loadConfig(env: EnvRecord): Config {
  const mode = (env.FITHER_MODE === 'hosted' ? 'hosted' : 'local') as Config['mode'];
  const defaultEngine: EngineName = mode === 'local' ? 'agent-sdk' : 'mock';
  const engine = (env.COACH_ENGINE as EngineName) || defaultEngine;

  return {
    mode,
    engine,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
    apiDailyCallCap: Number(env.API_DAILY_CALL_CAP ?? 50),
    lineChannelSecret: env.LINE_CHANNEL_SECRET,
    lineChannelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    sqlitePath: env.SQLITE_PATH || './data/fither.db',
    port: Number(env.PORT ?? 8787),
  };
}

/**
 * An API key in local mode silently overrides subscription auth and starts
 * billing. Per the spec this is fatal, not a warning.
 */
export function assertLocalAuthSanity(cfg: Config): void {
  if (cfg.mode === 'local' && cfg.anthropicApiKey) {
    console.error(
      '\n[FitHer] FATAL: FITHER_MODE=local but ANTHROPIC_API_KEY is set.\n'
      + '  An API key silently overrides Claude subscription auth and bills per token.\n'
      + '  Unset it (PowerShell: Remove-Item Env:ANTHROPIC_API_KEY) or run with FITHER_MODE=hosted.\n',
    );
    process.exit(1);
  }
  if (cfg.engine === 'api' && !cfg.anthropicApiKey) {
    console.error('\n[FitHer] FATAL: COACH_ENGINE=api but ANTHROPIC_API_KEY is not set.\n');
    process.exit(1);
  }
}
