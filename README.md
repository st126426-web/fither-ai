# FitHer AI — prototype

Adaptive AI workout coach + beginner-vetted gym discovery for Thai women.
LINE bot + companion web app. One working spine, full-product surface.

**The functional path is Mind's journey only:** onboarding → Week-1 plan →
missed-week re-plan → gym recommendation, plus a red-flag safety handoff.
Meals, coaches, communities, events, challenges and body stats are polished
static mocks driven by seeded JSON.

---

## Laptop demo — 8 commands

```bash
npm install                                    # 1
npm run -w web build                           # 2  web is served from the server root
npm run demo:reset -- --onboarding             # 3  wipe Mind, back to step zero
npm run dev:local                              # 4  http://localhost:8787
cloudflared tunnel --url http://localhost:8787 # 5  in a second terminal
# 6. paste <tunnel-url>/webhook/line into the LINE console webhook field
npm run -w server richmenu -- ./richmenu.png   # 7  once per channel
# 8. scan the OA QR and run the story
```

The web app is served at the **root**: <http://localhost:8787/> is the public
landing page, <http://localhost:8787/#/u/mind> is the app itself. Steps 5–7 are
only needed for the real LINE bot — everything else runs without it.

Rehearse in mock mode (zero tokens), run live on subscription auth:

```bash
COACH_ENGINE=mock npm run dev:local     # rehearsal — no LLM calls at all
npm run dev:local                       # live — Claude Agent SDK, subscription auth
```

**No LINE credentials yet?** The simulator drives the identical webhook router
and prints what LINE would show:

```bash
npm run sim              # the full four-beat story
npm run sim -- --redflag # the safety handoff beat
```

To prove the live subscription path works (this one spends real agent turns):

```bash
npm run -w server verify:agent            # one onboard, end to end
npm run -w server verify:agent -- --replan # plus the missed-week re-plan
```

---

## Verified behaviour

All five story beats pass in mock mode (zero tokens) **and** on live
subscription auth:

| Beat | Result |
|---|---|
| 1–2 Onboard → Week 1 | Live agent runs the conversation itself from typed answers → validated plan, first try |
| 3 Missed week | 27 → 21 sets (**−22.2%**), zero guilt words, warm Thai why-line |
| 4 Gym | Live agent: `search_partners` → vetted Ladprao venue, no fallback. Emptying `partners` → `maps_fallback` labelled `vetted:false` |
| 5 Red flag | `เจ็บเข่า` → **no plan generated**, human handoff, flag logged, **0 tokens** |

Also checked end to end:

- Session Done/Skip and the schedule day-swap persist across reload.
- Profile edit 45→30 min + removing dumbbells → the next generated plan has no
  session over 30 min and no dumbbell exercise (validator-enforced).
- Plan history shows the Week-2 re-plan with visibly lower volume.
- `GET /api/usage` reports per-engine token totals.
- The Pages build emits `/fither-ai/`-prefixed asset URLs.
- Mock seed data is **inlined into the JS bundle** — the mock sections make no
  network calls at all, and the only `fetch` in the bundle is the API client.
- `npm test` — 74 cases.

## What the live run found

The first real Agent SDK run failed badly: **four `save_plan` attempts, every
model attempt rejected, the template fallback shipped the plan.** Three causes,
all defects in this codebase rather than in the model:

1. **Misleading error codes.** A *missing* `reps` field was reported as
   `REPS_OUT_OF_RANGE`, so the fix hint said "use 3–20 reps" when the real
   problem was an absent field — sending the model after the wrong thing and
   burning a retry.
2. **No coercion of harmless slips.** The plan arrived as a JSON string, and
   with `day` as `"Monday"`. Both are trivially normalisable; both were hard
   failures.
3. **The load-note rule policed formatting, not safety.** It rejected
   `"10 นาที ชัน 3%"` — a perfectly gradual note — because the allowlist only
   matched single forms.

Fixes: range codes now fire only on genuine range violations; `coercePlan`
normalises JSON-strings, day aliases and missing load notes (but deliberately
**not** a numeric `day`, which is ambiguous — that still fails loudly); the
load-note rule accepts composed notes and denies jump phrases; and the system
prompt carries a worked `PLAN_FORMAT` example.

**Result: 4 attempts → 1, passing first try.** Output tokens 3,977 → 1,645
(−59%), wall clock 44s → 24s, no fallback. The missed-week beat still takes one
legitimate rejection (`VOLUME_NOT_REDUCED_AFTER_MISSED_WEEK`) and then
self-corrects — that is the validator visibly doing its job, and it demos well.

A later live run of the **gym beat** exposed a fourth: the agent searched
`area: "ลาดพร้าว"` while the partners table stores `"Ladprao"`, so the exact
match found nothing and it fell through to an *unvetted* maps result — even
though a vetted Ladprao gym exists. The agent followed the protocol correctly
(search first, fall back only on zero results, label it clearly); the data
layer was at fault. `normaliseArea()` now maps Thai district names to the
canonical English one and tolerates "แถวลาดพร้าว", and a zero-result area
search widens to any vetted partner before the agent reaches for the fallback —
a vetted gym in the next district beats an unvetted stranger.
Result: 2 tool calls → 1, the correct vetted venue, and input tokens 7,880 →
3,877.

Making onboarding agentic exposed a fifth, and the most serious: her opening
line was *"อยากแข็งแรงขึ้นค่ะ อุ้มลูกแล้วปวดหลังตลอด"* — "I want to get
stronger, carrying my kid always hurts my back." The red-flag scan matched
"ปวด" and **blocked onboarding on her very first message**. A generic ache is
the single most common reason a beginner starts training at all; blocking there
made the product unusable.

The fix is a context split rather than a weakening. `rules.json` now carries
`warn_intents` per rule: a generic ache **warns** during `onboard` — logged as a
`safety_warning` event, and surfaced to the agent with instructions to
acknowledge it, avoid loading that area, and say to stop and see a professional
if it worsens — while still **blocking** at check-in, where the same words mean
she got hurt training. Injury, dizziness, pregnancy, chest symptoms and distress
block in every context, onboarding included. Nine tests pin this down.

### The one that actually broke the demo

A sixth, found by running the new onboarding: the plan step failed every single
time with `UNKNOWN_EXERCISE_ID` on IDs that plainly exist — `ex_bw_glute_bridge`,
`ex_tm_walk_incline`.

`CoachRequest.library` is built **once**, at the start of the turn, by filtering
the catalogue against her equipment. On the turn she finishes onboarding, that
snapshot was taken *before* `save_profile` recorded her equipment — so it was
**empty**. The model was handed no valid IDs, invented plausible ones, and the
validator rejected all of them against the same empty list. Three retries, then
a template fallback that also had nothing to build from. The user-visible result
was a generic "ระบบขัดข้องชั่วคราว".

Fixed in the three places that were trusting the snapshot: `save_plan` and the
template fallback now rebuild the filtered library from the user row as it is
*now*, and `get_user_state` returns `exercise_library` as the authoritative
list. The prompt tells the agent that reply wins over the snapshot, and to never
invent an ID.

Two other things fell out of the same run: `maxTurns` was wired to
`max_tool_calls` (6), but the Agent SDK spends a turn per tool round-trip, so
`save_profile → get_user_state → save_plan` plus retries ran out of turns mid-plan
— now a separate `max_turns: 20`. And the engine swallowed the failure subtype
entirely, which is why none of this was diagnosable; it now logs the subtype and
turn count, and `error_max_turns` gets an actionable message instead of a generic
apology.

Two more surfaced while testing a user who *declines* the optional questions:

- **Onboarding ended one turn too early.** The router treated a complete profile
  as "onboarded" and routed the next message to `freeform`, where the prompt
  forbids planning — so if the agent spent the final turn asking an optional
  question, the first week was never built at all. Onboarding now ends when a
  plan exists, not when the fields fill up.
- **A silent success rendered as a failure.** A run can legitimately end having
  only called a tool, leaving no final text; that empty string fell through to
  the generic error message. It now produces a short acknowledgement, and only a
  genuine failure shows an error.

Every one of those rejections is logged to `events`, so the failure modes above
are inspectable rather than invisible.

---

## Onboarding is agentic

There is no question script. When required profile fields are missing, whatever
she types goes to the agent with intent `onboard`, and the agent asks in its own
words, extracts what she volunteered, records it with `save_profile`, and reads
back what is still missing. When nothing is missing it plans.

```
her message ─► router: any required field missing? ─► agent
                                                       │  asks ONE thing, in its own words
                                                       │  save_profile { whatever she revealed }
                                                       │   ↳ { missing: [...], ready_to_plan }
                                                       ▼
                             ready_to_plan ─► get_user_state ─► save_plan ─► week 1
```

Six fields are required: `goal`, `days_per_week`, `session_minutes`,
`equipment`, `experience`, `coach_tone`.

The agent also collects, in the same conversation:

- **Coaching constraints** — `injuries` (what to work around), `dislikes` (what
  she refuses to do), `train_time`, `sleep_hours`, `activity_level`. Asked in one
  combined question framed as "so I do not give you something that hurts or that
  you will hate". These are what separate a programme from a template.
- **Timeframe** — `target_weeks` and `target_event`, asked alongside the goal
  ("any date you're working towards?"). It paces the plan against it and is
  told to be honest rather than promise a rate that is not real.
- **Age, height, weight** — asked once, together, with the reason given and an
  explicit opt-out. BMI is derived, never stored, and the prompt forbids raising
  it unprompted or commenting on her numbers. Declining is a complete answer.
- `motivation` and `tone_note` when she offers them, without being asked.

It never asks for her name and never addresses her by one.

She types sentences — one often answers several fields. From a real run:

| She typed | The agent recorded |
|---|---|
| "อยากแข็งแรงขึ้นค่ะ อุ้มลูกแล้วปวดหลังตลอด" | goal=strength, motivation in her words |
| "ว่างแค่เสาร์อาทิตย์ ครั้งละชั่วโมง" | days_per_week=2 **and** session_minutes=60 |
| "ที่คอนโดมีดัมเบลกับลู่วิ่งค่ะ" | equipment=[dumbbell, treadmill, …] |
| "ไม่เคยเล่นเวทเลยค่ะ" | experience=beginner |
| "อยากให้พูดอ่อนโยนหน่อย ไม่ต้องกดดัน" | coach_tone=gentle |

`save_profile` normalises and enum-checks everything — Thai equipment words map
to library tags, out-of-range numbers are clamped, and anything unrecognised
comes back in `ignored` so the agent knows to ask again. The model never writes
a raw value into the database.

### Language

She sets the language by writing in it. `detectLang()` checks the script of each
message, the agent is told to reply in kind, and the detected language is saved
to her profile so the app follows. An English question gets an English answer
even though the product is Thai-first — including in `MockEngine`, which writes
every reply in both languages and picks by locale.

### Tone

`coach_tone` is **gentle | balanced | firm**, chosen by her and editable in
Profile. It is injected into every turn's prompt with concrete writing
instructions (`TONE_GUIDE` in `prompts.ts`) — gentle offers an easier option and
avoids targets; firm names a specific weekly target. **No tone permits guilt**,
and the validator enforces that on the why-line regardless of tone.

The why-line is also required to reference something she actually said. In the
live run it came back as "สัปดาห์แรกเน้นเรียนรู้ท่าเสริมหลังและขา เพื่อให้อุ้มลูกได้สบายขึ้นค่ะ" —
tied directly to the reason she gave in her first message.

### Starting loads

A beginner has no idea what weight to pick, so the prompt carries a table of
sensible starting loads for an untrained woman (goblet squat 4-6 kg, shoulder
press 2-4 kg, lateral raise 1-2 kg, and so on), with instructions to go to the
lower end when she is a true beginner, sleeping badly, or has a niggle in that
area. `load_note` is required to be concrete — "4 kg ต่อข้าง", not "light".

### Quick setup for people who hate forms

Not everyone will answer nine questions one at a time. The chat offers a prompt
she can paste into whichever AI she already uses; it interviews her there and
produces one paragraph, which she pastes back. The agent extracts every field
from that single paragraph in one turn — verified live: goal, 12-week timeframe,
3×45 min, evening, equipment, beginner, right-knee history, dislikes jumping,
32/160cm/57kg, 6 h sleep, gentle tone — and the plan it produced avoided jumping
and step-ups entirely.

### Exercise guidance

Beginners need the *how*, not just the *what*. Every one of the 42 exercises
carries three setup cues and the single most common mistake, in both languages
(`seed/exercise-guide.json`, merged into the library at load), plus a video
link. Session detail renders them as a numbered how-to, a highlighted "most
common mistake", the existing form tip and the video. A test asserts all 42 have
complete guidance, so an exercise cannot be added without it.

### Free text after onboarding

Once she is onboarded, an unmatched message goes to intent `freeform`. With a
real engine that is a real answer. `MockEngine` cannot hold a conversation, but
it must not be a dead end either — hosted mode runs on it, so every hosted
visitor would hit whatever it says. It therefore answers from actual state (her
next session, her tone, her own stated reason) and covers the four things
beginners type most: *I'm tired*, *what should I do today*, *what should I eat*,
*I don't feel like it*. It never tells her to type a magic phrase.

For genuinely open conversation, run the real engine:

```bash
npm run dev:local     # agent-sdk — free text gets a real answer, costs agent turns
```

### Mock mode still works

`MockEngine` simulates the same loop with keyword extraction instead of a model:
it reads her sentences, calls `save_profile`, and asks about what is missing. A
hosted demo therefore still costs **zero tokens** and still accepts typed
answers.

---

## Where the conversation happens

**Both.** LINE and the web app are two renderers over one conversation — same
router, same conversation-state row, same safety gate. A chat can be started in
the app and finished on LINE, or the other way round, mid-flow.

| Action | LINE | Web app |
|---|---|---|
| Onboarding (agentic, free text) | ✅ | ✅ |
| Weekly check-in | ✅ | ✅ |
| Free-text conversation | ✅ | ✅ |
| Ask for a gym | ✅ | ✅ |
| Red-flag safety handoff | ✅ | ✅ |
| See the plan, sessions, history, why-line | ✅ Flex cards | ✅ |
| Mark a session done / move a day | — | ✅ |
| Edit the training profile | — | ✅ |
| Journey timeline, delete my data | — | ✅ |

In the app, chat is the 💬 button floating above the tab bar.

### How the one-spine split works

```
LINE event ─┐                          ┌─► LINE adapter ─► Flex messages
            ├─► ChatEvent ─► routeChat ┤
web chat  ──┘                (one spine)└─► /api/chat ────► JSON, rendered by React
```

- `conversation/router.ts` is the **only** conversation logic. It takes a
  normalised `ChatEvent` and returns `AgentMessage[]` — text in **both**
  languages plus typed, surface-neutral cards (`plan`, `checkin`, `venue`,
  `handoff`, `mock_list`). It knows nothing about LINE or React.
- `line/adapter.ts` renders those messages as Flex; the web app renders the
  same cards with its own components. Neither format leaks into the router, so
  a change to the flow lands on both surfaces at once.
- Conversation state lives in one `conversations` row keyed by user, which is
  what makes switching surfaces mid-onboarding work.

`POST /api/chat` is the web endpoint; `POST /sim/line` returns LINE-shaped
messages for testing the LINE rendering without credentials.

---

## Setting up LINE

Everything below is free on LINE's Communication plan. The bot replies with
**reply tokens only** (never push), so the monthly message allowance is never
touched.

**1. Create the channel**

1. Sign in at <https://developers.line.biz/console/>.
2. Create a **Provider** (any name — your company or your own name).
3. Inside it, create a **Messaging API channel**. This also creates the LINE
   Official Account.

**2. Collect the two secrets**

| Where in the console | What to copy | Env var |
|---|---|---|
| Basic settings | **Channel secret** | `LINE_CHANNEL_SECRET` |
| Messaging API tab | **Channel access token (long-lived)** — click Issue | `LINE_CHANNEL_ACCESS_TOKEN` |

Put both in `.env` (copy `.env.example`). They are read at startup.

**3. Turn off the built-in auto-replies**

In the **LINE Official Account Manager** (<https://manager.line.biz/>) →
Settings → Response settings:

- **Chat**: on
- **Greeting message**: off
- **Auto-response**: off
- **Webhook**: on

If you skip this, LINE's canned auto-reply competes with the bot and you get
two replies to every message.

**4. Point the webhook at your laptop**

```bash
npm run dev:local                               # terminal 1
cloudflared tunnel --url http://localhost:8787  # terminal 2 — copy the https URL
```

In the console's Messaging API tab, set **Webhook URL** to
`https://<tunnel>.trycloudflare.com/webhook/line`, turn **Use webhook** on, and
press **Verify** — it should return success. A quick tunnel gets a **new random
URL every restart**, so re-paste it each session (a free Cloudflare account
gives you a stable named tunnel).

**5. Rich menu (optional, once per channel)**

```bash
npm run -w server richmenu -- ./richmenu.png    # 2500x1686 PNG, under 1 MB
```

Six cells: this week's plan, check-in, find a gym, meals, coach, web app.

**6. Run it**

Scan the channel's QR code (Messaging API tab) to add the OA as a friend. The
`follow` event starts onboarding.

**Troubleshooting**

| Symptom | Cause |
|---|---|
| Webhook verify fails | Tunnel not running, or the URL is missing `/webhook/line` |
| `401 bad signature` | `LINE_CHANNEL_SECRET` is wrong or unset |
| Two replies to everything | Auto-response still on in the OA Manager |
| Bot silent, no errors | `LINE_CHANNEL_ACCESS_TOKEN` unset — replies are skipped with a console warning |

---

## Which engine can run where

This is the constraint that decides how you demo.

| Engine | Laptop | Cloudflare Workers | Real AI? | Cost |
|---|---|---|---|---|
| `agent-sdk` | ✅ | ❌ **impossible** | yes | free — your Claude subscription |
| `api` | ✅ | ✅ | yes | pay per token (~$0.01/message on Haiku) |
| `mock` | ✅ | ✅ (hosted default) | no — keyword engine | zero |

**The Agent SDK cannot run hosted.** It works by driving the logged-in `claude`
CLI as a subprocess, which needs Node, a filesystem and your login. Cloudflare
Workers has none of those. So "free real AI" exists only on the laptop.

### So how should you demo?

**Live demo → run it on your laptop** with `npm run dev:local`. Real Claude, no
per-token cost, and `cloudflared tunnel` puts the LINE bot on the internet for
as long as the laptop is running. This is the intended demo path.

**A link people can click any time → host it on mock.** Free, always up, zero
tokens. The whole story still works hosted: conversational onboarding from typed
answers, the missed-week re-plan with its volume drop, the vetted gym card, the
safety handoff, all five tabs. The only thing mock cannot do is open-ended chat.

**Hosted with real AI → add an API key.** `wrangler secret put ANTHROPIC_API_KEY`
and set `COACH_ENGINE=api`. Costs roughly a cent a message on
`claude-haiku-4-5`; a full run-through is a few cents. The per-day call cap
(`API_DAILY_CALL_CAP`, default 50) auto-falls back to mock when hit, so a shared
link cannot run up a bill.

---

## The two modes

| | Local live-demo | Hosted always-on |
|---|---|---|
| Runtime | Node ≥20 on your laptop | Cloudflare Workers |
| LLM | `AgentSdkEngine` — Claude Agent SDK on your **subscription** auth | `MockEngine` (zero tokens). `ApiEngine` only if `ANTHROPIC_API_KEY` is set |
| Webhook | `cloudflared tunnel` | Worker URL |
| Storage | SQLite (`server/data/fither.db`) | D1 |
| Web | served at `/app/` | GitHub Pages → Worker API |

`FITHER_MODE=local` **plus** `ANTHROPIC_API_KEY` is a fatal startup error — an
API key silently overrides subscription auth and starts billing.

Env vars: copy `.env.example`. `COACH_ENGINE` is `agent-sdk | api | mock`
(local default `agent-sdk`, hosted default `mock`).

---

## Architecture

```
LINE event ──► router ──► pre-flight red-flag scan (deterministic, 0 tokens)
                               │ clean
                               ▼
                  CoachRequest ──► CoachEngine.run()
                                        │  agent loop, max 6 tool calls
                                        │  get_user_state → save_plan ⇄ validator (≤2 retries)
                                        │  search_partners → maps_fallback
                                        ▼
                                   CoachResult ──► Flex card + web + events
```

One agent, one system prompt, **four tools and only four**. Meals, coaches,
communities and events have no tools — they are UI mocks.

Three things make the plan path reliable rather than lucky:

- **`get_user_state` returns a `derived` block** carrying `volume_ceiling_sets`
  — the exact number the validator enforces — so the model never does the
  ±10% / −20% arithmetic itself.
- **The exercise library is injected into the prompt, pre-filtered** to the
  user's equipment and experience tier, so an invented or unusable movement is
  near-impossible rather than merely caught afterwards.
- **The red-flag scan runs before any engine call**, so safety never depends on
  a model round-trip succeeding.

The engine reports its own text and token usage; everything factual — the saved
plan, the venue, the validator runs — is reconciled from the tool layer, so an
engine cannot claim to have saved a plan it did not save. If the model exhausts
its `save_plan` retries, a deterministic template plan ships instead.

### Layout

```
server/src/engine/    CoachEngine interface + agent-sdk | api | mock + prompts + template planner
server/src/tools/     the four tools
server/src/safety/    deterministic validator + editable rules.json
server/src/conversation/  the one conversation spine: router + neutral message/card types
server/src/line/      signature verify, LINE event normalisation, Flex builders + adapter
server/src/storage/   one schema.sql, SqliteStorage + D1Storage over a shared base
server/seed/          exercises (42), partners (8), Mind, and seed/mock/* for the mock features
web/src/screens/      Landing (public), Chat + Profile, SessionDetail, ScheduleWeek, PlanHistory
web/src/tabs/         Home, Plan, Discover, Meals, Coach
web/src/lib/i18n.tsx  every UI string, Thai and English
```

### Schema changes

`CREATE TABLE IF NOT EXISTS` skips a table that already exists, so a new column
in `schema.sql` never reaches a database someone already has. Adding a column
therefore means two edits: the column in `schema.sql` (for fresh databases) and
an `ALTER TABLE` in `applyMigrations()` in `storage/base.ts` (for existing
ones). Migrations are idempotent — a "duplicate column" error is swallowed,
anything else is raised — and they run for both SQLite and D1.

---

## The web app

Two routes, no login:

| Route | What it is |
|---|---|
| `/` | **Public landing page.** Hero, how it works, what makes it different, safety, CTA. Makes zero API calls, so it works with the server down. |
| `/#/u/mind` | The app: 5 tabs plus 4 pushed screens. `←` in the app bar returns to the landing page. |

**Bilingual throughout — Thai first, English complete.** UI strings, seed
content (meals, coaches, communities, events, feed, challenges), live venue
match reasons and partner notes, plus dates and weekday names all switch. Toggle
in the app bar or in Profile → ภาษา / Language; the choice persists in
`localStorage` and the app adopts the profile's saved language on load.

English is not a best-effort overlay: in `i18n.tsx` the `en` object is typed as
`Strings`, derived from the Thai one, so **a missing or misspelled translation
is a compile error** rather than a Thai string leaking into the English UI.

Content that comes from the database carries both languages (`why_text_th` /
`why_text_en`, `note` / `note_en`, `match_reasons` / `match_reasons_en`), so
switching language does not require regenerating anything.

## Safety validator

Deterministic, not the model. Rules live in `server/src/safety/rules.json` and
are editable without touching code: weekly volume ≤ +10% (or ≥ −20% after a
missed week), session duration ≤ the user's limit, exercise IDs that exist and
match her equipment/level/contraindications, sets 1–5, reps 3–20, gradual load
notes only, and a guilt-language scan on the why-line. Every rejection is
logged to `events` — that is the "zero unsafe plans" metric.

```bash
npm test    # 74 cases
```

The load-note rule is worth calling out: it exists to stop progression *jumps*,
not to police formatting. `"10 นาที ชัน 3%"` is accepted (composed from
recognised segments); `"เพิ่มเป็น 20 kg"`, `"เพิ่มอีก 5 kg"` and `"+5 ขั้น"` are
rejected.

## API

```
GET  /health
GET  /api/state/:userId            everything the LIVE surfaces need
GET  /api/exercises
PATCH /api/user/:userId            profile editor (applies at next re-plan)
POST /api/plan/:planId/session-state   Done/Skip (display state only)
POST /api/plan/:planId/move-day        day swap (no regeneration)
GET  /api/usage                    token totals per engine
POST /api/chat                     in-app chat (same router as the webhook)
POST /api/demo-reset/:userId       delete my data (PDPA)
POST /webhook/line                 signed LINE webhook
POST /sim/line                     same router, LINE-shaped reply (no credentials)
```

## Hosted deploy

Step-by-step in **[DEPLOY.md](DEPLOY.md)** — GitHub, Cloudflare D1, the Worker,
GitHub Pages, and the optional API key and LINE secrets. Free tier throughout.

```bash
npx wrangler d1 create fither            # put the id in server/wrangler.toml
npm run -w server d1:init                # apply schema.sql
npm run deploy:worker
```

**The Agent SDK is deliberately absent from the Worker bundle.** It drives the
`claude` CLI as a subprocess, so it is Node-only, and referencing it from shared
code — even behind a dynamic import — pulled it and its Node-only dependencies
into the Worker build (1.49 MB). `src/node.ts` registers it through
`registerEngineFactory`; shared code knows only about `api` and `mock`. The
Worker bundle is 620 KB / 133 KB gzipped. Keep it that way.

## Demo runbook — 6 minutes

**Start from an empty account.** The demo is the onboarding — if a plan already
exists the coach talks about it instead of getting to know you.

```bash
npm run demo:reset -- --onboarding   # CLI, before the demo
```

or tap **ลบข้อมูลของฉันทั้งหมด** in Profile, which does the same thing live.
Either way the app returns to the new-user state: opening the chat makes the
coach greet you and ask its first question unprompted.

Reset → scan the QR → onboard as Mind (60s) → plan card + web view →
check-in reporting a missed week → show the re-plan diff on **Plan history**
(visibly lower volume, no guilt language) → "อยากลองไปยิม" → beginner-vetted
partner card → `GET /api/usage` for the cost slide.

**Not built, deliberately:** multi-user auth, payments, partner onboarding,
push-notification scheduling, native app, analytics dashboards, admin panel,
and any real logic behind the mock features.

---

## Notes and deviations

- **No LINE credentials are needed to develop or test.** `POST /sim/line` and
  `npm run sim` drive the *identical* webhook router as `POST /webhook/line`
  and return the messages instead of sending them. When the Official Account
  exists, set `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` and nothing
  else changes; `scripts/richmenu-setup.ts` registers the 6-cell menu.
- **`npm run -w server verify:agent` spends real agent turns** from the Claude
  subscription. Everything else — the simulator, the tests, the whole mock-mode
  demo — costs nothing.
- **Model id:** `ApiEngine` uses `claude-haiku-4-5` (the cheapest current
  model, as the spec asked) rather than a date-suffixed id, per the current
  Anthropic model reference. Override with `ANTHROPIC_MODEL`.
- **Windows note:** Thai text sent through `curl` under Git Bash gets mangled by
  the shell's encoding, which makes intent detection look broken when it is not.
  Use `npm run sim`, or a Node `fetch` client, to exercise Thai input locally.
- **Serving path:** a default `vite build` emits root-absolute asset URLs
  (`/assets/…`), so the app is served from the server **root**, not a sub-path.
  Mounting it under `/app/` without rebuilding with a matching `BASE_PATH`
  404s every asset and yields a blank page. GitHub Pages sets `BASE_PATH` to
  `/<repo>/` in the workflow, which is why that deploy works on a sub-path.
- **Chat works on both surfaces.** See *Where the conversation happens*. Free
  text in the app costs engine calls exactly like LINE does, so rehearse with
  `COACH_ENGINE=mock` if you are demoing repeatedly.
- **Reset before every run.** Onboarding only happens while required profile
  fields are missing. With a plan already saved the coach quite correctly talks
  about that plan instead — which looks like a broken demo. `npm run demo:reset
  -- --onboarding` is the pre-demo command.
