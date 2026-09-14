import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Config } from './config.ts';
import { api, type AppEnv } from './routes/api.ts';
import { replyToLine, routeLineEvent, verifySignature, type LineEvent } from './line/webhook.ts';
import type { Storage } from './storage/types.ts';

export interface CreateAppOptions {
  storage: Storage;
  cfg: Config;
  webUrl: string;
}

/** One Hono app, identical on Node and Cloudflare Workers. */
export function createApp({ storage, cfg, webUrl }: CreateAppOptions) {
  const app = new Hono<AppEnv>();

  app.use('*', cors());
  app.use('*', async (c, next) => {
    c.set('storage', storage);
    c.set('cfg', cfg);
    await next();
  });

  app.get('/health', (c) => c.json({
    ok: true, mode: cfg.mode, engine: cfg.engine, ts: new Date().toISOString(),
  }));

  app.route('/api', api);

  // ── LINE webhook ─────────────────────────────────────────────────────
  app.post('/webhook/line', async (c) => {
    const body = await c.req.text();
    const signature = c.req.header('x-line-signature') ?? '';

    if (cfg.lineChannelSecret) {
      const valid = await verifySignature(cfg.lineChannelSecret, body, signature);
      if (!valid) return c.json({ error: 'bad signature' }, 401);
    } else {
      console.warn('[FitHer] LINE_CHANNEL_SECRET unset — signature verification skipped.');
    }

    const payload = JSON.parse(body) as { events?: LineEvent[] };
    for (const event of payload.events ?? []) {
      try {
        const messages = await routeLineEvent(storage, cfg, event, webUrl);
        if (event.replyToken && messages.length) {
          await replyToLine(cfg, event.replyToken, messages);
        }
      } catch (e) {
        console.error('[FitHer] webhook event failed:', e);
      }
    }
    return c.json({ ok: true });
  });

  /**
   * Local simulator: drives the exact same router as the real webhook and
   * returns the messages instead of sending them. This is what makes the
   * whole LINE path testable with no OA credentials.
   */
  app.post('/sim/line', async (c) => {
    const event = await c.req.json<LineEvent>();
    const messages = await routeLineEvent(storage, cfg, event, webUrl);
    return c.json({ messages });
  });

  return app;
}
