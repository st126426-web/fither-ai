# FitHer AI — Demo Summary

Everything the demo is, what runs live, what is staged, and how to run it.

**Product:** adaptive AI workout coach + beginner-vetted gym discovery for Thai
women. A LINE bot and a companion web app over **one conversation spine**.

**Scope claim:** one complete journey that actually runs, not a full app.
Mind's journey — onboarding → Week-1 plan → missed-week re-plan → gym
recommendation — plus a red-flag safety handoff. Everything else is a polished,
deliberately-staged mock.

---

## 1. The story the demo tells

The demo is built around one persona, **Mind** — a Thai beginner in Bangkok with
a condo gym, a child, and no idea what weight to pick up.

| Beat | What happens | Status |
|---|---|---|
| **1. Intake** | She types free sentences. The agent interviews her in its own words, extracts several fields per sentence, and records them. | ✅ live |
| **2. Week 1** | A conservative, beginner-safe first week. The plan carries a why-line tied to something she actually said. | ✅ live |
| **3. Missed week** | She reports doing nothing. The plan is rebuilt at **≥ 20% less volume** — 30 → 24 sets (−20.0%) on the live agent, 24 → 19 (−20.8%) on mock — zero guilt words, a warm Thai why-line. | ✅ live |
| **4. Gym** | "อยากลองไปยิม" → `search_partners` → a vetted Ladprao venue. Empty the partners table and it falls through to `maps_fallback`, explicitly labelled `vetted:false`. | ✅ live |
| **5. Red flag** | `เจ็บเข่า` → **no plan generated**, human handoff, flag logged to `events`, **0 tokens spent**. | ✅ live |

**Beat 3 is the product.** Four of the five steps exist in every fitness app on
the market. The one that does not is: *notice she trained once in three weeks and
rebuild the next weeks around that fact.*

---

## 2. Two surfaces, one spine

```
LINE event ─┐                          ┌─► LINE adapter ─► Flex messages
            ├─► ChatEvent ─► routeChat ┤
web chat  ──┘                (one spine)└─► /api/chat ────► JSON, rendered by React
```

`conversation/router.ts` is the **only** conversation logic in the system. It
takes a normalised `ChatEvent` and returns `AgentMessage[]` — text in both
languages plus typed, surface-neutral cards (`plan`, `checkin`, `venue`,
`handoff`, `mock_list`). It knows nothing about LINE or React.

Conversation state lives in **one `conversations` row keyed by user**, which is
why she can start onboarding on LINE, get interrupted, and finish it in the web
app mid-flow. There is no "LINE version" of her to get out of sync.

| Action | LINE | Web app |
|---|---|---|
| Onboarding (agentic, free text) | ✅ | ✅ |
| Weekly check-in | ✅ | ✅ |
| Free-text conversation | ✅ | ✅ |
| Ask for a gym | ✅ | ✅ |
| Red-flag safety handoff | ✅ | ✅ |
| See plan, sessions, history, why-line | ✅ Flex cards | ✅ |
| Mark session done / move a day | — | ✅ |
| Edit training profile | — | ✅ |
| Journey timeline, delete my data | — | ✅ |

In the app, chat is the 💬 button floating above the tab bar.

---

## 3. What is real vs. what is mocked

**Real, end to end** (hits the database, the tools and the validator):

- Agentic onboarding from free text, in Thai or English
- Week-1 plan generation, validated before it is written
- Weekly check-in → adaptive re-plan with an enforced volume drop
- Beginner-vetted gym search + unvetted Maps fallback
- Deterministic red-flag safety gate and human handoff
- Session Done/Skip, day-swap, profile editing, plan history, PDPA data delete
- Token accounting per engine (`GET /api/usage`)

**Deliberately staged mocks** — seeded JSON, inlined into the JS bundle, zero
network calls, **no tools behind them**:

Meals · Coaches · Communities · Events · Challenges · Body stats · Weekly feed

**Not built, deliberately:** multi-user auth, payments, partner onboarding, push
notification scheduling, a native app, analytics dashboards, an admin panel.

---

## 4. The web app

Two routes, no login.

| Route | What it is |
|---|---|
| `/` | Public landing page. Hero, how it works, differentiators, safety, CTA. Makes **zero API calls**, so it works with the server down. |
| `/#/u/mind` | The app — 5 tabs (Home, Plan, Discover, Meals, Coach) plus pushed screens: Chat, Profile, Session detail, Schedule week, Plan history. |

Design decisions worth naming on stage:

- She is **greeted, not dashboarded**. Her goal, her streak, and the one session
  she actually has to do next. No wall of charts to decode.
- **The plan carries its own why-line.** It explains itself instead of issuing
  orders — that is what makes it read as a coach rather than a spreadsheet that
  learned to talk.
- **Bilingual throughout, Thai-first and English-complete.** UI strings, seeded
  content, venue match reasons, partner notes, dates and weekday names all
  switch. Database content carries both languages (`why_text_th`/`why_text_en`,
  `note`/`note_en`, `match_reasons`/`match_reasons_en`), so switching language
  never requires regenerating anything.
- In `i18n.tsx` the `en` object is **typed as `Strings`, derived from the Thai
  one** — a missing or misspelled translation is a **compile error**, not a Thai
  string leaking into the English UI.

---

## 5. Exercise library and guidance

- **42 exercises**, each tagged with equipment, level, movement pattern and
  contraindications.
- Filtered to the equipment she actually owns and her experience tier before the
  agent ever sees it.
- Every exercise carries **three setup cues + the single most common mistake**,
  in both languages (`seed/exercise-guide.json`), plus a video link. Session
  detail renders them as a numbered how-to with a highlighted "most common
  mistake".
- A test asserts **all 42 have complete guidance**, so an exercise cannot be
  added without it.

---

## 6. Quick setup — for people who hate forms

Not everyone will answer nine questions one at a time. The chat offers a prompt
she can paste into whichever AI she already uses. That AI interviews her — and is
told to reuse anything it already remembers about her rather than re-ask — and
produces one paragraph. She pastes the paragraph back.

Verified live: the agent extracted goal, 12-week timeframe, 3×45 min, evening,
equipment, beginner, right-knee history, dislikes-jumping, 32 / 160 cm / 57 kg,
6 h sleep, gentle tone — **from a single paragraph, in one turn** — and the plan
it produced avoided jumping and step-ups entirely.

---

## 7. Onboarding cannot dead-end

Keyword extraction always misses something. "I want to get in shape" matched none
of the goal patterns, and the naive answer to a miss is to ask the identical
question again, forever, with no way out but the exact magic word. Broader
keyword lists shrink that set; they cannot empty it. So the guarantee is
**structural, not lexical**:

| Times asked | What she gets |
|---|---|
| 1st | The question, in the coach's own words |
| 2nd | The same question **plus tappable choices** — one per valid value |
| 3rd | **No question.** A safe default is assumed, said out loud, and onboarding moves on |

Defaults are the smallest week we would give anyone (habit, 3 days, 30 min,
bodyweight, beginner, balanced). Every one is announced — *"I wasn't sure, so
I've assumed 3 days a week — you can change that any time"* — and a field we
guessed at stays **open for correction** in a way an answered one does not. The
count comes from the conversation history both surfaces already share, so it
survives moving between LINE and the web app.

A choice chip carries `action=say&text=…` and re-enters the ordinary free-text
path, so **a tap and a typed sentence are the same event** — there is no second
parser to keep in sync. A test asserts every chip sends words the extractor can
actually read; a chip the parser cannot parse is a dead end wearing a button.

---

## 8. How to run it

### Laptop demo — 8 commands

```bash
npm install                                    # 1
npm run -w web build                           # 2  web is served from the server root
npm run demo:reset -- --onboarding             # 3  wipe Mind, back to step zero
npm run dev:local                              # 4  http://localhost:8787
cloudflared tunnel --url http://localhost:8787 # 5  second terminal
# 6. paste <tunnel-url>/webhook/line into the LINE console webhook field
npm run -w server richmenu -- ./richmenu.png   # 7  once per channel
# 8. scan the OA QR and run the story
```

Steps 5–7 are only needed for the **real LINE bot**. Everything else runs
without it. `http://localhost:8787/` is the landing page,
`http://localhost:8787/#/u/mind` is the app.

### Engine modes

```bash
COACH_ENGINE=mock npm run dev:local   # rehearsal — zero LLM calls, zero latency
npm run dev:local                     # live — Claude Agent SDK, subscription auth
```

### No LINE credentials? Use the simulator

It drives the *identical* webhook router and prints what LINE would show:

```bash
npm run sim               # the full four-beat story
npm run sim -- --redflag  # the safety handoff beat
```

### Prove the live subscription path (spends real agent turns)

```bash
npm run -w server verify:agent             # one onboard, end to end
npm run -w server verify:agent -- --replan # plus the missed-week re-plan
```

### Reset — do this before every run

```bash
npm run demo:reset -- --onboarding
```

Or tap **ลบข้อมูลของฉันทั้งหมด** in Profile, which does the same thing live (it
is also the PDPA delete). **Onboarding only happens while required profile fields
are missing.** With a plan already saved, the coach quite correctly talks about
*that plan* instead of getting to know her — which reads as a broken demo.

The reset survives a server restart, and the server prints the state it will open
in, so you can check it off the screen rather than find out in front of the room:

```
  FitHer AI — mode=local engine=agent-sdk storage=sqlite(./data/fither.db)
  Demo state onboarding — she will be asked the first question
```

Hosted equivalent:
`curl -X POST https://fither-ai.fither.workers.dev/api/demo-reset/mind`

---

## 9. Which engine can run where

This is the constraint that decides how you demo.

| Engine | Laptop | Cloudflare Workers | Real AI? | Cost |
|---|---|---|---|---|
| `agent-sdk` | ✅ | ❌ **impossible** | yes | free — your Claude subscription |
| `api` | ✅ | ✅ | yes | pay per token (~$0.01/msg on Haiku) |
| `mock` | ✅ | ✅ (hosted default) | no — keyword engine | zero |

**The Agent SDK cannot run hosted.** It works by driving the logged-in `claude`
CLI as a subprocess, which needs Node, a filesystem and your login. Cloudflare
Workers has none of those. So "free real AI" exists **only on the laptop**.

| | Local live-demo | Hosted always-on |
|---|---|---|
| Runtime | Node ≥20 on your laptop | Cloudflare Workers |
| LLM | `AgentSdkEngine` on subscription auth | `MockEngine` (zero tokens); `ApiEngine` only with a key |
| Webhook | `cloudflared tunnel` | Worker URL |
| Storage | SQLite (`server/data/fither.db`) | D1 |
| Web | served at root | GitHub Pages → Worker API |

`FITHER_MODE=local` **plus** `ANTHROPIC_API_KEY` is a **fatal startup error** —
an API key silently overrides subscription auth and starts billing.

### How you should demo

- **Live demo → your laptop**, `npm run dev:local`. Real Claude, no per-token
  cost, and `cloudflared tunnel` puts the LINE bot on the internet for as long as
  the laptop is running. This is the intended path.
- **A link people can click any time → host it on mock.** Free, always up, zero
  tokens. The whole story still works: conversational onboarding, the missed-week
  re-plan with its volume drop, the vetted gym card, the safety handoff, all five
  tabs. The only thing mock cannot do is open-ended chat.
- **Hosted with real AI → add an API key.** `wrangler secret put
  ANTHROPIC_API_KEY`, `COACH_ENGINE=api`. Roughly a cent a message on
  `claude-haiku-4-5`; a full run-through is a few cents. `API_DAILY_CALL_CAP`
  (default 50) auto-falls back to mock when hit, so a shared link cannot run up a
  bill.

---

## 10. Demo runbook — 6 minutes

Reset → scan the QR → onboard as Mind (~2 min live, see point 2) → plan card +
web view → check-in
reporting a missed week → show the re-plan diff on **Plan history** (visibly
lower volume, no guilt language) → "อยากลองไปยิม" → beginner-vetted partner card
→ `GET /api/usage` for the cost slide.

### Stage honesty points

1. **The QR gives the audience the *mock* build — the laptop is the live one.**
   The hosted build runs the keyword engine (see §9). Safe phrasing: *"the
   running prototype"*, *"the real flow, real plan data"*. Avoid: *"that's live
   AI on your phone right now."* If you want live AI in the room, drive **beat
   three from the laptop** on the projector and let the phones follow along.
2. **Live AI is slower than one number suggests.** Measured end to end on
   2026-09-19, `engine=agent-sdk`: each onboarding question **9–13 s**, the turn
   that generates the first plan **29 s**, the missed-week re-plan **23 s**, the
   gym recommendation **12 s**, the red-flag handoff **0.1 s** (it never reaches
   a model). Onboarding took **six** of her messages, not four — the agent asked
   one optional question about time of day and her age, height and weight — so
   beats one and two are ~82 s of model latency plus her typing. Budget two
   minutes, or arrive already onboarded and open on beat three. Fill the two long
   silences deliberately — *"while that thinks: it's calling `save_plan`, and the
   validator is about to check it."* Don't stare at the screen.
3. **If the live path fails mid-demo,** `COACH_ENGINE=mock npm run dev:local`
   gives the identical journey with zero LLM calls and no latency. The audience
   cannot tell the difference across the four beats you are showing. Have that
   terminal open on a second tab before you start.
4. **Reset before you present.** See §8. If the startup line says *already
   onboarded*, run the reset and reload.

**Demo success condition:** the audience scans, and then *watches the plan change
after disruption.* If you only have time for one beat, do beat three.

---

## 11. Proof points for the slides

Numbers from the working prototype, not projections:

| Claim | Number |
|---|---|
| Volume cut after a fully missed week | **≥ 20%**, validator-enforced (live 30 → 24 = −20.0%; mock 24 → 19 = −20.8%) |
| Exercises, equipment-filtered and beginner-vetted | **42** |
| Automated safety tests | **106** (`npm test`) |
| Unsafe plans shipped | **0** |
| Tokens spent on a red-flag block | **0** |
| Languages, both complete | **2** (Thai-first) |
| Tools the agent has | **5, and only 5** |
| Worker bundle | 635 KiB / **138 KiB gzipped** |

Also verified end to end:

- Session Done/Skip and the schedule day-swap persist across reload.
- Profile edit 45 → 30 min + removing dumbbells → the next generated plan has
  **no session over 30 min and no dumbbell exercise** (validator-enforced).
- Plan history shows the Week-2 re-plan with visibly lower volume.
- `GET /api/usage` reports per-engine token totals.
- The Pages build emits `/fither-ai/`-prefixed asset URLs.
- Mock seed data is **inlined into the JS bundle** — the mock sections make no
  network calls at all, and the only `fetch` in the bundle is the API client.

---

## 12. API surface

```
GET   /health
GET   /api/state/:userId                everything the live surfaces need
GET   /api/exercises
PATCH /api/user/:userId                 profile editor (applies at next re-plan)
POST  /api/plan/:planId/session-state   Done/Skip (display state only)
POST  /api/plan/:planId/move-day        day swap (no regeneration)
GET   /api/usage                        token totals per engine
POST  /api/chat                         in-app chat (same router as the webhook)
POST  /api/demo-reset/:userId           delete my data (PDPA)
POST  /webhook/line                     signed LINE webhook
POST  /sim/line                         same router, LINE-shaped reply, no credentials
```

---

## 13. Layout

```
server/src/engine/         CoachEngine interface + agent-sdk | api | mock + prompts + template planner
server/src/tools/          the tool implementations
server/src/safety/         deterministic validator + editable rules.json
server/src/conversation/   the one conversation spine: router + neutral message/card types
server/src/line/           signature verify, LINE event normalisation, Flex builders + adapter
server/src/storage/        one schema.sql, SqliteStorage + D1Storage over a shared base
server/seed/               exercises (42), partners (8), Mind, and seed/mock/* for the mock features
web/src/screens/           Landing (public), Chat + Profile, SessionDetail, ScheduleWeek, PlanHistory
web/src/tabs/              Home, Plan, Discover, Meals, Coach
web/src/lib/i18n.tsx       every UI string, Thai and English
```

---

## 14. Setting up LINE (optional — only for the real bot)

Everything here is free on LINE's Communication plan. The bot replies with
**reply tokens only** (never push), so the monthly message allowance is never
touched.

1. **Create the channel** at <https://developers.line.biz/console/> — a Provider,
   then a Messaging API channel (this also creates the Official Account).
2. **Collect two secrets:** Basic settings → **Channel secret**
   (`LINE_CHANNEL_SECRET`); Messaging API tab → **Channel access token
   (long-lived)** (`LINE_CHANNEL_ACCESS_TOKEN`). Put both in `.env`.
3. **Turn off built-in auto-replies** in the LINE Official Account Manager →
   Settings → Response settings: Chat **on**, Greeting message **off**,
   Auto-response **off**, Webhook **on**. Skip this and LINE's canned auto-reply
   competes with the bot — two replies to every message.
4. **Point the webhook at your laptop:** `npm run dev:local` in one terminal,
   `cloudflared tunnel --url http://localhost:8787` in another, then set the
   Webhook URL to `https://<tunnel>.trycloudflare.com/webhook/line` and press
   Verify. A quick tunnel gets a **new random URL every restart**.
5. **Rich menu (once per channel):** `npm run -w server richmenu -- ./richmenu.png`
   (2500×1686 PNG, under 1 MB). Six cells: this week's plan, check-in, find a
   gym, meals, coach, web app.
6. **Run it:** scan the channel QR to add the OA as a friend. The `follow` event
   starts onboarding.

| Symptom | Cause |
|---|---|
| Webhook verify fails | Tunnel not running, or the URL is missing `/webhook/line` |
| `401 bad signature` | `LINE_CHANNEL_SECRET` wrong or unset |
| Two replies to everything | Auto-response still on in the OA Manager |
| Bot silent, no errors | `LINE_CHANNEL_ACCESS_TOKEN` unset — replies are skipped with a console warning |

---

## 15. Anticipated questions

**"Isn't the safety gate just a keyword filter? That's not AI."**
Correct, and that is the design. A keyword filter that runs *before* the model
has a property no model has: it cannot be talked out of it, and it costs nothing.
We use the model where judgment helps and rules where judgment is a liability.

**"What stops the model inventing a plan it didn't save?"**
Structurally, nothing in the *text* — so we do not read the text. Every factual
field in the response is reconciled out of the tool layer. If `save_plan` did not
run, there is no plan in the reply, regardless of what the model wrote.

**"Why LINE instead of an app?"**
Download and login are where beginner fitness funnels die. She has LINE open
already. The web app exists for what chat is bad at, and it is still no-login.

**"Why only 42 exercises?"**
Because they are equipment-filtered and beginner-vetted. The constraint is not
catalogue size — it is whether the next session is safe with the two dumbbells
she actually owns.

**"Twenty percent — is that tuned to look good?"**
It is a rule, not a result. `rules.json` sets a minimum 20% reduction after a
fully missed week and the validator rejects any plan that misses it, so runs land
just above the floor rather than on a number we chose — −20.0% live, −20.8% on
mock. Two runs disagreeing slightly is the rule working.

---

## 16. Known limits and gotchas

- **Reset before every run** (§8). This is the single most common demo failure.
- **Windows:** Thai text sent through `curl` under Git Bash gets mangled by the
  shell's encoding, which makes intent detection look broken when it is not. Use
  `npm run sim` or a Node `fetch` client to exercise Thai input locally.
- **Serving path:** a default `vite build` emits root-absolute asset URLs, so the
  app is served from the server **root**, not a sub-path. Mounting it under
  `/app/` without rebuilding with a matching `BASE_PATH` 404s every asset and
  yields a blank page. GitHub Pages sets `BASE_PATH=/<repo>/` in the workflow,
  which is why that deploy works on a sub-path.
- **Chat costs engine calls on both surfaces.** Rehearse with `COACH_ENGINE=mock`
  if you are demoing repeatedly.
- **`verify:agent` spends real agent turns** from the Claude subscription.
  Everything else — the simulator, the tests, the whole mock-mode demo — costs
  nothing.
- **The Agent SDK is deliberately absent from the Worker bundle.** Referencing it
  from shared code — even behind a dynamic import — pulled it and its Node-only
  dependencies into the Worker build (1.49 MB). `src/node.ts` registers it
  through `registerEngineFactory`; shared code knows only about `api` and `mock`.
- **Schema changes need two edits.** `CREATE TABLE IF NOT EXISTS` skips a table
  that already exists, so a new column never reaches an existing database. Add it
  to `schema.sql` (fresh DBs) *and* as an `ALTER TABLE` in `applyMigrations()` in
  `storage/base.ts` (existing ones). Migrations are idempotent — a "duplicate
  column" error is swallowed, anything else is raised — and they run for both
  SQLite and D1.

---

**See also:** [AI-FLOW.md](AI-FLOW.md) for the agent flow, tools, guardrails and
output contract. [DEPLOY.md](DEPLOY.md) for the hosted deploy.
[SLIDE-SCRIPT.md](SLIDE-SCRIPT.md) for the speaker script.
