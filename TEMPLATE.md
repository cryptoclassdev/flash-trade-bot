# Deploy and Host flash-trade-bot on Railway

flash-trade-bot is a self-hosted trading bot that executes [flash.trade](https://flash.trade) perpetual-futures trades on Solana mainnet, driven by TradingView strategy alerts. It ships with a guided-setup web dashboard bundled into the same service — one Railway deploy, one URL, no separate onboarding infrastructure.

## 👉 After Deploy: Open Your Dashboard

**When the build finishes**, Railway will assign your service a public URL. Click **"View"** on the service (or open the URL from the **Settings → Domains** tab) in a new browser tab. That URL is your **setup dashboard** — a browser wizard that walks you through wallet generation, funding, Helius RPC, Telegram bot, TradingView alert, and live status monitoring.

You click Deploy → Railway builds (~3 min) → you open the URL Railway gives you → the dashboard guides you the rest of the way.

## About Hosting flash-trade-bot

Deploying flash-trade-bot on Railway gives you:

- A single Node service serving both the Express trading bot and its Next.js-static setup dashboard from the same URL
- An always-on Solana-perpetuals executor behind Railway's HTTPS edge, with auto-restart on failure and a 25-second graceful-shutdown drain on redeploys
- A SQLite audit ledger on a mounted persistent volume
- A `SETUP_MODE=true` first-boot flag that serves the dashboard only — trading paths refuse until you finish configuration and unset the flag
- A live status page at the same URL (balance, open positions, realized PnL, halt state) with pause / resume buttons
- A webhook URL you paste into TradingView to complete the loop

You hold the keys. The dashboard generates the Solana keypair client-side in your browser and never sends it to any server other than your own Railway deployment.

## Common Use Cases

- Run a TradingView Pine strategy against flash.trade perpetuals 24/7 without keeping a laptop online
- Automate entries, exits, and position flips on Solana perps while holding your own keys
- Validate strategy ideas with built-in safety guards: daily-loss circuit breaker, slippage tolerance, webhook-secret authentication, constant-time auth checks, a pause/resume control from the dashboard, and a dry-run mode that never signs

## What You Need Before Deploy

Almost nothing — the post-deploy dashboard collects everything it needs, including generating the Solana keypair in your browser. You only need:

- A funded credit card for Railway and TradingView (~$20/mo combined)
- A Telegram account
- About 30 minutes

You'll get the Solana private key, Helius URL, Telegram bot token, and webhook secret during the dashboard walkthrough — not before deploy.

### Dependencies the dashboard links you to during setup

- [Helius RPC (free tier)](https://www.helius.dev/)
- [TradingView Pro+ pricing](https://www.tradingview.com/pricing/)
- [@BotFather on Telegram](https://t.me/BotFather)
- [flash.trade](https://flash.trade/)
- [Source repository](https://github.com/cryptoclassdev/flash-trade-bot)

## Implementation Details

Post-deploy the bot exposes these endpoints on your Railway URL:

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Bundled dashboard landing page. Start here. |
| `GET /setup/*` | Seven-screen setup wizard (wallet, fund, rpc, telegram, strategy, deploy, tradingview) |
| `GET /status` | Live dashboard: balance, positions, PnL, halt state, pause/resume controls |
| `GET /health` | Liveness + `setup_mode` flag. Used by Railway's healthcheck. |
| `GET /api/setup-info` | Dashboard self-introspection; lists missing env vars while in SETUP_MODE |
| `GET /pine-source` | Reference Pine script; the dashboard fetches this, injects your secret, serves a Blob download |
| `POST /webhook` | TradingView signal ingress. Constant-time secret check, dedupe by signal id, async executor. |
| `POST /pause` / `POST /resume` | Dashboard control — halt new opens, resume trading |
| `GET /export?secret=...` | Gzipped SQLite backup of the ledger for off-site archival |

Trade intents are derived from TradingView position transitions:

```
flat  -> long   = open long
flat  -> short  = open short
long  -> flat   = close long
short -> flat   = close short
long  -> short  = flip (atomic reverse-position)
short -> long   = flip
same  -> same   = noop
```

Railway-specific constraints: `numReplicas=1` (SQLite + multi-instance = corruption), volume mounted at `/data` for the ledger database, graceful SIGTERM drain with a 25-second deadline before Railway's SIGKILL, rate limiting on `/webhook` at 60 requests per minute per IP. Full architecture, operational runbook, and the risk disclaimer live in the repo's `README.md`, `AGENTS.md`, `SECURITY-NOTES.md`, `DISCLAIMER.md`, and `DASHBOARD-PLAN.md`.

## First Boot Flow

1. Click **Deploy on Railway**
2. Railway provisions the service with `SETUP_MODE=true` default — the bot boots only to serve the dashboard
3. Open your Railway URL in a browser
4. Setup wizard:
    - **Wallet**: browser generates a fresh Solana keypair (client-side, never sent)
    - **Fund**: Solana Pay QR or deep link, ~50 USDC + 0.05 SOL
    - **RPC**: sign up for Helius, paste URL, dashboard validates
    - **Telegram**: BotFather token, dashboard auto-fetches chat id
    - **Strategy**: RSI Divergence BTC, sliders for collateral / leverage / max-loss
    - **Deploy**: dashboard generates env-var block, you paste into Railway → Variables and remove `SETUP_MODE`
    - **TradingView**: download Pine file (secret pre-baked), paste into TradingView, create alert
5. Dashboard re-checks `/api/setup-info` → bot exits SETUP_MODE → live status page becomes available
6. TradingView fires alerts → bot trades → Telegram notifies → status updates

## Why Deploy flash-trade-bot on Railway?

Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

flash-trade-bot was architected for Railway specifically: single-replica SQLite, mounted volume for ledger persistence, Dockerfile that uses `turbo prune` to keep the image minimal, bundled dashboard so there's no second service to manage or pay for.
