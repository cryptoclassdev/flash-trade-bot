# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) and Cursor IDE (https://cursor.com) when working with code in this repository.

## Product source of truth — read before product-shaping changes

**`PRD.md` is the canonical product specification.** It defines what we are building (Level 3: Telegram-native, non-custodial, managed trading product), for whom, and under what constraints.

Before making any change that touches:
- user-facing features or flows
- the trust / custody / security model
- the strategy library
- supported markets or chains
- pricing or billing
- the target user persona
- success metrics or release criteria
- anything moving in or out of scope

…read `PRD.md` end to end. If your change diverges from what is written there, propose an update to `PRD.md` *first*, then implement. See [`PRD.md` Section 13 — Change control](./PRD.md#13-change-control).

Bug fixes, refactors, performance improvements, internal architecture choices, and infrastructure tuning do NOT require PRD updates. Use your judgment.

Companion documents:
- `DASHBOARD-PLAN.md` — **operationally active as of 2026-04-24**. Describes the guided self-host dashboard currently being built in `apps/dashboard/`. Read this before touching the dashboard, Railway template flow, or TradingView onboarding. Includes the 200-signups-in-30-days success criterion that gates whether we continue with self-host or pivot to managed.
- `LEVEL3-PLAN.md` — **superseded for now**. Reference implementation plan for the Level 3 managed Telegram-native product. Only relevant if we pivot per `DASHBOARD-PLAN.md` §12.
- `SECURITY-NOTES.md` — trust boundary documentation. Update when security model changes.
- `DISCLAIMER.md` — user-facing risk disclosure. Update when risk surface changes.
- `tradingview-strategy.pine` — reference implementation of the RSI Divergence strategy.

## Orientation

- Directory name is `rsi-divergence-bot`; the package itself is `flash-trade-bot`. Same code, legacy naming.
- This is a **Turborepo monorepo**. Today: `apps/webhook-server/` (the trading bot). In flight per `DASHBOARD-PLAN.md`: `apps/dashboard/` (Next.js 14 on Vercel) + `packages/shared/` (Pine generator, env schema, status types). Root `package.json` only carries `turbo` — all runtime deps live in each app's own `package.json`. Pine strategy lives at repo root (`tradingview-strategy.pine`) because it is a cross-cutting asset.
- This is a **live-money trading bot**. Current codebase is the v0 Railway template with the in-flight dashboard layer. Per `PRD.md` v2.0, the execution direction is self-host + guided dashboard (not Level 3 managed — that's deferred pending dashboard validation).
- Treat every change as production-critical. Users deploy real money against this code.
- Read `SECURITY-NOTES.md` before touching anything related to `.env`, `PRIVATE_KEY`, `WEBHOOK_SECRET`, or wallet handling.
- Tests live in `apps/webhook-server/tests/*.test.ts` run via `npm test` (turbo). `apps/webhook-server/scripts/dry-run.ts` additionally hits the real mainnet transaction-builder API to validate the `ApiBackend` shape without signing.

## Commands

All scripts run through `ts-node --transpile-only` except `start`, which runs compiled JS.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the webhook server via ts-node (binds `127.0.0.1:PORT`, default 3000). |
| `npm run build` | `tsc` → `dist/`. |
| `npm start` | Run the compiled server from `dist/server.js`. |
| `npm run typecheck` | `tsc --noEmit`. Use this as the only "lint" — no ESLint is configured. |
| `npm run dryrun` | API-shape validation against mainnet `/transaction-builder`. Forces `DRY_RUN_ONLY=true` and never loads `PRIVATE_KEY`. |
| `npm run fire -- --action buy --market_position long --prev_market_position flat` | Fire a local test webhook at `127.0.0.1:$PORT/webhook`. Reads `WEBHOOK_SECRET` from `.env`. |
| `npm run balance` | Print SOL + USDC balance for the configured wallet. |
| `npm run trades` | Dump recent signals, trades, closed positions, open positions, realized PnL from `ledger.db`. |

There is no single-test runner because there are no tests.

## Required environment (mainnet)

`NETWORK=mainnet-beta`, `I_UNDERSTAND_REAL_MONEY=yes`, `RPC_URL_MAINNET`, `PRIVATE_KEY` (base58), `WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. `DRY_RUN_ONLY=true` disables every sign/send path and skips `PRIVATE_KEY` loading — use it for local iteration.

## Architecture

### Request lifecycle

```
TradingView alert (Pine) → POST /webhook
  → verify.ts          constant-time secret + shape validation
  → ledger.insertSignal (dedupe on signal.id)
  → 202 returned synchronously; executor.execute runs async
  → executor.deriveIntent  (prev, next) → open | close | flip | noop
  → flash.ts backend       builds + signs + sends the Solana tx
  → confirm.ts             waitForSignature + expectPosition{Opened,Closed}
  → ledger trade/position rows updated; telegram.ts alerts
```

`server.ts` binds `127.0.0.1` only — exposure to the public internet is the Cloudflare tunnel's job. Never change the bind address without also changing the deploy topology.

### Intent derivation (`apps/webhook-server/src/executor.ts:deriveIntent`)

The bot is driven by TradingView's `prev_market_position` + `market_position` fields, **not** `action`:

- `flat → long` / `flat → short` = open
- `long → flat` / `short → flat` = close
- `long → short` / `short → long` = flip (close + open, atomic on mainnet via `/transaction-builder/reverse-position`, non-atomic on devnet SDK)
- same = noop

The `action` field (buy/sell) is validated but not used for dispatch. This matters because a TradingView "sell" on an already-flat position is a noop, not a short.

### Flash backends (`apps/webhook-server/src/flash.ts`)

Two implementations behind `FlashBackend` (`apps/webhook-server/src/types.ts`):

- **`ApiBackend`** — mainnet. Calls `https://flashapi.trade/transaction-builder/{open,close,reverse}-position`, receives a base64 `VersionedTransaction`, signs locally, broadcasts via the configured `RPC_URL_MAINNET`. This is the production path.
- **`SdkBackend`** — devnet only, via `flash-sdk` driving the chain directly. **Dormant**: flash.trade's devnet program is decommissioned and will fail with `UnsupportedProgramId`. `server.ts` prints a warning at boot if `NETWORK=devnet`. Keep the code — it's the reference for how to build flash.trade transactions without the HTTP API.

`pickBackend(cfg)` chooses based on `cfg.network`. Dry-run mode is only supported by `ApiBackend`; `SdkBackend` throws if you try.

### Dry-run safety

`DRY_RUN_ONLY=true` is enforced at three layers — keep all three:

1. `config.ts` does not read `PRIVATE_KEY` when dry-run is set; `walletKeypair` stays `null`.
2. `ApiBackend` short-circuits before `deserializeAndSign` and returns `txSig: "DRYRUN_NOT_SUBMITTED"`.
3. `ApiBackend.requireLiveWallet(...)` throws if anything downstream tries to sign with a null keypair.
4. `server.ts` refuses to start in dry-run mode — it's a script-only mode. Webhook processing needs a live wallet.

`apps/webhook-server/scripts/dry-run.ts` hard-pins `DRY_RUN_ONLY=true` and `NETWORK=mainnet-beta` before importing config, then re-applies after `dotenv.config()` so `.env` cannot override.

### Retry policy (`apps/webhook-server/src/retry.ts`)

`withRetry` classifies each failure by regex against the error message:

- **blockhash** → retry; the action closure is expected to refetch/rebuild the tx on its next call.
- **slippage** → retry up to `maxSlippageRetries` (separate counter from attempt count).
- **dropped** → retry with priority fee doubled.
- **fatal** → no retry; caller triggers `halt()`.

The retry loop assumes the action closure is idempotent from the wallet's perspective (i.e. re-submitting a rebuilt tx for a dropped signal is safe). The ledger writes one `trades` row per attempt, so every retry is auditable.

### Halt mechanism (`apps/webhook-server/src/halt.ts`)

Halt state lives in the `bot_state` SQLite table (`halted`, `halt_reason`). It **persists across restarts**. Semantics:

- Halt blocks new **opens** only. Closes always go through — the goal is reducing risk, not locking positions in.
- Any `fatal` error from the retry loop triggers `halt(...)`.
- `checkDailyLossLimit` runs after every close and halts if `realized_pnl_usd` since UTC midnight ≤ `-MAX_DAILY_LOSS_USDC`.
- Clear with `RESUME=true` env var at boot (one-shot), or direct DB edit — see README "Clear the halt flag".

### Ledger schema (`apps/webhook-server/src/ledger.ts`)

SQLite file `ledger.db` in the process CWD. Tables:

- `signals` — one row per webhook, PK is `signals.id` (the TradingView-supplied id used for dedupe).
- `trades` — one row per send attempt, FK → `signals`. Includes `attempt_number`, `tx_signature`, `status`.
- `positions` — one row per opened position, PK is the on-chain `positionKey`. Closed out by setting `closed_at` + `exit_price` + `realized_pnl_usd`.
- `bot_state` — KV table for `halted` / `halt_reason`.

WAL mode + foreign keys on. `getOpenPosition()` returns the most recently opened row where `closed_at IS NULL`. When the on-chain position and the ledger diverge (e.g. position closed via flash.trade UI out-of-band), see the README "Reconcile the ledger" runbook.

## Conventions that matter

- **No magic numbers for money / risk.** Collateral, leverage, slippage, max-loss all come from env vars validated by `config.num(...)`. Don't hardcode USD amounts or slippage bps in trading logic.
- **Never log secrets.** `validatePayload` already redacts `secret` in the stored `raw_payload`. If you add new logging around payloads, preserve that.
- **Don't widen the webhook bind address.** `app.listen(cfg.port, "127.0.0.1", ...)` is intentional — the tunnel is the only ingress.
- **SDK backend is reference code, not a live path.** Don't refactor `ApiBackend` and `SdkBackend` toward symmetry by pulling devnet-only idioms up into shared helpers. Their lifecycles are different.
- **Ops scripts are laptop-era.** `ops/watchdog.sh` has a hardcoded `WORKDIR=/Users/thanvanthp/flash-trade-bot` and references `cloudflared tunnel --url` (quick-tunnel). They are included as reference for the 3-strike + Telegram-alert pattern; the VPS deploy uses systemd + a named tunnel instead. Don't wire them into the main runtime.
