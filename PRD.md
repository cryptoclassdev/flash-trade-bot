# flash-trade-bot — Product Requirements Document

**Status:** Active. Execution path: **self-host Railway template + guided web dashboard** (see `DASHBOARD-PLAN.md`). Aspirational endpoint: **Level 3 managed Telegram-native** (Sections 1-12 of this doc), gated on dashboard success criterion being met or missed.
**Version:** 2.0
**Last updated:** 2026-04-24
**Canonical:** This document is the source of truth for product decisions. Any change that diverges from what is written here requires an explicit update to this file first.

> **Agents working on this repo:** before making product-shaping changes — features, flows, data model decisions, scope calls, pricing, strategy additions, platform choices — read this document end to end. If your change diverges from what is specified here, propose an update to this PRD before implementing. See the [Change Control](#13-change-control) section.

> **Current execution direction (as of 2026-04-24):** We are **not** building the Level 3 managed product directly. We are first building a **guided web dashboard on top of the existing Railway-template bot** to validate whether there is demand at the self-host tier. If ≥200 users complete onboarding in 30 days post-launch, we continue investing in self-host. If <200, we pivot to the Level 3 managed product described in Sections 1-12 below. See `DASHBOARD-PLAN.md` §12 for the pivot decision framework.
>
> **How to read this PRD**: Sections 1-12 describe the Level 3 endpoint we may still pursue. Section 13-14 reflect the active governance protocol. The dashboard's specific functional/non-functional requirements, user journeys, and success metrics live in `DASHBOARD-PLAN.md` — which is operationally active right now.

---

## 1. Product overview

flash-trade-bot is a fully managed, non-custodial, Telegram-native automated trading product for Solana perpetual futures on [flash.trade](https://flash.trade).

Users open Telegram, sign up in under two minutes, pick from a curated library of trading strategies, set their risk parameters, and the product trades on their behalf inside a vault they control. The user's private key never leaves their wallet; the product signs on their behalf via MPC (Turnkey) under policy-enforced spending limits that the user can revoke at any time.

Notifications, status, and control commands all happen inside Telegram. There is no web dashboard, no desktop app, no CLI, no self-hosting.

### 1.1 What problem this solves

Retail traders who want to automate a strategy on Solana perpetuals today face a wall of prerequisites: generate a wallet, fund it, sign up for a paid TradingView account, write or paste Pine script, deploy a bot to a cloud host, configure webhooks, wire Telegram notifications, and monitor the bot through a dashboard they do not own. The path works for a small minority of technical users and excludes everyone else.

This product collapses that path to: tap a Telegram link, tap four buttons, sign once, deposit USDC, done.

### 1.2 Why now

- Telegram Mini Apps have matured into a real application surface with wallet connect, payments, and native-feeling UX. Serving Telegram's 800M+ users is now a first-class distribution channel.
- Solana perpetual infrastructure (flash.trade) and oracle infrastructure (Pyth) are production-stable.
- MPC-as-a-service (Turnkey) removed the single biggest barrier to building a non-custodial trading product: safe key management without being a custodian.
- One competitor (mojomaxi) validates the category exists. No competitor owns it yet.

---

## 2. Target users

### 2.1 Primary persona — "Crypto-native retail trader"

- Has a Solana wallet (Phantom, Solflare, Backpack) and some USDC.
- Familiar with DeFi primitives (swaps, perps, yield).
- Uses Telegram daily.
- Cannot or does not want to write code, set up a VPS, or maintain infrastructure.
- Wants passive automation from strategies they trust, not a new hobby.
- Budget: willing to commit $100-$5000 of trading capital, $15-30/month for a service that works.

### 2.2 Secondary persona — "Curious trader, new to Solana"

- Active trader on centralized exchanges.
- Has not yet bridged to Solana.
- Wants to try automated trading before committing.
- Needs strong onboarding, backtest-first proof, and obvious risk controls.

### 2.3 Non-users (explicitly)

- US retail (geo-fenced until compliant).
- UK retail (geo-fenced under FCA restrictions).
- Users in sanctioned jurisdictions (OFAC list).
- Institutional traders (wrong product shape).
- Algorithmic strategy developers (they want to build, not consume).

---

## 3. User journeys

### 3.1 First-time setup (target: under 2 minutes)

1. User taps `t.me/flashtradebot` and sends `/start`.
2. Bot replies with a welcome message and a "Launch Setup" button opening the Mini App.
3. Mini App step 1: strategy picker. Cards show each available strategy with a 90-day backtest chart (total return, win rate, Sharpe, max drawdown).
4. Mini App step 2: risk configuration. Sliders for collateral per trade, leverage, max daily loss.
5. Mini App step 3: wallet connect. Uses Solana Wallet Standard (Phantom / Solflare / Backpack). User signs an auth message.
6. Mini App step 4: delegation. Explain the non-custodial model in three plain sentences. User signs one transaction creating a Turnkey sub-organization and spending policy.
7. Mini App step 5: fund vault. Show vault address + QR code. User deposits USDC from their connected wallet.
8. Confirmation: "You are live. Your next trade fires when the strategy's conditions match."

Every step has a Telegram `MainButton` primary action. Back button always works. User can exit at any step without committing funds.

### 3.2 Daily use

- User receives Telegram notifications on every fill:
  `✅ Filled: long $40 BTC @ $78,501, tx: 5xK9…F2wQ`
- User checks status from their phone: `/status` returns halt state, open positions, and today's realized PnL.
- User adjusts risk mid-day: `/set leverage 1` takes effect on the next signal. No redeploy.
- User pauses before a volatile event: `/pause`. Strategy holds; existing closes still execute.
- User resumes: `/resume`.

### 3.3 Emergency control

- User taps `/closeall` on their phone. Bot asks for confirmation: `/closeall confirm` within 30 seconds. Bot closes every open position at market, sends confirmation.
- User revokes the bot entirely: opens Mini App → Settings → "Disconnect Bot". Backend revokes the Turnkey co-signing share. Vault funds remain accessible to the user directly through flash.trade's web UI using their connected wallet.

### 3.4 Failure scenarios

- **RPC outage**: bot halts all new trades, notifies user, continues polling. When recovered, resumes from the last good state.
- **Pyth price feed stale**: strategy engine pauses signal generation. Bot notifies user. Resumes when feed confidence recovers.
- **Daily loss limit hit**: bot halts opens. Closes still execute. Bot notifies user: "Halted: realized loss -$15.23 exceeded your $15 daily limit. Reply `/resume` to continue."
- **Trade fails on-chain**: classified by `retry.ts` logic (blockhash / slippage / dropped / fatal). Non-fatal errors retry up to 3 times with escalating priority fee. Fatal errors halt the strategy and notify user.
- **User's vault is underfunded for a trade**: strategy engine skips the signal, logs an event, notifies user: "Skipped long BTC — vault balance $8 below $20 required."

---

## 4. Functional requirements

Every requirement below is scoped to the launch version. Future versions are out of scope for this PRD unless noted.

### 4.1 Accounts

- **FR-1.1** Each Telegram user maps to exactly one user account. Lookup by `telegram_user_id`.
- **FR-1.2** Account creation happens implicitly on first Mini App launch. No separate signup.
- **FR-1.3** Account has one Turnkey sub-organization and one vault address on Solana.

### 4.2 Wallet + delegation

- **FR-2.1** User connects a Solana wallet via Wallet Standard. Supported wallets at launch: Phantom, Solflare, Backpack.
- **FR-2.2** Delegation policy is enforced by Turnkey, not by our backend. Policy includes:
  - Allowed program: flash.trade perps program only.
  - Daily volume cap: configurable at setup, default $500.
  - Per-signature sanity check: refuses transactions that do not match the user's allowed program.
  - Policy expiry: 30 days, auto-renewable from the Mini App.
- **FR-2.3** User can revoke delegation at any time. Revocation takes effect immediately; no new trades execute after revocation.

### 4.3 Strategy library

- **FR-3.1** At launch, the library contains exactly one strategy: **RSI Divergence (Flash Bot v1)**, ported from the Pine source in the repo.
- **FR-3.2** Users cannot write or upload custom strategies at launch. Out of scope.
- **FR-3.3** Every strategy in the library has a public backtest over the last 90 days, visible in the Mini App before the user enables it.
- **FR-3.4** Strategy math is deterministic given a price series. Two runs of the same strategy against the same Pyth historical data produce identical signals.

### 4.4 Trading execution

- **FR-4.1** Strategy engine polls Pyth price feeds every 5 seconds per active user-strategy and evaluates the strategy logic.
- **FR-4.2** When a strategy produces a signal, it emits an event to a durable message queue (NATS JetStream).
- **FR-4.3** Execution service consumes signals, builds transactions via the flash.trade `/transaction-builder` API, requests signing from Turnkey, submits via Helius RPC, polls for confirmation.
- **FR-4.4** Every signal produces at most one trade per user-strategy. Dedupe key is `(user_id, strategy_id, signal_id)`.
- **FR-4.5** Failed trades follow the retry classification already implemented in `src/retry.ts`: blockhash → retry; slippage → retry up to 2x; dropped → retry with priority fee doubled; fatal → halt.

### 4.5 Control surface (Telegram bot)

- **FR-5.1** Commands: `/start`, `/status`, `/positions`, `/pause`, `/resume`, `/closeall`, `/pnl [day|week|month|all]`, `/last [N]`, `/set <param> <value>`, `/strategy`, `/settings`, `/withdraw`, `/help`.
- **FR-5.2** `/set` supports live-mutable parameters: `leverage`, `collateral`, `maxloss`, `slippage`. Changes take effect on the next signal.
- **FR-5.3** `/closeall` requires a two-step confirmation (`/closeall` then `/closeall confirm` within 30 seconds).
- **FR-5.4** Only the authenticated Telegram user can issue commands against their own account. Other chats are rejected.

### 4.6 Notifications

- **FR-6.1** Bot sends a Telegram notification on: signal received, trade attempted, trade filled, trade failed, halt triggered, halt cleared, user commands acknowledged.
- **FR-6.2** Notifications include transaction signature (shortened) and a link to a Solana explorer.
- **FR-6.3** User can mute non-critical notifications (signal + attempt) via `/settings`.

### 4.7 Accounting + reporting

- **FR-7.1** Every trade is recorded with: signal_id, tx_signature, status, side, size, entry/exit price, realized PnL, timestamps.
- **FR-7.2** Daily PnL resets at UTC midnight.
- **FR-7.3** `/pnl week` shows last 7 rolling days realized PnL.
- **FR-7.4** Users can export their trade history as CSV from the Mini App settings page.

### 4.8 Billing

- **FR-8.1** Free tier at launch: 1 active strategy, max $100 notional per position. First 100 users grandfathered.
- **FR-8.2** Pro tier: $19/month (paid in Telegram Stars or USDC from vault), unlimited strategies, max $2000 notional.
- **FR-8.3** Performance fee: 10% of monthly realized profit, high-water mark, auto-deducted from vault.
- **FR-8.4** Billing transparency: user can view next month's projected charge in Mini App settings.

---

## 5. Non-functional requirements

### 5.1 Performance

- **NFR-5.1** Time-to-first-trade (median, new user): under 5 minutes from `/start`.
- **NFR-5.2** Signal-to-execution latency (p95): under 10 seconds from signal emit to tx submitted.
- **NFR-5.3** Mini App first contentful paint: under 1.5 seconds on 4G mobile.
- **NFR-5.4** Mini App bundle size: under 200KB gzipped (per telegram-mini-app skill guidance).

### 5.2 Reliability

- **NFR-5.5** Strategy engine uptime: 99.5% measured per-user per-week.
- **NFR-5.6** Trade fill success rate: 98%+ of executable signals land on-chain.
- **NFR-5.7** Zero data loss on process restart. All state lives in Postgres + NATS durable queues. In-memory state must be reconstructible from persistence.
- **NFR-5.8** Graceful shutdown: in-flight trades complete or roll back cleanly within 25 seconds of SIGTERM.

### 5.3 Security

- **NFR-5.9** No private keys ever on our backend. Signing is Turnkey-only, always.
- **NFR-5.10** Every Mini App API request validates Telegram `initData` HMAC-SHA256 hash server-side (per telegram-mini-app skill, HIGH severity).
- **NFR-5.11** Bot commands are authenticated by Telegram user ID matching the account owner. No cross-user access.
- **NFR-5.12** No secrets in source code, logs, or error messages. Sentry/log scrubbing enforced.
- **NFR-5.13** Constant-time comparison for any secret check (already implemented).
- **NFR-5.14** Rate limiting on all API routes: 60 req/min/user baseline.

### 5.4 Compliance

- **NFR-5.15** Geo-fence enforced at the API gateway. IPs from the US, UK, and OFAC-sanctioned jurisdictions receive a clear error page.
- **NFR-5.16** First-time users must accept Terms of Service and Risk Disclosure before any strategy can be enabled. Acceptance is recorded with timestamp + IP.
- **NFR-5.17** All public marketing materials must include "Trading involves substantial risk of loss. Not financial advice." disclaimers.
- **NFR-5.18** Privacy Policy compliant with GDPR and CCPA. Users can request data deletion; account deletion revokes Turnkey delegation and purges all PII within 30 days.

### 5.5 Observability

- **NFR-5.19** Every user action + system decision emits a structured event to the `events` table.
- **NFR-5.20** Metrics (Prometheus) cover: requests/sec, signal latency, execution latency, Turnkey signing latency, RPC error rate.
- **NFR-5.21** Public status page (Instatus or similar) with real-time component health.
- **NFR-5.22** Alerts fire on: RPC error rate >5%, execution latency >10s p95, Pyth feed stale >30s, strategy halt affecting >10 users in 1 hour.

---

## 6. Technical architecture summary

Detailed architecture lives in [`LEVEL3-PLAN.md` Section 4](./LEVEL3-PLAN.md). This section is the high-level snapshot required for any agent working on the repo.

### 6.1 Service boundaries

| Service | Responsibility |
| --- | --- |
| Telegram bot | User conversational UI, command routing, notifications |
| Mini App | Onboarding wizard, live dashboard, wallet connect |
| API gateway | Auth, rate limit, initData validation, REST + WebSocket |
| User service | Account mapping, settings |
| Wallet service | Turnkey sub-org management, delegation policy, signing |
| Strategy engine | Price feed ingestion, signal generation |
| Execution service | Signal → tx → sign → submit → confirm |
| Accounting | Trade records, PnL computation, notifications |

### 6.2 Tech choices (canonical)

- **Language**: TypeScript everywhere. Node 20 runtime.
- **Bot framework**: grammY (per telegram-bot-builder skill recommendation for TS).
- **Mini App**: Next.js 14 App Router on Vercel.
- **Backend API**: Fastify on Fly.io.
- **Strategy + execution workers**: Node workers, deployed to Fly.io alongside API.
- **Database**: Postgres via Supabase.
- **Cache**: Redis via Upstash.
- **Event bus**: NATS JetStream (self-hosted on Fly.io to start).
- **Key management**: Turnkey MPC.
- **Price feeds**: Pyth Network (on-chain HTTP API).
- **RPC**: Helius primary, Triton fallback.
- **Observability**: Grafana Cloud (logs, metrics, traces).
- **Status page**: Instatus.

### 6.3 Data model

Canonical schema in [`LEVEL3-PLAN.md` Section 9](./LEVEL3-PLAN.md). Core tables: `users`, `strategies`, `signals`, `trades`, `positions`, `events`.

### 6.4 Non-custodial model

- User's main wallet → signs auth message (Wallet Standard).
- Turnkey sub-org created for user. User controls one key share.
- Bot controls one Turnkey key share, enforced by a policy bound to the user's account.
- Policy permits signing only for the flash.trade program, only up to daily volume cap, only for the user's vault.
- User can revoke at any time; revocation is immediate on-chain.

---

## 7. Constraints & assumptions

### 7.1 Constraints

- **Solana only** at launch. Multi-chain is out of scope.
- **Flash.trade only** as the trading venue. No Drift, no Jupiter Perps, no Mango. Revisit only if flash.trade becomes unviable.
- **BTC perpetual only** at launch. Additional markets (ETH, SOL) come after MVP stability is demonstrated.
- **One strategy (RSI Divergence)** at launch. Rebalance, momentum, and mean-reversion are post-MVP.
- **English only** at launch. Localization deferred.
- **Telegram only** as the client. No web dashboard, no mobile native app.

### 7.2 Assumptions

- Telegram's Mini App platform remains stable and available on iOS, Android, desktop.
- Turnkey's pricing and availability are stable. If Turnkey becomes unviable, we fall back to a custom Solana delegation program (major engineering effort).
- Pyth price feeds remain available and timely. No fallback oracle at launch.
- flash.trade's `/transaction-builder` API shape is stable. We monitor for breaking changes via weekly integration tests.
- Solana network uptime remains above historical norms (>99% effective availability).
- The RSI Divergence strategy, as designed, is neither broken nor wildly profitable. Target: Sharpe > 0.8 on 90-day backtest, verified before launch.

---

## 8. Out of scope (launch)

Every item here is explicitly NOT being built for v1. Future versions may add them; they are not MVP.

- Custom strategy uploads by users.
- Social features (strategy marketplace, copy trading, leaderboards).
- Multiple markets beyond BTC.
- Multiple strategies beyond RSI Divergence.
- Non-Solana chains.
- Institutional features (multi-user accounts, team roles, audit reports for compliance teams).
- Mobile native apps (iOS/Android) — Telegram is the client.
- Web dashboard as a primary surface — Mini App + bot are the only UIs.
- API for third-party integrations.
- Paper trading mode (we use real vaults from day 1).
- Tax reports — users export CSV and handle tax themselves.
- Customer support SLAs beyond community-best-effort.

---

## 9. Success metrics

Launch-readiness is measured by hitting all of these in private beta before public launch. Metrics re-evaluated weekly post-launch.

| Metric | Target | Measured how |
| --- | --- | --- |
| Time-to-first-trade (median) | < 5 min | event log: `/start` → first filled trade |
| Week-1 retention | > 50% | cohorted signal events |
| Week-4 retention | > 25% | cohorted signal events |
| Strategy uptime per user | > 99% | halt events / active time |
| Trade fill success rate | > 98% | trade status: confirmed / attempted |
| Signal-to-execution latency (p95) | < 10s | `signals.received_at` → `trades.confirmed_at` |
| Cost per active user per month | < $2 | infra billing / MAU |
| Support tickets per user per week | < 0.2 | Telegram ticket count / WAU |

---

## 10. Release criteria

The following must be true before moving between stages.

### 10.1 Private beta (internal + 20 hand-picked users)

- Mini App onboarding end-to-end works for at least three real users unassisted.
- RSI Divergence strategy produces signals identical to Pine reference on 90 days of historical data.
- Turnkey delegation + revocation flow tested on devnet and mainnet.
- All functional requirements FR-1 through FR-6 implemented.
- Basic observability wired (logs + metrics + one alerting rule).
- Internal team has used the product for at least 7 consecutive days without a critical incident.

### 10.2 Public beta (100-user cap)

- Private beta cohort retained at >50% at day 7.
- Zero incidents causing user fund loss during private beta.
- Legal review complete (ToS, Privacy Policy, Risk Disclosure in place).
- Geo-fence enforced and tested.
- Security review of Turnkey integration and vault delegation complete.
- Status page live.
- Onboarding video published.
- Support channel staffed (at minimum: community Discord with 24h response target).
- Billing (free tier + Pro tier) wired and tested.

### 10.3 Public launch (remove cap)

- Public beta cohort metrics meet Section 9 targets for 4 consecutive weeks.
- Full security audit by an external firm complete.
- Incident runbook documented and team trained.
- Pricing finalized and stable.
- First strategy addition (Rebalance v2) on track but not blocking launch.

---

## 11. Risks

Top product risks tracked and monitored. Engineering risks are in `LEVEL3-PLAN.md` Section 14.

| Risk | Likelihood | Impact | Status |
| --- | --- | --- | --- |
| Regulator action against retail crypto perps in a market we serve | M | Catastrophic | Geo-fence at launch, legal review, ongoing monitoring |
| Strategy loses users money, word-of-mouth kills growth | H | H | Backtest-first UX, explicit risk disclosures, conservative default config |
| Telegram changes Mini App platform in a breaking way | L | H | Track Telegram Bot API changelog, maintain fallback to pure-bot UX |
| Turnkey outage or pricing change | M | H | Abstract behind interface; can migrate to custom on-chain delegation program if needed |
| Competitor moves faster (mojomaxi adds our differentiators) | M | M | Ship faster; invest in strategy IP + community as moats |
| Funds lost due to a bug in our execution layer | L | Catastrophic | Security review; conservative rollout; small sizes in private beta |

---

## 12. Pricing (canonical)

### 12.1 Free tier
- One active strategy.
- Maximum $100 notional per position.
- Community support only.
- No performance fee waiver on the first $100 of monthly profit to ease onboarding.

### 12.2 Pro tier
- $19/month. Paid via Telegram Stars or auto-deducted USDC from vault.
- Up to 3 active strategies concurrently.
- Maximum $2000 notional per position.
- Priority execution queue (higher RPC tier).
- Priority support.

### 12.3 Performance fee
- 10% of monthly realized profit, high-water mark based.
- Applies to both tiers on profit above the tier's waiver.
- Auto-deducted from vault on the first day of each calendar month.
- Transparent: user sees projected charge in Mini App settings.

### 12.4 Founder tier (first 100 users)
- All Pro features permanently free, except the performance fee still applies.
- Marketed as a thank-you for early believers. Locked-in permanently per-user.

---

## 13. Change control

### 13.1 When to update this PRD

Any of the following changes require a PRD update *before* implementation:

- Adding or removing a user-facing feature.
- Changing the trust model, custody model, or security boundaries.
- Adding or removing a strategy from the library.
- Adding or removing a supported market.
- Changing pricing.
- Changing the target user persona.
- Modifying success metrics or release criteria.
- Moving something from In Scope to Out of Scope or vice versa.

Bug fixes, refactors, performance improvements, internal architecture changes, and infrastructure choices do NOT require PRD updates (see `AGENTS.md` and `DASHBOARD-PLAN.md` for those).

### 13.2 How to update

1. Describe the change as a brief amendment at the bottom of the relevant section.
2. Bump the version number at the top (1.0 → 1.1 for minor, 2.0 for major direction changes).
3. Add an entry to the change log in [Section 14](#14-change-log).
4. Commit with message `docs(prd): <summary>`.

### 13.3 Authority

Product decisions are ultimately the founder's. This PRD reflects those decisions. Agents and contributors should surface conflicts to the founder for resolution rather than making unilateral product changes.

---

## 14. Change log

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-04-24 | Initial PRD. Committed to Level 3 Telegram-native product. RSI Divergence strategy at launch. Turnkey MPC for non-custodial signing. Pyth for price feeds. Flash.trade only. Solo-founder build. |
| 2.0 | 2026-04-24 | **Direction pivot**: execute self-host Railway template + guided web dashboard first. Level 3 managed product becomes aspirational endpoint gated on dashboard success (≥200 completed signups in 30 days post-launch). Rationale: 2-week build to validate demand at self-host tier without taking on custody/regulatory risk or 12-week managed build timeline. See `DASHBOARD-PLAN.md` for the operational plan. Sections 1-12 of this PRD remain accurate specifications for the Level 3 endpoint we may still pursue. |

---

## Appendix A — relationship to other docs

- **`DASHBOARD-PLAN.md`** — **operationally active**. Describes the guided self-host dashboard we are building right now. Includes 14-day roadmap, success criterion, failure modes, and the pivot-to-managed decision framework. Read this before any dashboard work.
- **`LEVEL3-PLAN.md`** — *superseded for now*. Describes the Level 3 managed Telegram-native product. Preserved as the reference implementation plan for if/when we pivot to managed mode per the dashboard success criterion. Do not execute against this plan without a PRD revision.
- **`AGENTS.md`** — conventions for agents working on the repo. References this PRD as the source of truth for product decisions. Codifies the tech conventions, testing expectations, commit style.
- **`README.md`** — user-facing entry point. Describes the v0 Railway template. Will be rewritten to describe the Level 3 product once MVP ships.
- **`DISCLAIMER.md`** — legal/risk disclosure. Shown to users during onboarding. Referenced from ToS.
- **`SECURITY-NOTES.md`** — trust boundary documentation. Updated as the security model evolves (Turnkey integration in particular).
- **`tradingview-strategy.pine`** — reference implementation of the RSI Divergence strategy. The TypeScript port must produce byte-identical signals given the same price series.

## Appendix B — glossary

- **Vault** — a Solana account holding the user's USDC trading capital. Owned by the user, controlled via Turnkey-signed transactions under policy.
- **Delegation** — the Turnkey policy granting our backend the authority to sign specific types of transactions (flash.trade program calls, within daily limits) on the user's behalf.
- **Signal** — a computed output of the strategy engine indicating a trade should happen (open, close, flip).
- **Intent** — the resolved semantic meaning of a signal given current market position (open long, close short, etc.).
- **Halt** — persisted state that blocks new trade opens. Can be triggered by user (`/pause`), daily loss limit, fatal error, or system event (RPC down, Pyth stale).
- **Policy** — Turnkey-enforced rules defining what transactions our backend may sign for a given user.
- **TTFT** — Time To First Trade. Key onboarding metric.
- **Mini App** — Telegram's in-app webview platform. Primary onboarding and dashboard surface.
