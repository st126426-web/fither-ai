/**
 * One live run against the Claude Agent SDK on subscription auth, to prove the
 * local demo path works end to end. Costs one short agent turn.
 *
 *   npm run -w server verify:agent
 */
import { loadConfig } from '../src/config.ts';
import { runCoach } from '../src/engine/index.ts';
import { seedDatabase } from '../src/lib/bootstrap.ts';
import { MIND } from '../src/lib/seed.ts';
import { SqliteStorage } from '../src/storage/sqlite.ts';

if (process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is set — unset it so subscription auth is used.');
  process.exit(1);
}

const cfg = loadConfig({ ...process.env, FITHER_MODE: 'local', COACH_ENGINE: 'agent-sdk' });
const storage = new SqliteStorage('./data/fither-agent.db');
await seedDatabase(storage, { includeUser: true, fresh: true });

console.log('Running one onboard through AgentSdkEngine…\n');
const t0 = Date.now();

const result = await runCoach(storage, cfg, {
  user_id: MIND.id,
  intent: 'onboard',
  source: 'script',
  locale: 'th',
  payload: {
    goal: 'strength', days_per_week: 3, session_minutes: 45,
    equipment: MIND.equipment, experience: 'beginner', life_stage: 'none',
  },
});

console.log(`status        ${result.status}`);
console.log(`engine        ${result.trace.engine}`);
console.log(`tool calls    ${result.trace.tool_calls.map((t) => t.name).join(' → ') || '(none)'}`);
console.log(`validator     ${result.trace.validator_runs.map((v) => `#${v.attempt}:${v.passed ? 'pass' : v.codes.join('/')}`).join(' ') || '(none)'}`);
console.log(`fallback      ${result.trace.fallback_used}`);
console.log(`tokens        in=${result.trace.usage.input_tokens} out=${result.trace.usage.output_tokens} (${Date.now() - t0}ms)`);

if (result.artifacts.plan) {
  const p = result.artifacts.plan;
  console.log(`\nplan saved    week ${p.week_number}, ${p.volume_total_sets} total sets`);
  console.log(`why (th)      ${p.why_th}`);
} else {
  console.log('\nNO PLAN SAVED');
}
console.log(`\nreply         ${result.reply.text_th}`);

// --- optional second beat: the missed week, the demo's proof moment ------
if (process.argv.includes('--replan')) {
  const { nowIso, parseJson, uid } = await import('../src/lib/util.ts');
  const { findGuiltWords, totalSets } = await import('../src/safety/validator.ts');

  const active = (await storage.getActivePlan(MIND.id))!;
  const activePlan = parseJson(active.plan_json, { week_number: 1, sessions: [] as never[] });
  const before = totalSets(activePlan as never);

  await storage.insertCheckin({
    id: uid('chk'),
    user_id: MIND.id,
    week_number: active.week_number,
    completion_json: JSON.stringify(
      (activePlan as { sessions: { day: string }[] }).sessions.map((s) => ({ day: s.day, state: 'skipped' })),
    ),
    rpe_avg: null, sleep_1to5: null, energy_1to5: null,
    notes: 'สัปดาห์ที่แล้วงานยุ่งมาก ต้องไปทำงานต่างจังหวัดค่ะ',
    flags_json: '[]',
    created_at: nowIso(),
  });

  console.log('\n--- fully missed week -> re-plan ---\n');
  const r2 = await runCoach(storage, cfg, {
    user_id: MIND.id,
    intent: 'weekly_replan',
    source: 'script',
    locale: 'th',
    payload: {
      week_number: active.week_number,
      sessions: [],
      notes: 'สัปดาห์ที่แล้วงานยุ่งมาก ไม่ได้ทำเลยค่ะ',
    },
  });

  const after = r2.artifacts.plan?.volume_total_sets ?? 0;
  const drop = before ? Math.round(((after - before) / before) * 1000) / 10 : 0;
  const guilt = findGuiltWords(`${r2.artifacts.plan?.why_th ?? ''} ${r2.reply.text_th}`);

  console.log(`validator     ${r2.trace.validator_runs.map((v) => `#${v.attempt}:${v.passed ? 'pass' : v.codes.join('/')}`).join(' ')}`);
  console.log(`fallback      ${r2.trace.fallback_used}`);
  console.log(`volume        ${before} -> ${after} sets  (${drop}%)`);
  console.log(`>= 20% drop   ${drop <= -20 ? 'YES ✓' : 'NO ✗'}`);
  console.log(`guilt words   ${guilt.length ? `${guilt.join(', ')} ✗` : 'none ✓'}`);
  console.log(`why (th)      ${r2.artifacts.plan?.why_th}`);
  console.log(`\nreply         ${r2.reply.text_th}`);
}
