import type { Plan } from '../engine/types.ts';
import type {
  CheckinRow, ConversationRow, EventRow, PartnerFilters, PartnerRow,
  PlanRow, Storage, UsageRow, UserRow,
} from './types.ts';

type Params = (string | number | null)[];

/**
 * All query logic lives here so SqliteStorage and D1Storage only have to
 * provide three primitives. Guarantees the two modes cannot drift.
 */
export abstract class BaseStorage implements Storage {
  protected abstract all<T>(sql: string, params?: Params): Promise<T[]>;
  protected abstract run(sql: string, params?: Params): Promise<void>;
  abstract init(): Promise<void>;

  protected async one<T>(sql: string, params?: Params): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows.length ? rows[0] : null;
  }

  /**
   * Columns added after a database already exists. `CREATE TABLE IF NOT
   * EXISTS` silently skips an existing table, so a new column in schema.sql
   * never reaches it — these ALTERs do.
   *
   * Each is idempotent: re-running one that has already been applied raises
   * "duplicate column", which is swallowed. Anything else is a real error.
   */
  protected async applyMigrations(): Promise<void> {
    const migrations = [
      'ALTER TABLE partners ADD COLUMN note_en TEXT',
      'ALTER TABLE users ADD COLUMN coach_tone TEXT',
      'ALTER TABLE users ADD COLUMN tone_note TEXT',
      'ALTER TABLE users ADD COLUMN motivation TEXT',
      'ALTER TABLE users ADD COLUMN target_weeks INTEGER',
      'ALTER TABLE users ADD COLUMN target_event TEXT',
      'ALTER TABLE users ADD COLUMN age INTEGER',
      'ALTER TABLE users ADD COLUMN height_cm REAL',
      'ALTER TABLE users ADD COLUMN weight_kg REAL',
      'ALTER TABLE users ADD COLUMN injuries TEXT',
      'ALTER TABLE users ADD COLUMN sleep_hours REAL',
      'ALTER TABLE users ADD COLUMN activity_level TEXT',
      'ALTER TABLE users ADD COLUMN train_time TEXT',
      'ALTER TABLE users ADD COLUMN dislikes TEXT',
    ];
    for (const sql of migrations) {
      try {
        await this.run(sql);
      } catch (e) {
        const msg = String((e as Error)?.message ?? e).toLowerCase();
        if (!msg.includes('duplicate column')) throw e;
      }
    }
  }

  // --- users ---------------------------------------------------------
  getUser(userId: string) {
    return this.one<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
  }

  getUserByLineId(lineUserId: string) {
    return this.one<UserRow>('SELECT * FROM users WHERE line_user_id = ?', [lineUserId]);
  }

  async upsertUser(u: UserRow) {
    await this.run(
      `INSERT INTO users (id, display_name, line_user_id, goal, days_per_week, session_minutes,
                          equipment_json, experience, life_stage, language,
                          coach_tone, tone_note, motivation,
                          target_weeks, target_event, age, height_cm, weight_kg,
                          injuries, sleep_hours, activity_level, train_time, dislikes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         display_name=excluded.display_name, line_user_id=excluded.line_user_id,
         goal=excluded.goal, days_per_week=excluded.days_per_week,
         session_minutes=excluded.session_minutes, equipment_json=excluded.equipment_json,
         experience=excluded.experience, life_stage=excluded.life_stage,
         language=excluded.language, coach_tone=excluded.coach_tone,
         tone_note=excluded.tone_note, motivation=excluded.motivation,
         target_weeks=excluded.target_weeks, target_event=excluded.target_event,
         age=excluded.age, height_cm=excluded.height_cm, weight_kg=excluded.weight_kg,
         injuries=excluded.injuries, sleep_hours=excluded.sleep_hours,
         activity_level=excluded.activity_level, train_time=excluded.train_time,
         dislikes=excluded.dislikes`,
      [u.id, u.display_name, u.line_user_id, u.goal, u.days_per_week, u.session_minutes,
        u.equipment_json, u.experience, u.life_stage, u.language,
        u.coach_tone, u.tone_note, u.motivation,
        u.target_weeks, u.target_event, u.age, u.height_cm, u.weight_kg,
        u.injuries, u.sleep_hours, u.activity_level, u.train_time, u.dislikes, u.created_at],
    );
  }

  async updateUserProfile(userId: string, patch: Partial<UserRow>) {
    const allowed = [
      'display_name', 'goal', 'days_per_week', 'session_minutes',
      'equipment_json', 'experience', 'life_stage', 'language',
      'coach_tone', 'tone_note', 'motivation',
      'target_weeks', 'target_event', 'age', 'height_cm', 'weight_kg',
      'injuries', 'sleep_hours', 'activity_level', 'train_time', 'dislikes',
    ] as const;
    const keys = allowed.filter((k) => patch[k] !== undefined);
    if (keys.length) {
      await this.run(
        `UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((k) => patch[k] as string | number | null), userId],
      );
    }
    return this.getUser(userId);
  }

  // --- plans ---------------------------------------------------------
  async insertPlan(r: PlanRow) {
    await this.run(
      `INSERT INTO plans (id, user_id, week_number, status, plan_json, why_text_th, why_text_en, engine, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [r.id, r.user_id, r.week_number, r.status, r.plan_json, r.why_text_th, r.why_text_en, r.engine, r.created_at],
    );
  }

  getPlan(planId: string) {
    return this.one<PlanRow>('SELECT * FROM plans WHERE id = ?', [planId]);
  }

  getActivePlan(userId: string) {
    return this.one<PlanRow>(
      `SELECT * FROM plans WHERE user_id = ? AND status = 'active'
       ORDER BY week_number DESC, created_at DESC LIMIT 1`,
      [userId],
    );
  }

  listPlans(userId: string, limit = 20) {
    return this.all<PlanRow>(
      'SELECT * FROM plans WHERE user_id = ? ORDER BY week_number DESC, created_at DESC LIMIT ?',
      [userId, limit],
    );
  }

  async supersedePlans(userId: string, weekNumber?: number) {
    if (weekNumber === undefined) {
      await this.run(`UPDATE plans SET status='superseded' WHERE user_id=? AND status='active'`, [userId]);
    } else {
      await this.run(
        `UPDATE plans SET status='superseded' WHERE user_id=? AND status='active' AND week_number=?`,
        [userId, weekNumber],
      );
    }
  }

  async updatePlanJson(planId: string, plan: Plan) {
    await this.run('UPDATE plans SET plan_json = ? WHERE id = ?', [JSON.stringify(plan), planId]);
  }

  // --- checkins ------------------------------------------------------
  async insertCheckin(r: CheckinRow) {
    await this.run(
      `INSERT INTO checkins (id, user_id, week_number, completion_json, rpe_avg, sleep_1to5, energy_1to5, notes, flags_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.user_id, r.week_number, r.completion_json, r.rpe_avg, r.sleep_1to5,
        r.energy_1to5, r.notes, r.flags_json, r.created_at],
    );
  }

  listCheckins(userId: string, limit = 8) {
    return this.all<CheckinRow>(
      'SELECT * FROM checkins WHERE user_id = ? ORDER BY week_number DESC, created_at DESC LIMIT ?',
      [userId, limit],
    );
  }

  // --- partners ------------------------------------------------------
  async searchPartners(f: PartnerFilters) {
    const where: string[] = [];
    const params: Params = [];
    if (f.beginner_friendly_only) where.push('beginner_friendly = 1');
    if (f.area) { where.push('LOWER(area) = LOWER(?)'); params.push(f.area); }
    if (f.price_tier_max !== undefined) { where.push('price_tier <= ?'); params.push(f.price_tier_max); }
    const sql = `SELECT * FROM partners ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY beginner_friendly DESC, price_tier ASC LIMIT ?`;
    params.push(f.limit ?? 5);
    const rows = await this.all<PartnerRow>(sql, params);
    if (!f.tags?.length) return rows;
    // Tag filtering in JS: tags live in a JSON column and D1 has no JSON ops we can rely on.
    const wanted = f.tags.map((t) => t.toLowerCase());
    const scored = rows.map((r) => {
      const tags: string[] = JSON.parse(r.tags_json || '[]');
      return { r, hits: tags.filter((t) => wanted.includes(t.toLowerCase())).length };
    });
    const anyHit = scored.some((s) => s.hits > 0);
    return (anyHit ? scored.filter((s) => s.hits > 0) : scored)
      .sort((a, b) => b.hits - a.hits)
      .map((s) => s.r);
  }

  async replacePartners(rows: PartnerRow[]) {
    await this.run('DELETE FROM partners');
    for (const p of rows) {
      await this.run(
        `INSERT INTO partners (id, name, area, price_tier, beginner_friendly, tags_json, lat, lng, note, note_en)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.name, p.area, p.price_tier, p.beginner_friendly, p.tags_json, p.lat, p.lng, p.note, p.note_en],
      );
    }
  }

  async countPartners() {
    const r = await this.one<{ c: number }>('SELECT COUNT(*) AS c FROM partners');
    return r?.c ?? 0;
  }

  // --- events --------------------------------------------------------
  async insertEvent(r: EventRow) {
    await this.run(
      'INSERT INTO events (id, user_id, type, payload_json, created_at) VALUES (?,?,?,?,?)',
      [r.id, r.user_id, r.type, r.payload_json, r.created_at],
    );
  }

  listEvents(userId: string, limit = 50) {
    // rowid breaks ties: several events can land in the same millisecond and
    // the journey timeline has to stay in the order things actually happened.
    return this.all<EventRow>(
      'SELECT * FROM events WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
      [userId, limit],
    );
  }

  // --- usage ---------------------------------------------------------
  async insertUsage(r: UsageRow) {
    await this.run(
      'INSERT INTO usage (id, engine, input_tokens, output_tokens, created_at) VALUES (?,?,?,?,?)',
      [r.id, r.engine, r.input_tokens, r.output_tokens, r.created_at],
    );
  }

  usageTotals() {
    return this.all<{ engine: string; calls: number; input_tokens: number; output_tokens: number }>(
      `SELECT engine, COUNT(*) AS calls,
              COALESCE(SUM(input_tokens),0)  AS input_tokens,
              COALESCE(SUM(output_tokens),0) AS output_tokens
       FROM usage GROUP BY engine`,
    );
  }

  async countApiCallsToday() {
    const day = new Date().toISOString().slice(0, 10);
    const r = await this.one<{ c: number }>(
      `SELECT COUNT(*) AS c FROM usage WHERE engine = 'api' AND created_at >= ?`,
      [`${day}T00:00:00.000Z`],
    );
    return r?.c ?? 0;
  }

  // --- conversation state --------------------------------------------
  getConversation(userId: string) {
    return this.one<ConversationRow>('SELECT * FROM conversations WHERE user_id = ?', [userId]);
  }

  async setConversation(r: ConversationRow) {
    await this.run(
      `INSERT INTO conversations (user_id, step, draft_json, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET step=excluded.step, draft_json=excluded.draft_json, updated_at=excluded.updated_at`,
      [r.user_id, r.step, r.draft_json, r.updated_at],
    );
  }

  async clearConversation(userId: string) {
    await this.run('DELETE FROM conversations WHERE user_id = ?', [userId]);
  }

  // --- reset ---------------------------------------------------------
  async wipeUser(userId: string) {
    for (const t of ['plans', 'checkins', 'events', 'conversations']) {
      await this.run(`DELETE FROM ${t} WHERE user_id = ?`, [userId]);
    }
    await this.run('DELETE FROM users WHERE id = ?', [userId]);
  }
}
