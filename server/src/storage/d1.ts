import { BaseStorage } from './base.ts';

/**
 * Minimal structural type for a D1 binding so this file compiles without
 * pulling in @cloudflare/workers-types in the Node build.
 */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
    all<T = unknown>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
  };
  exec(sql: string): Promise<unknown>;
}

/** Hosted storage: Cloudflare D1. Same SQL, same base class. */
export class D1Storage extends BaseStorage {
  constructor(private db: D1Like) {
    super();
  }

  /**
   * Schema is applied out-of-band with `npm run -w server d1:init`
   * (wrangler d1 execute --file=src/storage/schema.sql). Workers cannot read
   * the file at runtime, and running DDL on every request is wasteful.
   *
   * Migrations are cheap and idempotent, so they run here to cover a D1
   * database created before a column was added.
   */
  async init() {
    await this.applyMigrations();
  }

  protected async all<T>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const res = params.length ? await stmt.bind(...params).all<T>() : await stmt.all<T>();
    return res.results ?? [];
  }

  protected async run(sql: string, params: (string | number | null)[] = []): Promise<void> {
    const stmt = this.db.prepare(sql);
    if (params.length) await stmt.bind(...params).run();
    else await stmt.run();
  }
}
