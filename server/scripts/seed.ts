import { loadConfig } from '../src/config.ts';
import { seedDatabase } from '../src/lib/bootstrap.ts';
import { SqliteStorage } from '../src/storage/sqlite.ts';

const cfg = loadConfig(process.env);
const storage = new SqliteStorage(cfg.sqlitePath);
await seedDatabase(storage, { includeUser: true });
console.log(`[FitHer] seeded ${cfg.sqlitePath}: partners + Mind's profile.`);
