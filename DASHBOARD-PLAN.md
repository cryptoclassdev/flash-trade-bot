# DASHBOARD-PLAN.md

> Canonical plan for the guided self-host dashboard. Supersedes `LEVEL3-PLAN.md` (see `PRD.md` section 13 for the scope-change rationale).
>
> Last updated: 2026-04-24.

---

## 1. Summary

We are building a **web dashboard at `flashtradebot.xyz`** that does two jobs for the existing Railway-template bot:

1. **Guided setup wizard** — walks a new user through wallet generation, funding, Helius, Telegram, strategy params, Railway deploy, and TradingView alert creation. Replaces the README walkthrough with a UI.
2. **Live status page** — displays the user's deployed bot's current state (balance, positions, PnL, halt, last signal) without requiring them to read Railway logs.

The dashboard is a **thin client**. No user accounts, no database on our side. User setup data lives in their browser's `localStorage`. Dashboard polls their own Railway bot directly for status.

### Product framing

- **Target user**: a technical-but-not-expert trader who wants automation on their own wallet without reading a README.
- **We do not hold keys.** Zero custody. Zero regulatory surface.
- **We earn zero.** v1 monetization path is TBD (possible referral kickbacks from Helius/Railway, or later a hosted managed-mode upgrade).
- **The bot itself does not change in structure.** Same single-tenant Railway template. The dashboard is an onboarding + observability layer on top.

### Success criterion (decided before building)

**200 dashboard-completed signups in the first 30 days after public launch, or we pivot to managed Telegram bot.** Measured by funnel completion (reached the "Status" screen at least once). This is a hard stop — we don't keep polishing the dashboard past 30 days if the data says no.

---

## 2. Non-goals for v1

The following are explicitly **out of scope** for the dashboard v1:

- User accounts / login (dashboard is fully stateless, localStorage only)
- Managed execution (we do not run strategies on user behalf yet)
- Multi-wallet per browser
- Strategy library beyond RSI Divergence on BTC
- Billing / payments
- Email or SMS notifications (Telegram only)
- Mobile app (responsive web only)
- Backtesting UI
- Strategy builder / Pine editor
- Non-Solana chains
- Markets other than BTC (for now)

Anything outside this list requires a PRD update before work starts.

---

## 3. User journey — nine screens

Screen-by-screen spec. Source of truth for the UI implementation.

### Screen 0 — Landing (`/`)

- **Headline**: "Run automated Solana perps trading on your own wallet."
- **Sub**: "~30 min to set up. Needs USDC on Solana + TradingView Pro+. You keep your keys."
- **Primary CTA**: "Start setup" → `/setup/wallet`
- **Secondary**: "I already deployed — show my status" → `/status` (prompts for Railway URL if not in localStorage)
- **Trust markers**: link to GitHub repo, link to `DISCLAIMER.md`, link to `SECURITY-NOTES.md`

### Screen 1 — Generate wallet (`/setup/wallet`)

- **Primary path**: big "Generate new trading wallet" button → `Keypair.generate()` client-side.
- **Output**:
  - Public address with QR code
  - Private key (base58) behind a "Reveal" button with copy-to-clipboard
  - "Download backup" button saves `wallet-backup.txt` with pubkey + privkey
- **Warning** (red, prominent): "This key controls your funds. We never see it and cannot recover it."
- **Confirmation gate**: checkbox "I've saved my private key somewhere safe" → enables "Continue"
- **Advanced toggle**: "Use existing wallet" → paste private key (base58). Required extra confirmation acknowledging compromised-bot = full-wallet drain risk.

### Screen 2 — Fund wallet (`/setup/fund`)

- **Shows**: pubkey QR + copyable address
- **Solana Pay URL**: `solana:<pubkey>?amount=50&spl-token=<USDC-MINT>` — clicking opens Phantom/Solflare/Backpack with tx pre-filled
- **Warning**: "USDC must be on the **Solana network**. Not Ethereum, not Polygon, not Arbitrum."
- **Minimums**: 50 USDC + 0.05 SOL (configurable; derived from default strategy params)
- **Balance check**: "Check balance" button polls a public RPC, shows live SOL + USDC balance, green checkmark when funded
- **Skip allowed**: user can proceed under-funded with a warning

### Screen 3 — Helius RPC (`/setup/rpc`)

- **Explanation**: "The bot needs a reliable Solana RPC. Public endpoints rate-limit under load. Helius free tier handles this strategy fine."
- **CTA**: "Open Helius signup" (link, optionally referral)
- **Screenshots**: sign up → Dashboard → Create Endpoint → Mainnet → Copy URL
- **Input**: "Paste Helius mainnet URL here" (expects `https://mainnet.helius-rpc.com/?api-key=...`)
- **Test button**: makes `getSlot` call, confirms non-empty response, green checkmark
- **Optional**: second Helius URL as fallback

### Screen 4 — Telegram bot (`/setup/telegram`)

- **Step 1**: "Create a bot with BotFather" — link to `https://t.me/BotFather`, instructions to `/newbot`, paste token into form
- **Step 2**: "Start a chat with your new bot (send any message)"
- **Step 3**: "Fetch chat ID" button → client-side fetch to `https://api.telegram.org/bot<TOKEN>/getUpdates`, auto-extracts numeric chat ID from the latest message
- **Test button**: sends a test message to the chat, user confirms they received it

### Screen 5 — Strategy parameters (`/setup/strategy`)

- **Strategy dropdown**: RSI Divergence BTC (only option for v1)
- **Asset**: BTC (locked for v1)
- **Collateral per trade (USDC)**: slider 10-500, default 20
- **Leverage**: slider 1-10, default 2
- **Max daily loss (USDC)**: slider 5-100, default 15
- **Summary**: "You'll trade ~$40 notional per signal. Bot halts automatically if you lose $15 in a UTC day."
- **Advanced** (collapsed): slippage bps, retry count, priority fee tip

### Screen 6 — Deploy to Railway (`/setup/deploy`)

- **Checklist of everything collected so far** — one green checkmark per completed step
- **Primary CTA**: "Deploy on Railway" — a Railway template URL with ALL env vars pre-populated as query params
- User clicks → Railway opens with fields filled → they click "Deploy" → Railway provisions the bot
- **Waiting state**: "Waiting for your bot to come online..." with a "paste your Railway domain when it's up" field
- **Verification**: dashboard hits `https://<their-domain>/health`, confirms 200 OK + correct wallet pubkey match

### Screen 7 — Wire up TradingView (`/setup/tradingview`)

- **Download**: "Download Pine script" button — serves the Pine file with user's `WEBHOOK_SECRET` pre-filled as the `input.string()` default value
- **Webhook URL**: `https://<their-domain>/webhook` (copy button)
- **Step-by-step screenshots**:
  1. Open a BTCUSD chart in TradingView
  2. Open Pine Editor (bottom panel)
  3. Paste the downloaded script, Save, Add to chart
  4. Inputs dialog appears — the `WEBHOOK_SECRET` is already filled; just click OK
  5. Click ⏰ (Create Alert)
  6. Condition: your strategy → "alert() function calls only"
  7. Notifications tab: Webhook URL → paste the bot webhook URL
  8. Click Create
- **Confirmation checkbox**: "I've created the alert" → "Finish setup"

### Screen 8 — Status (`/status`)

The dashboard users land on for every subsequent visit. Auto-refresh every 15s.

```
┌──────────────────┬──────────────────┬──────────────────┐
│ WALLET           │ POSITIONS        │ TODAY            │
│                  │                  │                  │
│ $127.43 USDC     │ BTC Long         │ +$2.15           │
│ 0.082 SOL        │ Size: $40        │ 2 trades         │
│                  │ Entry: $77,521   │                  │
│                  │ PnL: +1.4%       │ Halted: no       │
└──────────────────┴──────────────────┴──────────────────┘

Last signal received: 47 minutes ago
Strategy: RSI Divergence BTC 5m

[Pause bot] [Rotate webhook secret] [Download ledger backup]
```

- Polls `/status` on user's bot every 15s (via `DASHBOARD_TOKEN` auth header)
- **Pause/resume**: POSTs to `/pause` and `/resume` with `DASHBOARD_TOKEN`
- **Error translation**: when `/status` fails, show plain-English diagnosis (see §9 Failure Modes)

---

## 4. Architecture

### 4.1 High-level

```
┌─────────────────────┐                  ┌──────────────────────┐
│ User's browser      │                  │ User's Railway bot   │
│                     │                  │ (apps/webhook-server)│
│ Next.js dashboard   │ ── /status ───▶  │                      │
│ at flashtradebot.xyz│ ── /pause ───▶   │ /webhook (TradingView│
│                     │ ── /resume ──▶   │  calls this)         │
│ localStorage:       │                  │                      │
│  - railway URL      │ ◀── JSON ──      │ DASHBOARD_TOKEN gate │
│  - dashboard token  │                  │ CORS allow origin    │
│  - wizard progress  │                  │                      │
└─────────────────────┘                  └──────────────────────┘
        │
        │ (no server-side state on our end)
        ▼
┌─────────────────────┐
│ Vercel (static +    │
│ some server actions │
│ if we need them for │
│ CORS proxy to TG/   │
│ Helius; probably    │
│ not needed)         │
└─────────────────────┘
```

### 4.2 Data flow

- **Setup wizard state**: React state during session. Persisted to `localStorage` after each screen completes. On page reload, resume from last completed screen.
- **Secrets in localStorage**: the user's private key is shown once on Screen 1 then discarded. It never persists. Only the public address, dashboard token, Railway URL, and non-sensitive config are kept.
- **Status polling**: browser hits user's bot directly. CORS must be allowed by the bot for our dashboard's origin.
- **Auth**: `DASHBOARD_TOKEN` header on every protected request. Generated client-side on Screen 6, stored in localStorage and in Railway env vars.

### 4.3 Privacy posture

- We do not collect user private keys. Ever.
- We do not collect user Railway URLs (they live in localStorage only). We cannot address user bots.
- We do collect **anonymous funnel telemetry**: screen-reached events, error events, no identifiers. Via Vercel Analytics + optionally Plausible.
- Source code public on GitHub so users can verify.

---

## 5. Tech stack + Karpathy-principle baseline services

Karpathy principle: *"Use managed services for anything that isn't your differentiator."* Applied here:

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 App Router | Best-in-class DX, Vercel-native |
| Hosting | Vercel free tier | Free, git-integrated, preview deploys per PR |
| UI | Tailwind + shadcn/ui | Fast to ship, accessible defaults |
| Solana SDK | `@solana/web3.js` + `@solana/pay` | Industry standard |
| Forms | `react-hook-form` + `zod` | Type-safe, minimal bundle |
| Analytics | Vercel Analytics (pageviews) + Plausible (events, optional) | Privacy-preserving, no GDPR fuss |
| Domain | `flashtradebot.xyz` (TBD, ~$3/yr) | Namecheap/Porkbun |
| CI | GitHub Actions (existing) | Extend the workflow we already have |

**What we are not building ourselves**: analytics pipeline, auth service, session store, DB. All of these have managed alternatives or aren't needed.

**Differentiator**: the wizard logic + the trading bot itself. Everything else is commodity.

---

## 6. Repo structure after dashboard lands

```
flash-trade-bot/                    (Turborepo monorepo)
├── apps/
│   ├── webhook-server/             existing bot
│   └── dashboard/                  NEW — Next.js 14 on Vercel
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx        (/, landing)
│       │   │   ├── setup/
│       │   │   │   ├── wallet/page.tsx
│       │   │   │   ├── fund/page.tsx
│       │   │   │   ├── rpc/page.tsx
│       │   │   │   ├── telegram/page.tsx
│       │   │   │   ├── strategy/page.tsx
│       │   │   │   ├── deploy/page.tsx
│       │   │   │   └── tradingview/page.tsx
│       │   │   └── status/page.tsx
│       │   ├── components/         (UI primitives, shadcn-derived)
│       │   ├── lib/
│       │   │   ├── wallet.ts       (keypair gen, base58)
│       │   │   ├── solana-pay.ts   (QR + deep link)
│       │   │   ├── rpc.ts          (balance polling, getSlot)
│       │   │   ├── telegram.ts     (BotFather helpers, getUpdates)
│       │   │   ├── railway.ts      (deploy URL builder)
│       │   │   └── storage.ts      (typed localStorage)
│       │   └── styles/globals.css
│       ├── next.config.js
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── shared/                     NEW — shared between bot + dashboard
│       ├── src/
│       │   ├── pine-gen.ts         (generate Pine file with WEBHOOK_SECRET baked in)
│       │   ├── env-schema.ts       (zod schemas for all bot env vars)
│       │   └── status-types.ts     (shared shape of /status response)
│       └── package.json
├── tradingview-strategy.pine       (reference, stays at root)
├── turbo.json
├── package.json                    (workspace root)
├── PRD.md                          (canonical product spec)
├── DASHBOARD-PLAN.md               (this file)
└── AGENTS.md
```

---

## 7. Phase-by-phase roadmap

Each phase is one or more PRs. No phase depends on future phases being implemented. Each PR is independently deployable and CI-verifiable.

### Phase 0 — Planning + docs (day 0, today)

- Write this file (`DASHBOARD-PLAN.md`)
- Update `PRD.md` to note the pivot from Level 3 managed → self-host + dashboard
- Deprecate `LEVEL3-PLAN.md` (keep the file but note supersession in the header)
- Update `AGENTS.md` to reference the new plan

**Ships as**: one commit on `feat/dashboard-plan`, one PR.

### Phase 1 — Scaffold (days 1-2)

- Create `apps/dashboard/` with Next.js 14 App Router
- Install Tailwind, shadcn/ui, @solana/web3.js
- Create `packages/shared/` with Pine generator + env schema + status types stubs
- Landing page only (Screen 0) — headline, CTAs, links
- Wire into `turbo.json` — `build` / `dev` / `typecheck` tasks work for dashboard
- CI runs dashboard's `build` + `typecheck` alongside webhook-server
- Deploy to Vercel (temp URL, then `flashtradebot.xyz` when purchased)

**Ships as**: one PR. Success = Vercel deploy shows landing page, CI green, build time <60s.

### Phase 2 — Wallet + Fund (days 3-4)

- Screen 1: client-side `Keypair.generate()`, reveal/copy/download, advanced paste-existing-key toggle with warnings
- Screen 2: Solana Pay QR + deep link, live balance polling via public RPC, funding minimums check
- Unit tests for wallet.ts (generate returns valid base58, roundtrip works)
- End-to-end test: generate → balance polling → mocked-funded state

**Ships as**: one PR.

### Phase 3 — Helius + Telegram (days 5-6)

- Screen 3: Helius URL input + getSlot validation
- Screen 4: bot token input + client-side `getUpdates` call → auto-fetch chat ID
- "Send test message" button
- Error translation for rate-limited / invalid token / no chat yet

**Ships as**: one PR.

### Phase 4 — Strategy + Railway deploy URL (days 7-8)

- Screen 5: strategy config form with live summary
- Screen 6: Railway deploy URL builder, waiting state, health check verification
- `packages/shared/` finalized — env schema used on both sides
- Research + confirm: does Railway's template URL support pre-filled env vars? If yes, use directly. If no, show copy-paste block.

**Ships as**: one PR.

### Phase 5 — TradingView + Pine generator (days 9-10)

- `packages/shared/pine-gen.ts` finalized: reads `tradingview-strategy.pine`, replaces the `WEBHOOK_SECRET` input's default, returns the modified file
- Screen 7: download Pine button, webhook URL copy, screenshots
- Test: generated Pine passes the existing `pine-schema.test.ts` invariants

**Ships as**: one PR.

### Phase 6 — Status dashboard + bot changes (days 11-13)

Split into two PRs landing together:

**6a** — bot changes in `apps/webhook-server/`:
- Add `DASHBOARD_TOKEN` env var (optional; if absent, /status + /pause + /resume require `WEBHOOK_SECRET`)
- Add CORS for the dashboard origin
- New `/pause` + `/resume` endpoints writing to `bot_state`
- Update `.env.example`

**6b** — dashboard status page:
- Screen 8 layout: 3-column cards, auto-refresh
- Error translation to plain English
- Pause/resume buttons
- Download ledger backup (hits `/export`)

### Phase 7 — Polish + telemetry + launch (day 14)

- Mobile responsive pass on every screen
- Error states on every input
- Vercel Analytics wired up
- Funnel event instrumentation (see §8)
- Production domain + SSL
- README updated to point users at the dashboard as the primary onboarding path
- Railway template listing updated to link dashboard

**Ships as**: one PR. Then public launch (Twitter + HackerNews + crypto Telegram groups).

---

## 8. Telemetry (Karpathy principle: eval-first)

Decide what we measure **before** shipping. Metric = "time from landing to first successful `/status` check."

### Funnel events (anonymous, no PII)

| Event | When |
|---|---|
| `dashboard.landed` | first pageview on `/` |
| `setup.started` | clicked "Start setup" |
| `setup.wallet.generated` | new wallet generated |
| `setup.wallet.pasted` | advanced path used |
| `setup.funded` | balance check passed |
| `setup.rpc.validated` | Helius test passed |
| `setup.telegram.validated` | chat ID fetched + test message sent |
| `setup.strategy.configured` | strategy form submitted |
| `setup.deploy.clicked` | Railway deploy button clicked |
| `setup.bot.verified` | `/health` returned 200 on user's Railway URL |
| `setup.tradingview.confirmed` | "I've created the alert" checkbox |
| `setup.completed` | first landing on `/status` with successful poll |
| `status.visited` | subsequent status page visit |
| `status.pause.clicked` / `status.resume.clicked` | user actions |

### Error events

| Event | When |
|---|---|
| `error.wallet.invalid_key` | user pasted invalid base58 |
| `error.rpc.test_failed` | getSlot failed |
| `error.telegram.no_updates` | getUpdates returned empty |
| `error.railway.health_fail` | /health returned non-200 |
| `error.status.poll_fail` | /status unreachable |

### Kill criterion (hard gate)

If **`setup.completed` < 200** in the first 30 days after public launch → pivot to managed Telegram bot per `PRD.md` Section 13 change-control protocol.

If **`setup.started` → `setup.completed` conversion < 20%** → root-cause the biggest drop-off before any polish work.

---

## 9. Adversarial failure analysis (Karpathy principle)

Think about how it breaks before shipping. Each failure gets a UX response, not a crash.

| Failure | Detection | User-facing response |
|---|---|---|
| Pasted invalid private key | zod/base58 validation + Keypair roundtrip | "That doesn't look like a valid Solana private key. Expected: ~88 characters of base58." |
| User sent USDC on wrong chain (Ethereum) | Balance shows 0 despite user saying they sent | "We don't see the USDC yet. A common mistake: USDC was sent on the wrong network. Solana USDC mint starts with EPjF. Double-check the network on your exchange." |
| User's Helius URL is a devnet URL | `getSlot` succeeds but getGenesisHash mismatch | "This looks like a devnet endpoint. The bot runs on mainnet-beta. Create a mainnet endpoint in Helius." |
| User's Telegram bot token is revoked | `getUpdates` returns 401 | "This bot token is invalid or revoked. Go back to BotFather, `/mybots`, generate a new token." |
| User hasn't messaged their bot yet | `getUpdates` returns empty result | "We can't find a chat yet. Open Telegram, search for your bot, and send it any message. Then click 'Fetch chat ID' again." |
| Railway deploy failed | `/health` never returns 200 | "Your bot isn't responding. Check Railway logs at [direct link] — most common causes: missing env var, wrong PRIVATE_KEY format, Solana network typo." |
| Bot halted from daily loss | `/status` shows `halted: true` | "Your bot halted because today's realized loss hit your MAX_DAILY_LOSS limit. It will auto-resume at UTC midnight. To resume now: click Resume." |
| CORS error on /status | browser network tab shows CORS rejection | "Your bot hasn't been updated to allow this dashboard. Redeploy your bot with the latest code to enable dashboard polling. (Your trading is unaffected.)" |
| User closes mid-wizard | any screen exit | localStorage preserves progress; next visit resumes at last completed screen |
| Browser's localStorage is cleared | detection on load | "We lost your wizard progress. Starting fresh." |
| User on mobile Safari private mode | localStorage not persistent | Warning banner: "Private browsing doesn't persist state. We recommend a normal window." |
| Multiple tabs open for same wizard | last-write-wins in localStorage | Acceptable; data is idempotent |
| User's wallet wasn't funded before deploying | `/health` returns wallet balance = 0 | Warning + proceed: "Your bot is up, but your wallet has $0 USDC. Fund it before any trade can execute." |

---

## 10. Security posture

- **Client-side key generation** using Web Crypto API + `@solana/web3.js`. Never sent to our server.
- **No server-side secrets storage.** Dashboard is static + client-rendered. If we add server actions later (for Telegram CORS proxy), they process but never store secrets.
- **localStorage has the Railway URL + `DASHBOARD_TOKEN`** — these are not bearer secrets for user funds. At worst, a local-attacker can view the user's bot status (same attacker could read the user's Railway dashboard too).
- **CSP**: restrict script-src to self + Vercel Analytics. No third-party scripts.
- **HTTPS only** (Vercel defaults). HSTS.
- **Content Security Policy** blocks inline scripts except where React needs them (Next.js handles this).
- **Dependency audit** on every PR (`npm audit` in CI).
- **No third-party wallet SDKs loaded client-side** that could inject. Just `@solana/web3.js` from npm.

`SECURITY-NOTES.md` gets updated with the dashboard's trust boundaries as part of Phase 7.

---

## 11. Legal posture

- **Prominent DISCLAIMER** on landing page: "Not financial advice. You bear full risk. This software is MIT-licensed and provided as-is."
- **Link to `DISCLAIMER.md`** from every screen footer.
- **No 'managed service' language** anywhere. User is always "deploying their own bot."
- **No marketing claims** about returns, backtest results, or profitability.
- **ToS for the dashboard itself**: short, MIT-style — "we provide a UI, we don't trade on your behalf, we're not liable for anything that happens on your Railway deployment."

---

## 12. What happens if success criterion is hit

**If ≥200 setup.completed in 30 days:**
- Continue investing in self-host dashboard. Add more strategies. Polish.
- Consider a managed-mode toggle (Option 2 pivot) only after we hit 1000 signups.

**If setup.completed < 200 in 30 days:**
- Pivot per `PRD.md` Section 13.
- Most likely path: managed Telegram bot (BonkBot model) with custodial wallets, Postgres multi-tenancy, server-side strategy engine.
- The dashboard codebase is partially reusable (Pine logic, status types, Telegram client).

---

## 13. Out of scope until we hit success criterion

Do not build any of these in v1. Each entry has justification.

| Item | Why not yet |
|---|---|
| Login / user accounts | Stateless works for v1. Accounts add DB + session + compliance. |
| Managed trading | Different product, different legal surface. Opt-in pivot. |
| Multi-strategy UI | We have one strategy. Build more when it's justified. |
| Backtesting | Time-boxed work. Use TradingView's built-in for now. |
| Mobile native | Responsive web is good enough. |
| Multi-chain | Flash is Solana. Don't generalize until we have a second chain. |
| Paid tier | We earn $0 right now. Charging before validation is backwards. |
| Wallet Connect | Our advanced "paste key" path covers the <5% who want it. Adding WC is a whole new surface. |

---

## 14. Open questions resolved

- **Does Railway support env var pre-fill via template URL?** TBD — will confirm in Phase 4. Fallback: copy-paste block.
- **Domain**: `flashtradebot.xyz` first choice, `.trade` if available. Budget $3-30/yr.
- **Pine file hosting**: served from the dashboard via a route handler that reads `packages/shared/pine-gen.ts`. Not a static asset.
- **Analytics in CI/dev**: disabled. Only production.
- **Browser support**: last 2 versions of Chrome, Firefox, Safari, Edge. Explicitly drop IE and legacy browsers.

---

## 15. Change control

Changes to this plan follow the same protocol as `PRD.md` Section 13:

- Minor adjustments (wording, ordering within a phase) — commit with `docs(plan):` prefix, no PR review needed.
- Scope changes (adding a phase, changing success criterion, adding a non-goal) — require an update to this file AND `PRD.md` in the same PR, reviewed before merge.
- Plan deprecation (e.g., pivoting away from dashboard after success criterion check) — mark this file with a `SUPERSEDED BY` header at the top and link to the replacement plan.

---

## 16. First 14 days — exact daily breakdown

Solo founder schedule. One person, ~6 focused hours per day.

| Day | Output |
|---|---|
| 0 (today) | This file + PRD update + AGENTS update. 1 PR. |
| 1 | `apps/dashboard/` Next.js scaffold + landing page. Vercel deploy. 1 PR. |
| 2 | `packages/shared/` skeleton + env schema + status types. Pine generator stub. 1 PR. |
| 3-4 | Screens 1-2 (wallet + fund). Unit tests for `wallet.ts`. 1 PR. |
| 5-6 | Screens 3-4 (Helius + Telegram). 1 PR. |
| 7-8 | Screens 5-6 (strategy + Railway deploy URL). 1 PR. |
| 9-10 | Screen 7 (TradingView) + Pine generator finalized. 1 PR. |
| 11-12 | Screen 8 (status) + bot-side `/pause` + `/resume` + CORS + `DASHBOARD_TOKEN`. 2 PRs, land together. |
| 13 | Polish + telemetry + responsive pass. 1 PR. |
| 14 | Domain + production deploy + README update + launch. 1 PR. Public announcement. |

Total: ~10 PRs in 14 days. Average ~400-500 lines each (Karpathy: small reversible commits).
