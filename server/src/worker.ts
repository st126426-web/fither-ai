import { loadConfig, type EnvRecord } from './config.ts';
import { createApp } from './index.ts';
import { D1Storage, type D1Like } from './storage/d1.ts';
import { PARTNER_ROWS } from './lib/seed.ts';

export interface WorkerEnv {
  DB: unknown;
  WEB_URL?: string;
  [key: string]: unknown;
}

let partnersSeeded = false;

/** Workers bindings are mixed types; config only ever reads the string vars. */
function envStrings(env: WorkerEnv): EnvRecord {
  const out: EnvRecord = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const cfg = loadConfig(envStrings(env));

    // The hosted demo must never silently start billing: without an explicit
    // key the engine stays on mock regardless of COACH_ENGINE.
    if (cfg.engine === 'api' && !cfg.anthropicApiKey) cfg.engine = 'mock';

    const storage = new D1Storage(env.DB as D1Like);

    // Schema is applied by `npm run -w server d1:init`; partners are small
    // enough to top up lazily on the first request after a deploy.
    if (!partnersSeeded) {
      try {
        if ((await storage.countPartners()) === 0) await storage.replacePartners(PARTNER_ROWS);
        partnersSeeded = true;
      } catch (e) {
        console.error('[FitHer] partner seed skipped:', e);
      }
    }

    const webUrl = env.WEB_URL || 'https://example.github.io/fither-ai/';
    return createApp({ storage, cfg, webUrl }).fetch(request);
  },
};
