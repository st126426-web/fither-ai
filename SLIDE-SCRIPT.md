# FitHer AI — Speaker Script

Slides 7 and 8 · `06 • PRODUCT + HER JOURNEY` → `07 • AI AGENT FLOW`
Read straight through. About four minutes, including the live beat on slide 8.

---

## Slide 7 — `06 • PRODUCT + HER JOURNEY`

Two surfaces.

The LINE bot is where she already is. No download, no login — because she opens
LINE forty times a day anyway.

The web app is for the things a chat window is bad at. Marking a session done.
Swapping Tuesday for Thursday. Editing her profile.

The third card is the engineering claim, and it's the one I'd defend hardest.
These are not two products. One router is the only conversation logic in the
system. Both surfaces read the same state, and both pass the same safety gate.
She can start onboarding on LINE, get interrupted, and finish in the web app
mid-flow — because there is no LINE version of her to get out of sync.

Two choices you can see the moment you open it. She is greeted, not
dashboarded — her goal, her streak, and the one session she actually has to do
next. And every session carries its own why-line, so the plan explains itself
instead of issuing orders. That's what makes it read as a coach rather than a
spreadsheet that learned to talk.

It's Thai-first and English-complete. The toggle switches every string — the
interface, the seeded content, the venue notes, and the coach's own sentences.
Not an English product with Thai bolted on afterwards. For a product aimed at
Thai women, getting that backwards would have been the whole failure.

The numbers in the middle are measured from the working prototype, not
projected. Forty-two exercises, filtered to the equipment she actually owns. Two
complete languages. A hundred and six automated safety tests. Zero unsafe plans
shipped.

And at least twenty percent — that's the volume cut after a fully missed week.
It's a floor the validator enforces on every re-plan, not a number we happened
to get once.

Along the bottom is her journey. Four beats. Intake, in her own words. A first
plan that's beginner-safe by construction. Then a missed week — one session out
of three, sleep low. And then the beat that matters: the re-plan. Volume down,
no guilt language, and a venue when she's ready for one.

One honest boundary. Those four beats and the safety handoff all run end to end.
Meals, coaches and communities are staged.

There's a QR in the corner — don't reach for it yet. I'll leave it up at the end
and you can try to break it yourselves.

Now the part this course is actually about: what happens between her message and
the reply.

---

## Slide 8 — `07 • AI AGENT FLOW`

Follow it left to right.

Her message arrives. Free text, Thai or English, from either surface.

Before it reaches any model, it hits Gate one. A deterministic red-flag scan —
keyword and pattern rules, no model, zero tokens. If she mentions chest pain, or
dizziness, or bleeding, plan generation is blocked before a single token is
spent, and she is handed to a human coach.

I want to be precise about why that ordering matters. We did not ask the model to
be careful. We made it structurally unable to answer.

In the middle, the agent does the actual reasoning — with exactly five tools, and
a ceiling of eight tool calls.

get_user_state reads her profile and, importantly, the exact limits the validator
is about to enforce. So the model can see the rules it's being held to.

save_profile normalises and enum-checks every field.

save_plan validates before it stores.

search_partners returns beginner-vetted partner gyms.

And maps_fallback fires only when that one comes back empty. Everything it
returns is marked unvetted, in her reply and in the database. We would rather
tell her we haven't checked this one than quietly pass a Maps result off as
vetted.

Then Gate two. The plan validator — volume, duration, load. If the plan fails,
the agent is told why, and retries. At most twice. If it still fails, we ship a
rule-built template plan instead. She always gets a safe plan. She never gets an
apology.

Two things I'd flag as the real design decisions.

First. Everything factual comes out of the tool layer, not out of the model's
text. The saved plan, the venue, every validator run. So the agent physically
cannot claim a plan it did not save.

Second. Safety is never a model decision. It's a rule, it runs first, and it
costs nothing.

Rather than take my word for any of that — let me run the beat that matters,
right now, on this slide.

*(Tap* **สัปดาห์นี้ไม่ได้ทำเลย** *— "missed the whole week". Leave this slide up. ~23 seconds.)*

While that's thinking — it is calling save_plan right now, and the validator is
about to check what comes back. If the volume isn't at least twenty percent down
on the week she missed, it gets rejected, told why, and made to try again.

*(When it lands.)*

There. Thirty sets down to twenty-four. Twenty percent, and not a word of guilt
in it — because guilt language is one of the thirteen things that validator
rejects.

That is the product. Everything else is scaffolding that makes that one step
possible.

---

## Before you walk on

```
npm run demo:reset          # profile re-seeded, no plans
npm run dev:local
# send one message: ขอแผนสัปดาห์นี้หน่อยค่ะ   → Week 1 saved, ~26 s
```

That parks her exactly at the check-in, so slide 8's live beat is one tap. Do it
before the session, not between slides. If the live path dies,
`COACH_ENGINE=mock npm run dev:local` gives the same beat with no latency.

---

## If a question goes technical

The appendix is A1 to A5, after the closing slide:

| | |
|---|---|
| **A1** | Architecture — one spine, three engines, two runtimes, 9,219 lines |
| **A2** | The five tool contracts and their typed schemas |
| **A3** | Gate 1 — the red-flag scanner, and how it avoids Thai false positives |
| **A4** | Gate 2 — the thirteen rejection codes and the retry ladder |
| **A5** | 106 tests, the measured numbers, and why we wrote code |

If someone asks why this isn't a no-code workflow: **A5**. The short answer is
that a workflow canvas wires API calls together, and it does not give you a typed
tool boundary, a gate that runs before the model, a validator that can reject a
result and force a retry, or a test suite that proves any of it.
