# FitHer AI — The AI Flow

The full technical account of what happens between her message and the reply:
inputs, the agent, the tools, every guardrail, the output contract, and the cost
and failure model.

**The one-sentence argument:** *the model reasons, but it is never trusted with
safety or arithmetic.*

---

## 0. The whole flow on one screen

```
her message (LINE or web, free text, Thai or English)
     │
     ▼
conversation/router.ts ──────────── decides the INTENT (deterministic, never the model)
     │                              onboard | weekly_replan | find_gym | freeform
     ▼
runCoach()  engine/index.ts
     │
     ├─ ① GATE 1 — red-flag scan          deterministic · 0 tokens · BEFORE any model call
     │     blocking flag ─────────────► human handoff, event logged, return. No engine call.
     │     warning flag  ─────────────► logged + injected into the prompt, conversation continues
     │
     ├─ ② build CoachRequest              profile · missing_fields · pre-filtered library ·
     │                                    history (10 turns) · warnings · active plan · budgets
     │
     ├─ ③ run the engine                  agent-sdk | api | mock
     │     │
     │     │  agent loop — max 20 turns, max 8 tool calls
     │     │    get_user_state ──► derived block (the exact numbers the validator enforces)
     │     │    save_profile   ──► normalise + enum-check, returns what is still missing
     │     │    save_plan      ⇄  GATE 2 (validator) ── ≤2 retries with structured fix hints
     │     │    search_partners ─► vetted venues
     │     │    maps_fallback  ──► unvetted, only after zero results
     │     ▼
     ├─ ④ reconcile                       plan / venue / flags / traces come from the TOOL LAYER,
     │                                    not from the model's text
     │
     ├─ ⑤ template fallback               a plan intent must always end in a plan
     │
     └─ ⑥ instrument                      usage row, event rows, one log line
           │
           ▼
     CoachResult ──► router ──► AgentMessage[] ──► LINE Flex  |  React cards
```

---

## 1. Input — what the model actually receives

### 1.1 Intent is decided in code, never by the model

`conversation/router.ts` picks one of four intents before any model call:

| Intent | When |
|---|---|
| `onboard` | any required profile field is missing **or** she has no active plan yet |
| `weekly_replan` | a check-in was just recorded |
| `find_gym` | a gym postback, or gym keywords once she is onboarded |
| `freeform` | anything else, once she is onboarded |

Two subtleties that were bugs first:

- **Onboarding ends when a plan exists, not when the fields fill up.** Treating a
  complete profile as "onboarded" routed the next message to `freeform`, where the
  prompt forbids planning — so if the agent spent its final turn asking an
  optional question, the first week was never built at all.
- **Keyword intent detection only runs after onboarding.** During onboarding
  everything goes to the agent, because "เสาร์อาทิตย์ว่าง" is an *answer*, not an
  intent.

### 1.2 Language

`detectLang()` checks the script of each message; the agent is told to reply in
kind, and the detected language is persisted to her profile so the app follows.
An English question gets an English answer even though the product is Thai-first
— including in `MockEngine`, which writes every reply in both languages and picks
by locale.

### 1.3 `CoachRequest` — the full input contract

```ts
{
  request_id,              // correlation id on every event and usage row
  user_id, intent, source, locale,
  message,                 // her raw text
  payload,                 // check-in / gym intent payload
  library: {               // PRE-FILTERED to her equipment + experience tier
    allowed_exercise_ids, catalog, excluded_reason
  },
  profile,                 // current profile incl. derived BMI
  missing_fields,          // required fields still unknown — drives the next question
  history,                 // last 10 turns, shared by both surfaces
  warnings,                // non-blocking safety flags the agent MUST acknowledge
  active_plan,
  budget: { engine, max_tool_calls: 8, max_plan_retries: 2, max_turns: 20 }
}
```

### 1.4 The prompt that gets built

`buildUserPrompt()` assembles, in order:

1. `USER / LOCALE / INTENT`
2. **Tone block** — the concrete writing instructions for her chosen
   `coach_tone`, plus her own words about how she wants to be coached
   (`tone_note`) and why this matters to her (`motivation`).
3. **What she has told you** — timeframe, age/height/weight, BMI (marked *context
   only, never bring up unprompted*), `WORK AROUND: <injuries>`,
   `WILL NOT DO: <dislikes>`, train time, sleep, activity level.
4. **Exercise library snapshot** — id, name, pattern, equipment, one per line,
   already filtered. Explicitly labelled as a snapshot from the *start* of the
   turn, with instructions that `get_user_state` wins if it changes.
5. **Task block**, per intent — what to do and what not to do.
6. **Safety note**, if a warning flag fired — acknowledge in one sentence, do not
   load that area, say to stop and see a professional if it worsens, do not
   diagnose.
7. **Her message**, then **recent conversation** (oldest first).

The system prompt (`SYSTEM_PROMPT` in `engine/prompts.ts`) is large and stable,
so it is almost always a prompt-cache hit.

---

## 2. Who the agent is — the system prompt

The prompt is not a persona sketch; it encodes product decisions. The sections
that matter technically:

**Audience constraints.** Thai women 25–45, mostly beginners, Bangkok. Long
commutes, office hours that overrun, family obligations, a condo gym with two
dumbbells and a treadmill, or nothing. Heat and humidity mean outdoor work is
early morning or after sunset. Many have only ever been sold weight loss and are
nervous lifting will make them "big" — say so plainly *once*, without lecturing.
Gyms feel intimidating; women-only hours are a real feature. Food is Thai food —
rice, noodle dishes, som tam, grilled chicken, never a Western meal plan.

**Hard prohibitions.** No guilt language about missed sessions ever. No
hard-coded menstrual-cycle rules. No medical advice. No commenting on her
appearance or weight beyond what she asked for. Never ask for or use her name.

**Format rules that exist because they were violated.**

- *Everything you write is sent to her verbatim.* There is no scratchpad and no
  narration channel. Write **to** her, never **about** her. Never announce
  intent ("I will now ask…", "let me wait for her reply") — one live turn shipped
  exactly that straight into the chat bubble.
- Never mention the tools, fields, enums or "onboarding" by name.
- Aim for ~600 characters. A hard cut exists far above it (LINE's 4,900-char
  ceiling); a reply that gets near it has already failed as a chat message.
- **No markdown.** LINE shows plain text.
- When a plan is saved, the app renders the full session-by-session card next to
  the message — so do **not** list days and exercises in the text. Two lines: one
  warm sentence, then the why-line.

**`PLAN_FORMAT`** — a worked example of the exact `save_plan` argument, with a
rule per field. This block exists because a live run lost three retries to pure
representation slips.

**`TONE_GUIDE`** — `gentle | balanced | firm`, chosen by her and editable in
Profile, injected every turn with concrete writing instructions. Gentle offers an
easier option and avoids targets; firm names a specific weekly target. **No tone
permits guilt**, and the validator enforces that on the why-line regardless of
tone.

**Starting loads.** A beginner has no idea what weight to pick, so the prompt
carries a table for an untrained woman — goblet squat 4–6 kg, RDL 4–5 kg,
single-arm row 4–5 kg, shoulder press 2–4 kg, floor press 3–5 kg, biceps curl
2–4 kg, lateral raise 1–2 kg, hip thrust 6–10 kg, farmer carry 5–8 kg — with
instructions to go to the lower end when she is a true beginner, older, sleeping
badly, or has a niggle in that area. `load_note` must be concrete: "4 kg ต่อข้าง",
not "light".

---

## 3. Onboarding is agentic — there is no question script

When required profile fields are missing, whatever she types goes to the agent
with intent `onboard`. The agent asks in its own words, extracts what she
volunteered, records it with `save_profile`, and reads back what is still
missing. When nothing is missing, it plans.

```
her message ─► router: any required field missing? ─► agent
                                                       │  asks ONE thing, in its own words
                                                       │  save_profile { whatever she revealed }
                                                       │   ↳ { saved, ignored, missing, optional_missing, ready_to_plan }
                                                       ▼
                             ready_to_plan ─► get_user_state ─► save_plan ─► week 1
```

### 3.1 The six required fields

`goal`, `days_per_week`, `session_minutes`, `equipment`, `experience`,
`coach_tone`.

### 3.2 What else it collects, in the same conversation

- **Coaching constraints** — `injuries` (what to work around), `dislikes` (what
  she refuses to do), `train_time`, `sleep_hours`, `activity_level`. Asked as one
  combined question framed as *"so I do not give you something that hurts or that
  you will hate"*. These are what separate a programme from a template.
- **Timeframe** — `target_weeks` and `target_event`, asked alongside the goal.
  The plan is paced against it, and the agent is told to be honest rather than
  promise a rate that is not real.
- **Age, height, weight** — asked once, together, with the reason given and an
  explicit opt-out. BMI is **derived, never stored**, and the prompt forbids
  raising it unprompted or commenting on her numbers. Declining is a complete
  answer and it never asks again.
- `motivation`, `tone_note`, `life_stage` — recorded when she offers them,
  without being asked.

It never asks for her name and never addresses her by one.

### 3.3 One sentence, several fields

From a real run:

| She typed | The agent recorded |
|---|---|
| "อยากแข็งแรงขึ้นค่ะ อุ้มลูกแล้วปวดหลังตลอด" | goal=strength, motivation in her words |
| "ว่างแค่เสาร์อาทิตย์ ครั้งละชั่วโมง" | days_per_week=2 **and** session_minutes=60 |
| "ที่คอนโดมีดัมเบลกับลู่วิ่งค่ะ" | equipment=[dumbbell, treadmill, …] |
| "ไม่เคยเล่นเวทเลยค่ะ" | experience=beginner |
| "อยากให้พูดอ่อนโยนหน่อย ไม่ต้องกดดัน" | coach_tone=gentle |

### 3.4 The anti-loop rules

The prompt's hardest rule is **never ask the same question twice**. A vague
answer is still an answer: "I want to get in shape", "just feel better", "I don't
know really" all tell it enough. Pick the closest enum, record it, say in a few
words what you took it as so she can correct you, and move on. Asking again —
especially by listing the options back at her — is the one thing that makes her
leave.

If `save_profile` returns a value in `ignored`, the rejection **names the allowed
values**, and the agent must re-map and call again *on the same turn*, never turn
it into another question.

---

## 4. The tools — five, and only five

Meals, coaches, communities and events have **no tools**. They are UI mocks.

### 4.1 `get_user_state`

Returns profile, `missing_fields`, the **authoritative** `exercise_library`, the
last 4 weeks of plans and check-ins, and — the whole point — a `derived` block:

```ts
derived: {
  last_active_volume_sets,   // total sets of the last active plan
  missed_last_week,          // completion_pct === 0 on the latest check-in
  completion_rate_4w,
  next_week_number,
  volume_ceiling_sets,       // THE EXACT NUMBER THE VALIDATOR ENFORCES
  volume_floor_sets
}
```

`volume_ceiling_sets` is `floor(prev × 0.8)` after a missed week, else
`floor(prev × 1.1)`. **The model never does the ±10% / −20% arithmetic itself.**

`exercise_library` is filtered from her *current* equipment and level. It is
authoritative precisely because the copy injected into the prompt is a snapshot
taken before this turn's profile updates — see §8.4.

### 4.2 `save_profile`

Records what the agent learned. Partial is fine and expected. Everything is
**normalised and enum-checked here, never trusted raw** — the model never writes
a raw value into the database.

- **Equipment aliases**: ดัมเบล → `dumbbell`, ลู่วิ่ง → `treadmill`, เสื่อ → `mat`,
  ยางยืด → `resistance_band`, ไม่มี → `bodyweight`, etc. Tolerates "2 dumbbells"
  and "มีดัมเบล 2 ตัว". `bodyweight` is always added, so a plan is always possible.
- **Enum near-misses** are accepted rather than rejected: "lose weight"/"toning"
  → `fat_loss`, "get in shape"/"consistency" → `habit`, "newbie"/"never" →
  `beginner`, "tough"/"strict" → `firm`. A rejected value used to vanish into
  `ignored`, leaving the agent to re-ask with the options spelled out — the most
  irritating thing this conversation can do.
- **Numbers are clamped**, not rejected: days 1–6, minutes 10–120, age 13–99,
  height 120–220 cm, weight 30–250 kg, sleep 3–14 h, target 2–104 weeks. Ranges
  are sanity checks, not judgements — anything outside is far more likely a typo.
- **Free text is truncated**, not parsed: `injuries`, `dislikes`, `motivation`,
  `tone_note` at 300 chars, `target_event` at 120.

Returns `{ ok, saved, ignored?, missing, optional_missing, ready_to_plan }`.
`optional_missing` (`body_metrics`, `injuries`, `train_time`, `target_weeks`) is
surfaced separately so the agent offers them **once** before planning rather than
skipping them the moment the required six are complete — and never holds the plan
hostage over them.

### 4.3 `save_plan` — **Gate 2**

**The validator runs before the write.** On failure the agent gets structured
errors with `fix_hint` and a `retries_left` count, not a thrown error.

Critically, it does **not** validate against `req.library` — it rebuilds the
filtered library from the user row **as it is now**, because during onboarding
her equipment did not exist when the request was built.

On success: supersede previous plans, insert the plan, insert a
`plan_created`/`plan_replanned` event. On failure: insert a `plan_rejected` event
with every error code. **Every rejection is logged** — that is the "zero unsafe
plans" metric, and it is what makes the failure modes inspectable rather than
invisible.

The plan that gets written is the **coerced, validated** one — not the raw
argument, which may still be a JSON string or carry `day: "Monday"`.

### 4.4 `search_partners`

Beginner-vetted venues from the seeded DB. Areas are stored in English but she
writes them in Thai, so `normaliseArea()` maps ลาดพร้าว → `Ladprao`, ทองหล่อ →
`Thonglor`, อารีย์ → `Ari`, and tolerates "แถวลาดพร้าว" and "Ladprao area".

**A zero-result area search widens to any vetted partner** before the agent can
reach for the fallback — a vetted gym in the next district beats an unvetted
stranger.

Match reasons are generated bilingually from tags: `ladies-hours` →
"มีช่วงเวลาเฉพาะผู้หญิง" / "Has women-only hours", `pt-included` → "มีเทรนเนอร์ช่วยดูฟอร์ม" /
"A trainer checks your form", and so on.

### 4.5 `maps_fallback`

A deliberate stub over static JSON. Always returns `vetted: false` with a
disclaimer in both languages. The prompt requires the agent to say so in Thai,
and it may only be called **after `search_partners` returns zero results**.

---

## 5. Guardrails

There are **six layers**. Only one of them is the model.

### Layer 1 — Gate 1: the pre-flight red-flag scan

Runs in `runCoach()` on raw user text **before any engine call**, so safety never
depends on a model round-trip succeeding. Deterministic, keyword + pattern,
**zero tokens**.

| Code | Terms (abridged) | Severity |
|---|---|---|
| `PAIN` | เจ็บ, ปวด, pain, hurts, sore joint | block — **warns during `onboard`** |
| `INJURY` | บาดเจ็บ, injury, sprain, strain, เคล็ด | block everywhere |
| `DIZZY` | เวียนหัว, หน้ามืด, dizzy, faint, lightheaded | block everywhere |
| `PREGNANCY` | ท้อง, ตั้งครรภ์, pregnant | block everywhere |
| `CHEST` | แน่นหน้าอก, chest pain, หายใจไม่ออก | block everywhere |
| `DISTRESS` | ซึมเศร้า, ทำร้ายตัวเอง, อยากตาย, suicidal | block everywhere |

A blocking flag returns the human-handoff message, logs a `red_flag_handoff`
event, and **returns without ever calling the engine**.

Three pieces of machinery make this survive real Thai text:

- **`warn_intents` — the context split.** A generic ache **warns** during
  `onboard` (logged as `safety_warning`, injected into the prompt with
  instructions to acknowledge it, avoid loading that area, and say to stop and
  see a professional if it worsens) while still **blocking** at check-in, where
  the same words mean she got hurt training. Acute signals block in every
  context, onboarding included.
- **`negatable` + negation detection.** "no injury", "np injury", "ไม่มีบาดเจ็บ"
  are her *answering*, not reporting. Negation is checked as whole tokens within
  3 English tokens / 12 Thai characters. Suppression is **opt-in per rule, never
  global**: only `PAIN`, `INJURY` and `PREGNANCY` set it, because those are the
  ones the coach actually asks about. `CHEST`, `DIZZY` and `DISTRESS` always
  flag — "no chest pain" blocking is a cheap false positive; missing a real one
  is not a risk worth taking.
- **`not_when` — excluded contexts.** Thai has no word spacing, so ท้อง
  ("pregnant") also sits inside หน้าท้อง ("abdomen"), ท้องเสีย ("diarrhoea"),
  กล้ามท้อง ("abs"). Without this, *"อยากลดหน้าท้อง"* — "I want to lose belly
  fat", one of the most common goals this product exists to serve — was read as a
  pregnancy disclosure and handed to a human coach.

Latin terms anchor to a word start but allow suffixes, so "sprain" still catches
"sprained".

### Layer 2 — the pre-filtered library

The exercise catalogue is filtered to her equipment, experience tier and life
stage **before the prompt is built**, and injected into the prompt rather than
fetched. The model physically cannot pick an unusable movement — that is
prevention, not detection. `PlanSchema` accepts exercises **by ID only**, so it
can never invent a movement in the first place.

### Layer 3 — tool-layer normalisation

`save_profile` enum-checks and clamps everything. `normaliseEquipment` and
`normaliseArea` map Thai to canonical values. The model never writes a raw value
into the database, and never sees a value it can't act on without being told the
allowed set.

### Layer 4 — Gate 2: the deterministic plan validator

Rules live in `server/src/safety/rules.json` and are **editable without touching
code**. Runs inside `save_plan`, before the write.

| Rule | Code |
|---|---|
| Sessions ≤ `days_per_week` | `TOO_MANY_SESSIONS` |
| `duration_min` ≤ her `session_minutes` | `SESSION_TOO_LONG` |
| Exercise ID exists in her current library | `UNKNOWN_EXERCISE_ID` |
| Exercise matches her equipment | `EQUIPMENT_MISMATCH` |
| Exercise is within her experience tier | `LEVEL_TOO_ADVANCED` |
| Not contraindicated for her life stage | `CONTRAINDICATION` |
| Sets 1–5 | `SETS_OUT_OF_RANGE` |
| Reps 3–20 | `REPS_OUT_OF_RANGE` |
| Load note is gradual, not a jump | `LOAD_JUMP_TOO_BIG` |
| Weekly volume ≤ +10% | `VOLUME_INCREASE_EXCEEDED` |
| Weekly volume ≥ −20% after a missed week | `VOLUME_NOT_REDUCED_AFTER_MISSED_WEEK` |
| No guilt language in the why-line | `GUILT_LANGUAGE` |
| Shape matches `PlanSchema` | `SCHEMA_INVALID` |

**Experience tiers:** `beginner` and `returning` may only use beginner-level
exercises; `intermediate` unlocks intermediate.

**Life-stage contraindications:** `postpartum` blocks high-impact, prone and
spinal-loading; `pregnant` additionally blocks supine.

**The guilt-word scan** covers both languages — ขี้เกียจ, ล้มเหลว, ไม่มีวินัย,
ต้องชดเชย, แก้ตัว, lazy, failed, no discipline, make up for, fell off, should
have, you let yourself… — and applies **regardless of tone**.

**The load-note rule polices progression size, not formatting.** A note is
accepted when it contains no jump phrase *and* is built entirely from recognised
segments, consumed left to right. So `"10 นาที ชัน 3%"` passes (composed from two
recognised segments); `"เพิ่มเป็น 20 kg"`, `"เพิ่มอีก 5 kg"` and `"+5 ขั้น"` are
rejected. This distinction was a real bug — the allowlist originally matched only
single forms and rejected a perfectly gradual note.

**`coercePlan` normalises harmless slips before validating**: a plan handed over
as a JSON string, a day written as `"Monday"` or `"จันทร์"`, a missing
`load_note`. Anything genuinely ambiguous — a day as a *number* — is left alone
so it fails loudly rather than being silently guessed at.

**Error codes are honest.** A *missing* `reps` field is `SCHEMA_INVALID`, not
`REPS_OUT_OF_RANGE`; range codes fire only on genuine range violations. Labelling
a missing field as a range error sends the model after the wrong thing and burns
a retry.

### Layer 5 — reconciliation: the model cannot claim what it did not do

Engines report their own text and token usage. **Everything factual — the saved
plan, the venue, the validator runs, the tool-call trace — is reconciled from the
tool layer.** An engine cannot claim to have saved a plan it did not save. If
`save_plan` never ran, there is no plan in the reply, regardless of what the
model wrote.

### Layer 6 — the template fallback

A plan intent must always end in a plan. If the model exhausts its `save_plan`
retries, `buildTemplatePlan()` ships a deterministic, rule-built plan through the
*same* `save_plan` tool and the *same* validator, and logs a
`template_fallback_used` event. `trimToCeiling()` sheds volume — shave the
heaviest set, then drop the last exercise of the longest session, then drop a
whole session — until the plan is under the ceiling. **The user always gets a
safe plan; she never gets an apology.**

Onboarding is exempt while the profile is still incomplete — the agent is
mid-conversation there, and shipping a plan built on unknowns is worse than
asking one more question. The exemption is judged from the state **after** the
turn, and only fires when the agent genuinely said nothing (`result.silent`).

### Cost guardrails

- `max_tool_calls: 8`, `max_plan_retries: 2`, `max_turns: 20`.
- `API_DAILY_CALL_CAP` (default 50) — the `api` engine **auto-falls back to
  mock** past its daily cap, so a shared link cannot run up a bill.
- `FITHER_MODE=local` + `ANTHROPIC_API_KEY` is a **fatal startup error**.
- Red-flag blocks cost **0 tokens** by construction.

### Test coverage

`npm test` — **106 cases** over the validator, the red-flag scanner, the load-note
grammar, the negation and excluded-context handling, the onboarding escalation
ladder, and the exercise-guidance completeness check.

---

## 6. Output — the contract

### 6.1 `CoachResult`

```ts
{
  request_id,
  status: 'ok' | 'blocked_safety' | 'validation_failed' | 'engine_error',
  intent,
  reply: { text_th, text_en?, flex?, quick_replies? },
  silent?: boolean,          // the engine ran fine but wrote nothing for her
  artifacts: {
    plan?:  { plan_id, week_number, status, volume_total_sets,
              delta_vs_prev_pct, why_th, why_en },
    venue?: { partner_id, name, area, price_tier, vetted, lat, lng,
              note, note_en, match_reasons, match_reasons_en },
    flags?: SafetyFlag[]
  },
  trace: {
    engine, tool_calls[], validator_runs[], retries,
    fallback_used: 'none' | 'template_plan' | 'mock_engine' | 'maps_fallback',
    usage: { input_tokens, output_tokens, ms }
  }
}
```

`silent` matters: a run can legitimately end having only called a tool, leaving
no final text. That is **not** a failure and must not render as one — it produces
a short acknowledgement, and only a genuine failure shows an error. But the
caller is told, because a filler line is not an answer to anything.

### 6.2 Rendering

The router converts `CoachResult` into surface-neutral `AgentMessage[]` — text in
both languages plus a typed card (`plan`, `checkin`, `venue`, `handoff`,
`mock_list`). `line/adapter.ts` renders those as Flex; the web app renders the
same cards with its own React components. **Neither format leaks into the
router**, so a change to the flow lands on both surfaces at once.

### 6.3 The why-line

Every plan carries one, in both languages. It is required to **reference
something she actually said** — generic why-lines are treated as a failure. From
the live run: *"สัปดาห์แรกเน้นเรียนรู้ท่าเสริมหลังและขา เพื่อให้อุ้มลูกได้สบายขึ้นค่ะ"*, tied directly to
the reason she gave in her very first message.

### 6.4 Events written (the audit trail)

`joined` · `safety_warning` · `red_flag_handoff` · `plan_created` ·
`plan_replanned` · `plan_rejected` (with every error code) ·
`template_fallback_used` · `checkin_recorded` · `venue_recommended`

Plus a `usage` row per request (engine, input tokens, output tokens), exposed at
`GET /api/usage`.

### 6.5 Reply clamping

`clampReply()` is a last-resort guard at LINE's **4,900**-character ceiling, and
prefers a sentence end, then a word break. It used to sit at 500, which silently
chopped ordinary replies mid-word and read as the agent breaking off
mid-sentence. **Reply brevity is a prompt concern, not a validator one.**

---

## 7. The three engines

All LLM usage goes through one interface — no exceptions:

```ts
interface CoachEngine {
  readonly name: EngineName;
  run(req: CoachRequest, tools: CoachTools): Promise<CoachResult>;
}
```

### `AgentSdkEngine` — local live demo

Claude Agent SDK driving the logged-in `claude` CLI on **subscription auth** — no
API key, no per-token billing. The five FitHer tools are exposed as in-process
SDK MCP tools, and **all built-in Claude Code tools are disabled** (`tools: []`),
so the agent has exactly those five and no filesystem access.

Token accounting sums `input_tokens + cache_creation_input_tokens +
cache_read_input_tokens`. Reading `input_tokens` alone reports 3–4 tokens for a
turn that actually consumed thousands, because the large stable system prompt is
nearly always a cache hit — and `/api/usage` was then off by orders of magnitude.

Failure subtypes are logged, never swallowed. `error_max_turns` gets an
actionable message — *"send that again and I will pick up where I left off"* —
rather than a generic apology.

### `ApiEngine` — hosted with a key

Direct Anthropic API on `claude-haiku-4-5` (the cheapest current model; override
with `ANTHROPIC_MODEL`). A **manual agentic loop**, not the beta tool runner, so
retry accounting, the `max_tool_calls` budget and trace capture stay under our
control and out of a beta dependency. `stop_reason: 'refusal'` maps to
`blocked_safety`. Rate limits, connection faults and hard 4xx get distinct
user-facing messages.

### `MockEngine` — zero tokens

Not a stub: it drives the **same tools and the same validator**, and it simulates
the agentic onboarding too — reading her sentences, calling `save_profile`,
asking about what is missing. Extraction is keyword-based rather than a model, so
a hosted demo still accepts typed answers and still gets a real, validated plan.

It also has to be a real product surface, because hosted mode runs on it and
every hosted visitor hits whatever it says. So `freeform` answers **from actual
state** — her next session, her tone, her own stated reason — and covers the four
things beginners type most: *I'm tired*, *what should I do today*, *what should I
eat*, *I don't feel like it*. It never tells her to type a magic phrase.

### Engine registration

Only `engine/node-engines.ts` registers the Agent SDK, and every Node entry point
calls it. Asking the **portable** factory for `agent-sdk` **throws** rather than
quietly substituting `MockEngine`. This is deliberate: see §8.5.

---

## 8. What the live runs found

Every one of these was a defect in this codebase, not in the model. They are the
most useful part of this document.

### 8.1 Four `save_plan` attempts, every one rejected

The first real Agent SDK run failed badly: four attempts, every model attempt
rejected, the template fallback shipped the plan. Three causes:

1. **Misleading error codes.** A *missing* `reps` field was reported as
   `REPS_OUT_OF_RANGE`, so the fix hint said "use 3–20 reps" when the real problem
   was an absent field — sending the model after the wrong thing and burning a
   retry.
2. **No coercion of harmless slips.** The plan arrived as a JSON string with
   `day: "Monday"`. Both trivially normalisable; both hard failures.
3. **The load-note rule policed formatting, not safety.** It rejected
   `"10 นาที ชัน 3%"` — a perfectly gradual note — because the allowlist only
   matched single forms.

**Fixes:** range codes fire only on genuine range violations; `coercePlan`
normalises JSON-strings, day aliases and missing load notes (but deliberately
**not** a numeric `day`, which is ambiguous and still fails loudly); the
load-note rule accepts composed notes and denies jump phrases; and the system
prompt carries a worked `PLAN_FORMAT` example.

**Result: 4 attempts → 1, passing first try. Output tokens 3,977 → 1,645 (−59%),
wall clock 44 s → 24 s, no fallback.**

The missed-week beat still takes one legitimate rejection
(`VOLUME_NOT_REDUCED_AFTER_MISSED_WEEK`) and then self-corrects — that is the
validator visibly doing its job, and it demos well.

### 8.2 The gym beat fell through to an unvetted result

The agent searched `area: "ลาดพร้าว"` while the partners table stores
`"Ladprao"`, so the exact match found nothing and it fell through to an
*unvetted* Maps result — even though a vetted Ladprao gym exists. The agent
followed the protocol correctly (search first, fall back only on zero results,
label it clearly); **the data layer was at fault.**

**Fix:** `normaliseArea()` maps Thai district names to the canonical English one
and tolerates "แถวลาดพร้าว"; a zero-result area search widens to any vetted
partner before the agent can reach for the fallback.
**Result: 2 tool calls → 1, the correct vetted venue, input tokens 7,880 → 3,877.**

### 8.3 The safety gate blocked her opening line

Her first message was *"อยากแข็งแรงขึ้นค่ะ อุ้มลูกแล้วปวดหลังตลอด"* — "I want to
get stronger, carrying my kid always hurts my back." The red-flag scan matched
"ปวด" and **blocked onboarding on her very first message.** A generic ache is the
single most common reason a beginner starts training at all; blocking there made
the product unusable.

**Fix:** a context split, not a weakening. `warn_intents` per rule — a generic
ache *warns* during `onboard` (logged, and surfaced to the agent with
instructions to acknowledge it, avoid loading that area, and say to stop and see
a professional if it worsens) while still *blocking* at check-in, where the same
words mean she got hurt training. Injury, dizziness, pregnancy, chest symptoms
and distress block in every context. **Nine tests pin this down.**

### 8.4 The one that actually broke the demo

The plan step failed every single time with `UNKNOWN_EXERCISE_ID` on IDs that
plainly exist — `ex_bw_glute_bridge`, `ex_tm_walk_incline`.

`CoachRequest.library` is built **once**, at the start of the turn, by filtering
the catalogue against her equipment. On the turn she *finishes onboarding*, that
snapshot was taken **before** `save_profile` recorded her equipment — so it was
**empty**. The model was handed no valid IDs, invented plausible ones, and the
validator rejected all of them against the same empty list. Three retries, then a
template fallback that also had nothing to build from. The user-visible result
was a generic "ระบบขัดข้องชั่วคราว".

**Fix, in the three places that trusted the snapshot:** `save_plan` and the
template fallback rebuild the filtered library from the user row as it is *now*,
and `get_user_state` returns `exercise_library` as the authoritative list. The
prompt tells the agent that reply wins over the snapshot, and to never invent an
ID.

Two more fell out of the same run:

- **`maxTurns` was wired to `max_tool_calls` (6)**, but the Agent SDK spends a
  turn per tool round-trip, so `save_profile → get_user_state → save_plan` plus
  retries ran out of turns mid-plan. Now a separate `max_turns: 20`.
- **The engine swallowed the failure subtype entirely**, which is why none of
  this was diagnosable. It now logs the subtype and turn count.

### 8.5 The scripts were never running the engine they reported

Only `src/node.ts` called `registerEngineFactory`, so
`COACH_ENGINE=agent-sdk npm run sim:onboard` fell through to the portable
factory, got `MockEngine`, and printed `engine=agent-sdk` on every line **while
running the keyword engine**. Two days of "the AI gives weird answers" were the
keyword engine wearing the AI's name tag.

**Fix:** registration lives in `engine/node-engines.ts`, every Node entry point
calls it, and asking the portable factory for `agent-sdk` **throws** instead of
quietly substituting. *A wrong answer you can see beats a wrong answer you
cannot.*

### 8.6 Smaller ones, same run

- **The agent narrated instead of speaking.** One turn shipped *"I have all the
  required info now and will wait for her response… Let me wait for her reply"*
  straight into the chat bubble. Everything the agent writes is sent verbatim, so
  the prompt now says exactly that, and bans third-person, intention-announcing
  and tool-name-dropping replies.
- **Onboarding ended one turn too early** — see §1.1.
- **A silent success rendered as a failure** — see §6.1.
- **A silent turn could strand her one message short of a plan.** The turn that
  completes her profile is the one the agent is most likely to end without text,
  and the template fallback sat out because it judged "still onboarding" from the
  state at the *start* of the turn. It now judges from the state after it.

---

## 9. Design principles, stated plainly

1. **Safety is never a model decision.** It is a rule, it runs first, and it
   costs nothing. A keyword filter that runs before the model has a property no
   model has: it cannot be talked out of it.
2. **Prevention over detection.** The library is pre-filtered and injected, so an
   unusable exercise is near-impossible rather than merely caught afterwards.
   Exercises are referenced by ID only.
3. **The model never does arithmetic that has a right answer.**
   `volume_ceiling_sets` is computed in code and handed over.
4. **Never read a fact out of the model's text.** Reconcile from the tool layer.
5. **Every rejection is logged.** Failure modes are inspectable rather than
   invisible.
6. **A visible wrong answer beats an invisible one.** A missing engine
   registration throws; it does not silently substitute.
7. **The user always gets a safe plan, never an apology.** That is what the
   template fallback is for.
8. **Rules live in data, not code.** `rules.json` is editable without touching
   TypeScript.
