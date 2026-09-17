import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { assertLocalAuthSanity, loadConfig } from './config.ts';
import { createApp } from './index.ts';
import { registerNodeEngines } from './engine/node-engines.ts';
import { seedDatabase } from './lib/bootstrap.ts';
import { SqliteStorage } from './storage/sqlite.ts';

const cfg = loadConfig(process.env);
assertLocalAuthSanity(cfg);

// Node is the only runtime that can host the Agent SDK, so it is wired in here
// rather than in shared code — see registerNodeEngines.
registerNodeEngines();

const storage = new SqliteStorage(cfg.sqlitePath);
await seedDatabase(storage, { includeUser: true });

const webUrl = process.env.WEB_URL || `http://localhost:${cfg.port}/`;
const app = createApp({ storage, cfg, webUrl });

// Serve the built web app locally too, so the laptop demo needs one process.
// Paths are relative to cwd, which is server/ when run through npm workspaces.
//
// It is served at the ROOT, not under /app/, because a default `vite build`
// emits root-absolute asset URLs ("/assets/…"). Mounting it on a sub-path
// without rebuilding with a matching BASE_PATH 404s every asset and gives you
// a blank page. Only these two routes are static, so nothing shadows the API.
const dist = '../web/dist';
const hasWeb = existsSync(dist);
if (hasWeb) {
  app.use('/assets/*', serveStatic({ root: dist }));
  app.get('/', serveStatic({ root: dist, path: 'index.html' }));
  app.get('/app', (c) => c.redirect('/'));
  app.get('/app/', (c) => c.redirect('/'));
}

console.log(
  `\n  FitHer AI — mode=${cfg.mode} engine=${cfg.engine} storage=sqlite(${cfg.sqlitePath})\n`
  + `  API        http://localhost:${cfg.port}\n`
  + `  Webhook    http://localhost:${cfg.port}/webhook/line\n`
  + `  Simulator  npm run -w server sim\n`
  + (hasWeb
    ? `  Web app    http://localhost:${cfg.port}/#/u/mind\n`
    : '  Web app    not built yet — run: npm run -w web build\n'),
);

serve({ fetch: app.fetch, port: cfg.port });
