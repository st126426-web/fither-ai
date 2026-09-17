# FitHer AI — Speaker Script

**Deck:** `FitHer AI - deck v2.pptx` · **Slides 6–10** · Group 7, AI Foundations for Business and Society
**Runtime:** ~5 min 30 s for this block · **Prepared:** 2026-09-17

> **Numbering note.** Your ask said "slides 6–9". In the deck's actual display
> order that range is `05 • SOLUTION` → `08 • PROTOTYPE DEMO`. The four slides
> built yesterday are the ones at positions **7–10** (`06 • PRODUCT` →
> `09 • WHAT SHE ACTUALLY SEES`). This script covers **6 through 10** so both
> readings are served. Drop slide 6 or 10 if you need the time back.

---

## Slide 6 — `05 • SOLUTION`
### "FitHer AI is a coach, not a content library"
**Target: 50 s** · On screen: the five-step loop — intake → first plan → check-in → re-plan → venue match

> Everything before this slide was the problem. This is the first slide where you
> assert. Say the headline as a claim, not a description.

**Say:**

"Everything you've seen so far is a content problem. This is where we stop
solving a content problem.

The loop is five steps. A three-minute intake — goal, schedule, equipment, level,
life stage. A first plan that is beginner-safe by construction. A weekly
check-in: what she actually completed, how hard it felt, how she slept. Then the
step that matters — a re-plan. And when her confidence is ready, not before, a
venue match to a beginner-friendly gym.

Four of those five steps exist in every fitness app on the market. The fourth one
is the product. Sweat will give Mind a better library than we ever will. What
Sweat will not do is notice that she trained once in three weeks and rebuild the
next four weeks around that fact.

Our killer feature is one sentence: **adaptive weekly re-planning after real-life
disruption.** Everything else on this slide is the scaffolding that makes that
one step possible."

**Transition:** "So that's the loop. Here's what it actually runs on."

---

## Slide 7 — `06 • PRODUCT`
### "One coach, two surfaces, one conversation spine"
**Target: 70 s** · On screen: three columns (LINE / web app / spine) + five proof stats

> The temptation here is to read all twelve bullets. Don't. Name each column in
> one line, then spend your time on the stat row — that's the part that is hard
> to fake and easy to remember.

**Say:**

"Two surfaces. The LINE bot is where she already is — no download, no login,
because she opens LINE forty times a day anyway. The web app is for the things a
chat window is bad at: marking a session done, swapping Tuesday for Thursday,
editing her profile.

The middle column is the engineering claim, and it's the one I'd defend hardest.
These are not two products. One router is the only conversation logic in the
system. Both surfaces read the same state and pass the same safety gate. She can
start onboarding on LINE, get interrupted, and finish in the web app mid-flow —
because there is no 'LINE version' of her to get out of sync.

The numbers along the bottom are from the working prototype, not projections.
Forty-two exercises, filtered by the equipment she actually owns. Two languages,
Thai-first and English-complete — every string, including the coach's own words.
Seventy-four automated safety tests. Zero unsafe plans shipped.

And the one in the middle — **minus twenty-two point two percent** — is the
volume drop after a fully missed week. That is the re-plan from the last slide,
as a measurable number.

I'll be honest about the boundary: onboarding, first plan, missed-week re-plan,
gym match and the safety handoff all run end to end. Meals, coaches and
communities are deliberately staged mocks. We built the spine, not the skin."

**Transition:** "That's what she sees. Now the part this course is actually about —
what happens between her message and the reply."

---

## Slide 8 — `07 • AI AGENT FLOW`
### "One agent, four tools, two deterministic gates"
**Target: 90 s** · On screen: left-to-right flow with GATE 1 and GATE 2 bracketing the agent

> **This is the slide the course is graded on.** It is the longest for a reason.
> Walk the diagram left to right with your hand or the pointer — do not jump
> around. The argument is: *the model reasons, but it is never trusted with
> safety or arithmetic.*

**Say:**

"Follow it left to right.

Her message arrives — free text, Thai or English, from either surface.

Before it reaches any model, it hits **Gate 1**: a deterministic red-flag scan.
Keyword and pattern rules, no model, **zero tokens.** If she mentions chest pain,
or dizziness, or bleeding, plan generation is blocked *before a single token is
spent* and she is handed to a human coach. I want to be precise about why that
ordering matters: we did not ask the model to be careful. We made it structurally
unable to answer.

In the middle, the agent does the actual reasoning, with exactly four tools and a
ceiling of eight tool calls. `get_user_state` reads her profile and — importantly
— the exact limits the validator will enforce, so the model can see the rules
it's being held to. `save_profile` normalises and enum-checks every field.
`save_plan` validates before it stores. `search_partners` returns vetted gyms,
with Maps as fallback.

Then **Gate 2**: the plan validator. Volume, duration, load. If the plan fails,
the agent gets told why and retries — at most twice. If it still fails, we ship a
rule-built template plan instead. The user always gets a safe plan; she never
gets an apology.

Two things I'd flag as the real design decisions. First: everything factual —
the saved plan, the venue, every validator run — is read back out of the tool
layer, not out of the model's text. So the agent physically cannot claim a plan
it did not save. Second: **safety is never a model decision.** It's a rule, it
runs first, and it costs nothing."

**Transition:** "Rather than take my word for any of that — here it is running."

---

## Slide 9 — `08 • PROTOTYPE DEMO`
### "One complete journey — live, on your own phone"
**Target: 60 s of talking** (plus live demo time — budget 2 min more)
On screen: QR + the four beats — intake → first plan → missed week → re-plan + venue

> **Get the QR up and stop talking for five seconds.** Let people scan. The
> silence feels long to you and normal to them. See the delivery notes below
> before you run this — there's one honesty point that matters.

**Say:**

"Please scan that now — it opens in the browser, no install, no login.

While you're getting in, here's what we're going to do. Four beats.

One — intake. Tone and strength, forty-five minutes, dumbbells. That's her whole
setup.

Two — the first plan comes back. Monday lower body, Wednesday upper, Friday full
body.

Three — and this is the beat that matters — I'm going to tell it she had a bad
week. One session out of three. Sleep low, soreness high. This is the moment the
app in Mind's real story did nothing, and she quit three weeks later.

Four — watch the plan change. Volume comes down, lower body moves, and it
recommends a studio when she's ready for one.

A course MVP doesn't need a full app. It needs one complete journey that actually
runs. This is ours."

**Demo success condition:** the audience scans, and then *watches the plan change
after disruption.* If you only have time for one beat, do beat three.

---

## Slide 10 — `09 • WHAT SHE ACTUALLY SEES`
### "Not a mockup — the running prototype"
**Target: 50 s** · On screen: Home and Plan screenshots + the language toggle

> Closing slide of this block. Land the Thai-first point — in this course,
> that's the bias/accessibility argument, and it scores.

**Say:**

"These are screenshots, not a design file. This is the thing you just had open.

Two deliberate choices. First, she's greeted, not dashboarded. Her goal, her
streak, and the one session she actually has to do next. No wall of charts to
decode before she knows what to do today.

Second, every session carries its own why-line. Week one is thirty sets across
three days — but next to each one it says *why* it's that and not something else.
The plan explains itself instead of issuing orders. That's what makes it feel
like a coach rather than a spreadsheet that learned to talk.

And the toggle in the corner switches everything — interface, seeded content,
venue notes, and the coach's own sentences. Thai-first, English-complete. Not
an English product with a Thai translation bolted on. For a product aimed at Thai
women, getting that backwards would have been the whole failure."

**Transition into slide 11 (`10 • REVENUE MODEL`):** "So that's the product and
it runs. The obvious next question is whether anyone pays for it."

---

## Delivery notes

**1. The QR gives the audience the *mock* build — the laptop is the live one.**
This is the one place where an offhand claim could get you caught. The hosted
build at `st126426-web.github.io/fither-ai` runs the keyword engine, because the
Agent SDK drives the local `claude` CLI as a subprocess and Cloudflare Workers
has no Node, no filesystem and no login — it *cannot* run hosted. So:

- Safe phrasing: *"the running prototype"*, *"the real flow, real plan data"* — all true of the hosted build.
- Avoid: *"that's live AI on your phone right now."* It isn't.
- If you want live AI in the room, drive **beat three from your laptop** on the
  projector and let the phones follow along. That's the intended demo path, and
  it's what's running right now.

**2. Live AI has ~10 s of latency.** A real agent turn measured just now took
**10.2 seconds** (199 output tokens). That is a very long silence on stage. Fill
it deliberately — that's exactly where the slide 8 recap fits: *"while that
thinks — remember, it's calling save_plan, and the validator is about to check
it."* Don't stare at the screen.

**3. If the live path fails mid-demo,** `COACH_ENGINE=mock npm run dev:local`
gives you the identical journey with zero LLM calls and no latency. The audience
cannot tell the difference in the four beats you're showing. Have that terminal
open on a second tab before you start.

**4. Reset before you present:** `npm run demo:reset -- --onboarding` puts Mind
back to step zero. If you skip this, she already has a plan and the agent will
talk about *that* instead of onboarding — which reads as a broken demo.

The reset now survives a server restart, and the server prints the state it will
open in, so you can check it off the screen instead of finding out in front of
the room:

```
  FitHer AI — mode=local engine=agent-sdk storage=sqlite(./data/fither.db)
  Demo state onboarding — she will be asked the first question
```

If that line says *already onboarded*, run the reset and reload. For the hosted
build the equivalent is `curl -X POST https://fither-ai.fither.workers.dev/api/demo-reset/mind`.

---

## Likely questions

**"Isn't the safety gate just a keyword filter? That's not AI."**
Correct, and that's the design. A keyword filter that runs before the model has a
property no model has: it cannot be talked out of it, and it costs nothing. We
use the model where judgment helps and rules where judgment is a liability.

**"What stops the model inventing a plan it didn't save?"**
Structurally, nothing in the *text* — so we don't read the text. Every factual
field in the response is read back out of the tool layer. If `save_plan` didn't
run, there is no plan in the reply, regardless of what the model wrote.

**"Why LINE instead of an app?"**
Download and login are where beginner fitness funnels die. She has LINE open
already. The web app exists for what chat is bad at, and it's still no-login.

**"Why only 42 exercises?"**
Because they're equipment-filtered and beginner-vetted. The constraint isn't
catalogue size — it's whether the next session is safe with the two dumbbells
she actually owns.

**"−22.2% — is that tuned to look good?"**
It's the validator's output for a fully missed week against the pilot rule of at
least a 20% reduction. It's a rule firing, not a number we picked.
