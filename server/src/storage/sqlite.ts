import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaseStorage } from './base.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Local live-demo storage: a single SQLite file. */
export class SqliteStorage extends BaseStorage {
  private db: Database.Database;

  constructor(path = process.env.SQLITE_PATH || './data/fither.db') {
    super();
    const full = resolve(process.cwd(), path);
    const dir = dirname(full);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(full);
    this.db.pragma('journal_mode = WAL');
  }

  async init() {
    const sql = readFileSync(resolve(here, 'schema.sql'), 'utf8');
    this.db.exec(sql);
    await this.applyMigrations();
  }

  protected async all<T>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  protected async run(sql: string, params: (string | number | null)[] = []): Promise<void> {
    this.db.prepare(sql).run(...params);
  }
}
