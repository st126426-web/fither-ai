# Deploying FitHer AI

Two halves, deployed separately:

- **Worker** (Cloudflare) — the API, the LINE webhook, the database.
- **Web app** (GitHub Pages) — the landing page and the five tabs, calling the Worker.

Everything below fits in free tiers. Budget about 30 minutes for the first run.

> **The one thing to decide first:** the hosted Worker runs `MockEngine` by
> default — zero tokens, always up, and the whole demo story works. The Agent
> SDK **cannot** run hosted (it drives the `claude` CLI as a subprocess), so
> hosted "real AI" means an API key and per-token cost. See step 6.

---

## 0. Decide: public or private repo

| | GitHub Pages | Cloudflare Pages |
|---|---|---|
| Public repo | free | free |
| Private repo | needs a paid GitHub plan | free |

If you want a private repo, host the web app on **Cloudflare Pages** instead of
GitHub Pages and skip step 5 — see *Alternative* at the bottom.

There are no secrets in the repo: `.gitignore` covers `.env`, `.dev.vars`, the
SQLite files and `data/`. Tokens live in GitHub Secrets and `wrangler secret`.

---

## 1. Put it on GitHub

```bash
git init
git add .
git commit -m "FitHer AI prototype"
git branch -M main
git remote add origin https://github.com/<you>/fither-ai.git
git push -u origin main
```

---

## 2. Create the Cloudflare D1 database

```bash
npx wrangler login                    # opens a browser once
npx wrangler d1 create fither
```

It prints a `database_id`. Put it in `server/wrangler.toml`, replacing
`REPLACE_WITH_YOUR_D1_ID`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "fither"
database_id = "the-uuid-it-printed"
```

Apply the schema:

```bash
npm run -w server d1:init
```

---

## 3. Deploy the Worker

```bash
npm run deploy:worker
```

It prints a URL like `https://fither-ai.<your-account>.workers.dev`. Check it:

```bash
curl https://fither-ai.<your-account>.workers.dev/health
# {"ok":true,"mode":"hosted","engine":"mock",...}
```

The partner venues seed themselves on the first request.

---

## 4. Point the web app at the Worker

In the GitHub repo: **Settings → Secrets and variables → Actions → Variables**

| Name | Value |
|---|---|
| `VITE_API_BASE` | `https://fither-ai.<your-account>.workers.dev` |
| `VITE_DEMO_POLISH` | `true` to hide the "coming soon" toasts for screenshots, else omit |

**You can stop here.** Deploying the Worker with `npm run deploy:worker` from
your machine uses your own `wrangler login`, so no Cloudflare credentials need
to go into GitHub at all.

Only if you want the Worker to redeploy automatically on every push, add these
**Secrets** as well — otherwise the *Deploy server* workflow will fail, which is
harmless but noisy:

| Name | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → *Edit Cloudflare Workers* template |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami`, or the Workers & Pages sidebar |

---

## 5. Turn on GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

Then push, or run the *Deploy web to GitHub Pages* workflow manually. It builds
with `BASE_PATH=/<repo>/` so the asset URLs resolve on a project page.

Your app: `https://<you>.github.io/fither-ai/`

---

## 6. Optional — real AI on the hosted version

Skip this and the hosted app answers with the keyword engine. It costs nothing
and never breaks.

To use a real model hosted:

```bash
npx wrangler secret put ANTHROPIC_API_KEY     # paste your key
```

Then set `COACH_ENGINE = "api"` in `server/wrangler.toml` `[vars]` and redeploy.

- Model: `claude-haiku-4-5` — roughly a cent a message.
- `API_DAILY_CALL_CAP` (default 50) auto-falls back to mock when hit, so a
  shared link cannot run up a bill. Raise it in `[vars]` if you need to.
- Without the secret the Worker **forces mock regardless of `COACH_ENGINE`**, so
  a misconfiguration cannot silently start billing.

---

## 7. Optional — LINE

Only needed for the bot half. Full walkthrough in the README under
**Setting up LINE**. The short version once you have a channel:

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npm run deploy:worker
```

Webhook URL: `https://fither-ai.<your-account>.workers.dev/webhook/line`

Hosted means **no tunnel and no laptop** — the URL is stable, so you set it once.

---

## Day-to-day

| | |
|---|---|
| Push to `main` touching `web/**` | Pages redeploys |
| Push touching `server/**` | typecheck + tests run, then the Worker deploys |
| Reset the hosted demo | `POST /api/demo-reset/mind`, or *Delete my data* in Profile |
| Check spend | `GET /api/usage` |

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Worker 500 on every request | Schema not applied — run `npm run -w server d1:init` |
| Web app loads but every live tab is empty | `VITE_API_BASE` unset or wrong; it is baked in at build time, so set the variable and re-run the Pages workflow |
| Blank page on Pages | `BASE_PATH` mismatch — the workflow sets it from the repo name; a custom domain at the root needs `BASE_PATH=/` |
| Worker deploy fails on bundle size | Something Node-only got imported into shared code. The Agent SDK is deliberately registered only in `src/node.ts` — keep it out of `engine/index.ts` |
| Hosted chat gives keyword answers | Expected on mock. See step 6 |

---

## Alternative: everything on Cloudflare (works with a private repo)

Deploy the Worker as above, then for the web app:

```bash
npm run -w web build
npx wrangler pages deploy web/dist --project-name fither-web
```

Set `VITE_API_BASE` before building (`$env:VITE_API_BASE="https://…"` in
PowerShell). Build with the default `BASE_PATH` — Cloudflare Pages serves from
the root, so no repo-name prefix is needed.
