/**
 * LINE simulator — drives the exact webhook router with no OA credentials.
 *
 * Runs the full four-beat story end to end and prints what LINE would show,
 * so the whole conversation path is testable before a channel exists.
 *
 *   npm run -w server sim              # full story
 *   npm run -w server sim -- --redflag # the safety beat
 */
import { loadConfig } from '../src/config.ts';
import { registerNodeEngines } from '../src/engine/node-engines.ts';
import { runCoach } from '../src/engine/index.ts';
import { seedDatabase } from '../src/lib/bootstrap.ts';
import { MIND } from '../src/lib/seed.ts';
import { routeLineEvent, type LineEvent } from '../src/line/webhook.ts';
import { SqliteStorage } from '../src/storage/sqlite.ts';
import { parseJson } from '../src/lib/util.ts';
import type { Plan } from '../src/engine/types.ts';

// Without this, COACH_ENGINE=agent-sdk would silently run MockEngine.
registerNodeEngines();
const cfg = loadConfig({ ...process.env, COACH_ENGINE: process.env.COACH_ENGINE ?? 'mock' });
const storage = new SqliteStorage(process.env.SQLITE_PATH || './data/fither-sim.db');
await seedDatabase(storage, { includeUser: false, fresh: true });

const WEB = 'http://localhost:8787/app/';
const redflagOnly = process.argv.includes('--redflag');

function banner(n: string) {
  console.log(`\n${'━'.repeat(64)}\n  ${n}\n${'━'.repeat(64)}`);
}

function render(messages: Record<string, unknown>[]) {
  for (const m of messages) {
    if (m.type === 'text') {
      console.log(`\n  💬 ${String(m.text).replace(/\n/g, '\n     ')}`);
      const qr = (m.quickReply as { items?: { action: { label: string } }[] } | undefined)?.items;
      if (qr?.length) console.log(`     [ ${qr.map((i) => i.action.label).join(' | ')} ]`);
    } else if (m.type === 'flex') {
      console.log(`\n  🧾 FLEX: ${m.altText}`);
    }
  }
}

async function send(event: LineEvent, title: string) {
  banner(title);
  render(await routeLineEvent(storage, cfg, event, WEB));
}

const follow: LineEvent = { type: 'follow', source: { userId: 'sim-user' }, replyToken: 'r' };
const postback = (data: string): LineEvent => ({
  type: 'postback', source: { userId: 'sim-user' }, replyToken: 'r', postback: { data },
});
const text = (t: string): LineEvent => ({
  type: 'message', source: { userId: 'sim-user' }, replyToken: 'r', message: { type: 'text', text: t },
});

if (redflagOnly) {
  // Beat 5: a red flag must block plan generation with zero engine calls.
  await seedDatabase(storage, { includeUser: true, fresh: true });
  banner('BEAT 5 — check-in note contains "เจ็บเข่า"');
  const result = await runCoach(storage, cfg, {
    user_id: MIND.id, intent: 'weekly_replan', source: 'script', locale: 'th',
    payload: { week_number: 1, sessions: [], notes: 'สัปดาห์นี้เจ็บเข่าตอนลงบันไดค่ะ' },
  });
  console.log(`\n  status      ${result.status}`);
  console.log(`  flags       ${result.artifacts.flags?.map((f) => f.code).join(', ')}`);
  console.log(`  plan saved  ${result.artifacts.plan ? 'YES (BUG)' : 'no'}`);
  console.log(`  tokens      in=${result.trace.usage.input_tokens} out=${result.trace.usage.output_tokens}`);
  console.log(`\n  💬 ${result.reply.text_th}`);
  process.exit(0);
}

// ── Beat 1: onboarding (agentic — she types, the agent asks) ─────────────
await send(follow, 'BEAT 1 — Mind adds the OA');
for (const line of [
  'อยากแข็งแรงขึ้นค่ะ อุ้มลูกแล้วปวดหลังตลอด',
  'ว่างสัปดาห์ละ 3 วันค่ะ ครั้งละ 45 นาที',
  'ที่คอนโดมีดัมเบลกับลู่วิ่งค่ะ',
  'ไม่เคยเล่นเวทมาก่อนเลยค่ะ',
  'อยากให้พูดกับเราอ่อนโยนหน่อย ไม่ต้องกดดันนะคะ',
]) {
  await send(text(line), `SHE TYPES — ${line}`);
}

const week1 = await storage.getActivePlan(MIND.id);
const p1 = parseJson<Plan | null>(week1?.plan_json, null);
const v1 = p1!.sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets, 0), 0);
console.log(`
  ▸ Week 1 saved: ${p1!.sessions.length} sessions, ${v1} total sets`);

// ── Beat 3: missed week ──────────────────────────────────────────────────
await send(text('เช็คอิน'), 'BEAT 3a — Mind opens the check-in');
await send(postback('action=checkin_all&state=skipped'), 'BEAT 3b — "สัปดาห์นี้ไม่ได้ทำเลย" → RE-PLAN');

const week2 = await storage.getActivePlan(MIND.id);
const p2 = parseJson<Plan | null>(week2?.plan_json, null);
const v2 = p2!.sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets, 0), 0);
const drop = Math.round(((v2 - v1) / v1) * 1000) / 10;
console.log(`\n  ▸ Week ${week2!.week_number}: ${v2} total sets  (${drop}% vs week 1)`);
console.log(`  ▸ why: ${week2!.why_text_th}`);
console.log(`  ▸ volume reduced >= 20%?  ${drop <= -20 ? 'YES ✓' : 'NO ✗'}`);

// ── Beat 4: gym discovery ────────────────────────────────────────────────
await send(text('อยากลองไปยิมแล้วค่ะ ที่บ้านเริ่มเบาไป'), 'BEAT 4 — ready for a gym');

// ── Rich-menu mock cells ────────────────────────────────────────────────
await send(postback('action=meals'), 'RICH MENU — มื้ออาหาร (mock, zero engine calls)');
await send(postback('action=coach'), 'RICH MENU — โค้ช (mock, zero engine calls)');

// ── Cost transparency ────────────────────────────────────────────────────
banner('GET /api/usage');
const totals = await storage.usageTotals();
console.table(totals);
console.log('');
