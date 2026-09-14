import { loadConfig } from '../src/config.ts';
import { seedDatabase } from '../src/lib/bootstrap.ts';
import { MIND } from '../src/lib/seed.ts';
import { SqliteStorage } from '../src/storage/sqlite.ts';

/**
 * Wipes Mind and re-seeds, so the demo can be rerun instantly.
 *
 * Pass --onboarding to leave her user row out entirely, which returns the
 * app and the bot to the very first screen of the story.
 */
const onboarding = process.argv.includes('--onboarding');

const cfg = loadConfig(process.env);
const storage = new SqliteStorage(cfg.sqlitePath);
await seedDatabase(storage, { includeUser: !onboarding, fresh: true });

console.log(
  `[FitHer] reset ${MIND.id} in ${cfg.sqlitePath}`
  + (onboarding ? ' — back to the onboarding state.' : ' — profile re-seeded, no plans.'),
);
