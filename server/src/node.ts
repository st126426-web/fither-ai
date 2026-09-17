import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { assertLocalAuthSanity, loadConfig } from './config.ts';
import { createApp } from './index.ts';
import { registerNodeEngines } from './engine/node-engines.ts';
import { seedDatabase } from './lib/bootstrap.ts';
import { MIND } from './lib/seed.ts';
import { SqliteStorage } from './storage/sqlite.ts';

const cfg = loadConfig(process.env);
assertLocalAuthSanity(cfg);

// Node is the only runtime that can host the Agent SDK, so it is wired in here
// rather than in shared code — see registerNodeEngines.
registerNodeEngines();

// Seed Mind only into a database that does not exist yet.
//
// This used to run unconditionally, which quietly undid `demo:reset
// --onboarding`: the reset removes her user row, the next boot put it straight
// back, and the demo opened on a finished plan instead of the first question.
// `tsx watch` restarts on every file save, so it could also happen in the
// middle of preparing. A database that already exists is somebody's state —
// the boot sequence has no business overwriting it.
const firstRun = !existsSync(cfg.sqlitePath);
const storage = new SqliteStorage(cfg.sqlitePath);
await seedDatabase(storage, { includeUser: firstRun });

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

// Which state the demo will actually open in. Reading this off the screen
// beats discovering it from the first reply in front of an audience.
const mind = await storage.getUser(MIND.id);
const activePlan = mind ? await storage.getActivePlan(MIND.id) : null;
const demoState = !mind
  ? 'onboarding — she will be asked the first question'
  : activePlan
    ? `already onboarded, week ${activePlan.week_number} plan active`
    : 'profile set, no plan yet';

console.log(
  `\n  FitHer AI — mode=${cfg.mode} engine=${cfg.engine} storage=sqlite(${cfg.sqlitePath})\n`
  + `  Demo state ${demoState}\n`
  + (mind ? '             reset with: npm run demo:reset -- --onboarding\n' : '')
  + `  API        http://localhost:${cfg.port}\n`
  + `  Webhook    http://localhost:${cfg.port}/webhook/line\n`
  + `  Simulator  npm run -w server sim\n`
  + (hasWeb
    ? `  Web app    http://localhost:${cfg.port}/#/u/mind\n`
    : '  Web app    not built yet — run: npm run -w web build\n'),
);

serve({ fetch: app.fetch, port: cfg.port });
