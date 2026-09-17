import type { Config } from '../config.ts';
import { AgentSdkEngine } from './agent-sdk.ts';
import { ApiEngine } from './api.ts';
import { MockEngine } from './mock.ts';
import { registerEngineFactory } from './index.ts';

/**
 * Node-only engine registration.
 *
 * The Agent SDK drives the `claude` CLI as a subprocess, so it can only exist
 * on a Node entry point — importing it from shared code would drag it into the
 * Worker bundle. Every Node entry point (the server and the scripts) must call
 * this, or `COACH_ENGINE=agent-sdk` silently falls through to `MockEngine`
 * while the logs still say `engine=agent-sdk`.
 */
export function registerNodeEngines(): void {
  registerEngineFactory((name, cfg: Config) => {
    if (name === 'agent-sdk') return new AgentSdkEngine();
    if (name === 'api') return new ApiEngine({ apiKey: cfg.anthropicApiKey!, model: cfg.anthropicModel });
    return new MockEngine();
  });
}
