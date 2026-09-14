/**
 * Agentic onboarding walkthrough — she types sentences, the agent extracts,
 * asks the next thing, and plans when it has enough.
 *
 *   npm run -w server sim:onboard            # mock engine, zero tokens
 *   COACH_ENGINE=agent-sdk npm run -w server sim:onboard
 */
import { loadConfig } from '../src/config.ts';
import { routeChat } from '../src/conversation/router.ts';
import { seedDatabase } from '../src/lib/bootstrap.ts';
import { MIND } from '../src/lib/seed.ts';
import { missingFields } from '../src/tools/profile.ts';
import { SqliteStorage } from '../src/storage/sqlite.ts';

const cfg = loadConfig({ ...process.env, COACH_ENGINE: process.env.COACH_ENGINE ?? 'mock' });
const storage = new SqliteStorage(process.env.SQLITE_PATH || './data/fither-onboard.db');
await seedDatabase(storage, { includeUser: false, fresh: true });

const SHE_SAYS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'อยากแข็งแรงขึ้นค่ะ อุ้มลูกแล้วปวดหลังตลอด',
  'ว่างแค่เสาร์อาทิตย์ ครั้งละชั่วโมง',
  'ที่คอนโดมีดัมเบลกับลู่วิ่งค่ะ',
  'ไม่เคยเล่นเวทเลยค่ะ กลัวทำผิดท่า',
  'อยากให้พูดกับเราอ่อนโยนหน่อย ไม่ต้องกดดันนะคะ',
];

const say = async (text?: string) => {
  const msgs = await routeChat(storage, cfg, {
    type: text ? 'text' : 'follow', source: 'web', external_id: 'sim', text,
  });
  if (text) console.log(`\n  🙋 ${text}`);
  for (const m of msgs) {
    console.log(`  🤖 ${m.text_th.replace(/\n/g, '\n     ')}`);
    if (m.card) console.log(`     [card: ${m.card.kind}]`);
  }
  const user = await storage.getUser(MIND.id);
  console.log(`     ↳ still missing: ${missingFields(user).join(', ') || '(nothing)'}`);
};

console.log('━'.repeat(66));
console.log('  AGENTIC ONBOARDING — she types, the agent decides what to ask');
console.log('━'.repeat(66));

await say();
for (const line of SHE_SAYS) await say(line);

const user = await storage.getUser(MIND.id);
const plan = await storage.getActivePlan(MIND.id);
console.log('\n' + '━'.repeat(66));
console.log('  PROFILE THE AGENT BUILT');
console.log('━'.repeat(66));
console.log(`  goal            ${user?.goal}`);
console.log(`  days / minutes  ${user?.days_per_week} × ${user?.session_minutes} min`);
console.log(`  equipment       ${user?.equipment_json}`);
console.log(`  experience      ${user?.experience}`);
console.log(`  coach_tone      ${user?.coach_tone}`);
console.log(`  motivation      ${user?.motivation ?? '(not captured)'}`);
console.log(`  plan            ${plan ? `week ${plan.week_number}, ${JSON.parse(plan.plan_json).sessions.length} sessions` : 'NONE'}`);
console.log('');
