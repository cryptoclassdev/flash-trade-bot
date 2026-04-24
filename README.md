# flash-trade-bot

Automated perpetuals trading bot that takes TradingView strategy alerts and executes them on [flash.trade](https://flash.trade) (Solana mainnet).

Deploy it to Railway in about 10 minutes. One wallet per deploy.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?referralCode=)

> Replace the button URL with your published template link after your first deploy.

> **⚠ Not financial advice. Trading perpetuals with leverage can lose you money, up to and including total loss of deposited capital. By deploying this software you accept the full text of [`DISCLAIMER.md`](./DISCLAIMER.md). Read it before you fund a wallet.**

---

## Is this for you?

You are a **technical trader** who wants to run your own automated bot:
- You have your own TradingView Pro+ account and Pine strategy (or you'll write one).
- You can generate a Solana wallet and fund it with USDC.
- You understand that running an automated trading bot can lose money.
- You read every line of `SECURITY-NOTES.md` and `DISCLAIMER.md` before deploying.

This is **not** a custodial service. You hold your own keys. You pay your own infra. You pick your own strategy. One deploy serves one user.

## New to Solana? Start here.

If you've never touched Solana, these are the prerequisites in order. Budget 30-60 min the first time:

1. **Install a Solana wallet** you already trust (Phantom, Solflare, Backpack). Create or import an account. Write the 24-word seed phrase down, offline. Do not screenshot it.
2. **Understand that a Solana private key is a 64-byte secret**, usually shown as a 87-88 character base58 string. The `PRIVATE_KEY` env var this bot reads is exactly that string — not the seed phrase, not a JSON file. See "Generate a bot wallet" below.
3. **Get USDC on Solana** (Circle's stablecoin, mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`). The cheapest path for most users is: buy USDC on a centralized exchange (Coinbase, Kraken, Binance), withdraw to your bot wallet's public address via the Solana network. Fees ~$1. Cross-chain bridging (e.g. from Ethereum) is possible but more expensive.
4. **Get a Solana RPC endpoint.** The public RPC (`https://api.mainnet-beta.solana.com`) is rate-limited and will drop your sends under load. Sign up at [helius.dev](https://www.helius.dev/) (free tier is enough for one strategy firing at 5+ min intervals), create a mainnet endpoint, copy the URL including the `?api-key=...` part.
5. **Sign up for TradingView Pro+** ($14.95/mo minimum). Free and Essential tiers cannot send webhook alerts. Without webhook alerts, this bot has no signals to trade on.

Estimated recurring cost before any capital: ~$20/mo. See [What it costs](#what-it-costs-monthly-recurring) below.

## What it costs (monthly, recurring)

| Service | Cost | Why |
| --- | --- | --- |
| Railway (Hobby plan) | ~$5 | hosting the bot + volume + egress |
| Solana RPC (Helius free tier) | $0 | chain reads + tx submission |
| TradingView Pro+ | $15 | webhook alerts require Pro+ or above |
| Telegram bot | $0 | notifications |
| **Total infra** | **~$20** | **before any trading capital** |

Plus your trading capital. Start small.

---

## Architecture

```
TradingView Pine strategy
    │  alert fires → POST with secret-authenticated JSON
    ▼
Railway edge (HTTPS, public URL)
    │
    ▼
Express server (apps/webhook-server/src/server.ts)
    │  verify secret → dedupe → insert signal → 202
    ▼
Executor (apps/webhook-server/src/executor.ts)
    │  derive intent (flat→long = open, long→flat = close, long→short = flip)
    ▼
ApiBackend (apps/webhook-server/src/flash.ts)
    │  POST flashapi.trade/transaction-builder/*
    │  sign locally with your keypair
    │  submit via your Helius RPC
    ▼
flash.trade on Solana mainnet
    │
    ▼
confirm.ts (wait for signature, verify position on chain)
telegram.ts (open / fill / fail / halt notifications)
halt.ts (daily realized-loss circuit breaker)
ledger.ts (SQLite audit log on the Railway volume)
```

Single SQLite file. Single replica. Single user. See `AGENTS.md` for the deeper architectural notes.

---

## Deploy to Railway

### 1. Fork or clone this repo to your GitHub

Railway deploys from a Git remote.

### 2. Generate a bot wallet (LOCAL, never on Railway's server)

```bash
# macOS / Linux — needs the Solana CLI
solana-keygen new --outfile ~/flash-bot-wallet.json --no-bip39-passphrase

# Convert to base58 for the PRIVATE_KEY env var
node -e 'const fs=require("fs"),bs58=require("bs58").default;process.stdout.write(bs58.encode(Buffer.from(JSON.parse(fs.readFileSync(process.argv[1])))))' ~/flash-bot-wallet.json
```

Copy the printed base58 string. This is your `PRIVATE_KEY`.

Fund the wallet's pubkey with **only the USDC you're willing to risk** plus ~0.02 SOL for gas. Do not reuse an existing wallet.

### 3. Get a Helius API key (free)

Sign up at [helius.dev](https://www.helius.dev/). Create a mainnet RPC endpoint. Copy the URL (looks like `https://mainnet.helius-rpc.com/?api-key=XXX`). This is your `RPC_URL_MAINNET`.

### 4. Create a Telegram bot

1. DM [@BotFather](https://t.me/BotFather) on Telegram. `/newbot`. Copy the token.
2. Start a chat with your new bot. Send it any message.
3. Get your numeric chat id: `curl "https://api.telegram.org/bot<TOKEN>/getUpdates" | jq '.result[0].message.chat.id'`

### 5. Deploy via Railway CLI

```bash
# Install if needed
npm i -g @railway/cli
railway login

# From this repo's root:
railway init --name flash-trade-bot
railway link    # pick the project you just created
railway volume add --mount-path /data
```

Set your env vars. `railway variables set KEY=VALUE` one at a time, or paste them in the dashboard:

```bash
railway variables set NETWORK=mainnet-beta
railway variables set I_UNDERSTAND_REAL_MONEY=yes
railway variables set RPC_URL_MAINNET='<your Helius URL>'
railway variables set PRIVATE_KEY='<your base58 key>'
railway variables set WEBHOOK_SECRET="$(openssl rand -hex 32)"
railway variables set TELEGRAM_BOT_TOKEN='<BotFather token>'
railway variables set TELEGRAM_CHAT_ID='<your chat id>'
railway variables set ASSET=BTC
railway variables set COLLATERAL_USDC=20
railway variables set LEVERAGE=2
railway variables set SLIPPAGE_ENTRY_BPS=100
railway variables set SLIPPAGE_EXIT_BPS=150
railway variables set MAX_DAILY_LOSS_USDC=15
```

Deploy:

```bash
railway up --detach
```

Assign a public domain:

```bash
railway domain
```

Your bot now lives at `https://<something>.up.railway.app`.

### 6. Verify

```bash
curl -sS https://<your-railway-url>/health
# → {"status":"ok","network":"mainnet-beta","wallet":"...","halted":false}

curl -sS https://<your-railway-url>/status
# → open_positions, last_signal_received_at, realized_pnl_today_usdc, trading_params
```

### 7. Set up your Pine strategy + TradingView alert

The bot is signal-less without a TradingView alert. This repo ships a **schema example** at `tradingview-strategy.pine` that you can use as-is (trades a trivial EMA cross on BTC), or adapt by replacing the `longSignal` / `shortSignal` lines with your own logic.

**Step-by-step:**

1. Open a BTCUSD chart in TradingView (or whatever market matches your `ASSET` env var).
2. Open **Pine Editor** (bottom panel).
3. Copy the entire contents of `tradingview-strategy.pine` from this repo. Paste into Pine Editor. Click **Save** (give it a name, any name). Click **Add to chart**.
4. TradingView opens the **Inputs** dialog. Under **Bot → Webhook Secret**, paste your `WEBHOOK_SECRET` value (the same one you set on Railway). Click **OK**. The script errors with a loud red message if this is empty — that's intentional.
5. On the chart, click the **⏰ Alert** button (top toolbar).
6. In the alert dialog:
   - **Condition:** your strategy name → **"alert() function calls only"**.
   - **Expiration:** "Open-ended".
   - **Notifications tab:** check **Webhook URL**, paste `https://<your-railway-url>/webhook`.
   - **Message:** leave the default. Ignored when the Pine uses `alert()` — the JSON string the script builds is what's sent.
7. Click **Create**.

That's one alert, handling all buys, sells, and flips for that strategy.

**When it fires:** your strategy evaluates on every bar close. When `longSignal` or `shortSignal` goes true, Pine calls `alert()` with a JSON payload, TradingView POSTs it to your Railway URL, the bot validates + dedupes + executes, and you get a Telegram notification.

**If you already have a Pine strategy:** copy just the `WEBHOOK_SECRET = input.string(...)` block and the `alertJson()` helper from `tradingview-strategy.pine` into your script, then add `alert(alertJson("buy", "..."), alert.freq_once_per_bar_close)` after each `strategy.entry()` / `strategy.close()`. Then follow steps 4-7 above.

---

## Environment variables

See `apps/webhook-server/.env.example` for the full template. Defaults in **bold**, secrets in *italic*.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NETWORK` | yes | `mainnet-beta` | `mainnet-beta` (production) or `devnet` (dormant, for code sanity only) |
| `I_UNDERSTAND_REAL_MONEY` | on mainnet | `no` | Must be literal `yes` to boot on mainnet |
| `DRY_RUN_ONLY` | no | `false` | If `true`, never signs or submits txs. Server refuses to boot in this mode (use `npm run dryrun`). |
| `RPC_URL_MAINNET` | yes (prod) | — | *Your paid Solana RPC. Public RPC will get rate-limited.* |
| `RPC_URL_MAINNET_FALLBACK` | no | — | *Optional secondary RPC. Used on dropped/timeout/5xx from primary. Recommended for production: grab a second free-tier endpoint from Triton/QuickNode/Alchemy so one provider outage doesn't kill trades.* |
| `PRIVATE_KEY` | yes (prod) | — | *Base58 bot wallet secret key. Generate locally. Never share.* |
| `WEBHOOK_SECRET` | yes (prod) | — | *Shared secret with TradingView alerts. `openssl rand -hex 32`.* |
| `TELEGRAM_BOT_TOKEN` | yes (prod) | — | *BotFather token* |
| `TELEGRAM_CHAT_ID` | yes (prod) | — | Numeric chat id |
| `PORT` | no | `3000` | Railway injects `$PORT`. Leave unset. |
| `ASSET` | no | **`BTC`** | Market symbol on flash.trade |
| `COLLATERAL_USDC` | no | **`20`** | Per-position collateral, USDC |
| `LEVERAGE` | no | **`2`** | 1–100 |
| `SLIPPAGE_ENTRY_BPS` | no | **`100`** | Entry slippage, basis points |
| `SLIPPAGE_EXIT_BPS` | no | **`150`** | Exit slippage, basis points |
| `MAX_DAILY_LOSS_USDC` | no | **`15`** | Realized-loss circuit breaker. Bot halts when hit. |
| `RESUME` | no | `false` | One-shot: set to `true` to clear halt on next boot, then remove. |
| `DB_PATH` | Railway | `/data/ledger.db` | Set by Dockerfile. Must be under the mounted volume. |

---

## Operational runbook

### Check what the bot is doing

```bash
curl -sS https://<your-url>/status
railway logs --service flash-trade-bot --lines 100
```

### Bot halted (daily loss hit, or fatal error)

The bot persists halt state in `ledger.db`. Clear it one of two ways:

```bash
# Option A: RESUME=true at boot
railway variables set RESUME=true
railway redeploy
# then remove it:
railway variables delete RESUME
```

Or edit the SQLite directly if you have shell access (`railway shell`):

```bash
sqlite3 /data/ledger.db \
  "UPDATE bot_state SET value='false' WHERE key='halted';
   UPDATE bot_state SET value='' WHERE key='halt_reason';"
# no redeploy needed — bot re-reads bot_state on every webhook
```

### Position drift (someone closed via flash.trade UI)

If `/status` shows `open_positions` but flash.trade's UI shows nothing, reconcile:

```bash
railway shell
sqlite3 /data/ledger.db \
  "UPDATE positions SET closed_at = CAST(strftime('%s','now') AS INTEGER)*1000
    WHERE id='<stale-positionKey>' AND closed_at IS NULL;"
```

### Rotate your webhook secret (quarterly, or on suspected leak)

```bash
railway variables set WEBHOOK_SECRET="$(openssl rand -hex 32)"
railway redeploy
# Immediately update the JSON body in every TradingView alert. No grace period.
```

### Rotate your wallet

1. Close any open position in the flash.trade UI using the old key.
2. Generate a new wallet locally (step 2 above).
3. Fund the new wallet with USDC + SOL.
4. `railway variables set PRIVATE_KEY='<new base58>'`
5. `railway redeploy`.
6. Reset the ledger (old `positions` entries are now orphans):

```bash
railway shell
rm /data/ledger.db /data/ledger.db-shm /data/ledger.db-wal
# next boot recreates the schema
```

---

## Local development

Node 20 required (`better-sqlite3` prebuilt binaries). Use nvm: `nvm use 20`.

This repo is a [Turborepo](https://turborepo.com) monorepo. The trading bot lives in `apps/webhook-server/`. Future Telegram bot + Mini App will live in `apps/bot/` and `apps/mini-app/`. All commands below run from the repo root and delegate to turbo.

```bash
npm install
npm run typecheck

# API-shape validation against live mainnet (no signing, no keys loaded):
npm run dryrun

# Full server boot (requires a complete .env):
cp apps/webhook-server/.env.example apps/webhook-server/.env
chmod 600 apps/webhook-server/.env
# edit apps/webhook-server/.env with your values
npm run dev

# Helpers:
npm run balance    # wallet SOL + USDC
npm run trades     # recent signals, trades, positions, realized PnL
npm run fire       # fire a test webhook at 127.0.0.1:3000
```

See `AGENTS.md` for a deeper architectural overview.

---

## Known failure modes

- **Webhook during a redeploy is lost.** TradingView webhooks fire once with no retry. When Railway redeploys (~30-90s of downtime), any alert that fires is gone forever. Avoid redeploys during market hours if you can.
- **Mid-trade SIGTERM.** Railway can send SIGTERM during a redeploy even if the bot is mid-trade. The on-chain state is authoritative; the ledger may temporarily disagree. Reconcile manually (see runbook).
- **Helius rate limits.** Free tier supports ~10M requests/month, plenty for a single strategy. If you add a high-frequency strategy, upgrade.
- **Close-without-open halts the bot.** If you close a position via the flash.trade UI, the next close signal from TradingView will fail because `getOpenPosition()` in the ledger still shows it as open. The bot halts. Reconcile + resume.

Read `SECURITY-NOTES.md` for the trust boundaries.

---

## License and disclaimer

- Bot code: MIT — see [`LICENSE`](./LICENSE).
- Risk warnings and operational responsibilities: see [`DISCLAIMER.md`](./DISCLAIMER.md). You must read this in full before funding a wallet or deploying on mainnet.
- `tradingview-strategy.pine` is a schema-only example under the same MIT license. Bring your own real strategy — don't ship this one to production.
