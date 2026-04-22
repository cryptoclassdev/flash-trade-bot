# flash-trade-bot

Automated perpetuals trading bot that takes TradingView strategy alerts and executes them on [flash.trade](https://flash.trade) (Solana mainnet).

Deploy it to Railway in about 10 minutes. One wallet per deploy.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?referralCode=)

> Replace the button URL with your published template link after your first deploy.

---

## Is this for you?

You are a **technical trader** who wants to run your own automated bot:
- You have your own TradingView Pro+ account and Pine strategy (or you'll write one).
- You can generate a Solana wallet and fund it with USDC.
- You understand that running an automated trading bot can lose money.
- You read every line of `SECURITY-NOTES.md` before deploying.

This is **not** a custodial service. You hold your own keys. You pay your own infra. You pick your own strategy. One deploy serves one user.

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
Express server (src/server.ts)
    │  verify secret → dedupe → insert signal → 202
    ▼
Executor (src/executor.ts)
    │  derive intent (flat→long = open, long→flat = close, long→short = flip)
    ▼
ApiBackend (src/flash.ts)
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

### 7. Set up TradingView alerts

For each entry/exit condition in your Pine strategy, create an alert with:

- **URL:** `https://<your-railway-url>/webhook`
- **Message body (JSON):**

```json
{
  "secret": "<your WEBHOOK_SECRET>",
  "id": "{{strategy.order.id}}-{{time}}",
  "action": "{{strategy.order.action}}",
  "ticker": "{{ticker}}",
  "contracts": "{{strategy.order.contracts}}",
  "price": "{{strategy.order.price}}",
  "position_size_after": "{{strategy.position_size}}",
  "market_position": "{{strategy.market_position}}",
  "prev_market_position": "{{strategy.prev_market_position}}",
  "order_comment": "{{strategy.order.comment}}",
  "time": "{{time}}"
}
```

A reference Pine strategy is in `tradingview-strategy.pine`.

That's it. When your strategy fires, the bot opens/closes/flips a position and notifies you on Telegram.

---

## Environment variables

See `.env.example` for the full template. Defaults in **bold**, secrets in *italic*.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NETWORK` | yes | `mainnet-beta` | `mainnet-beta` (production) or `devnet` (dormant, for code sanity only) |
| `I_UNDERSTAND_REAL_MONEY` | on mainnet | `no` | Must be literal `yes` to boot on mainnet |
| `DRY_RUN_ONLY` | no | `false` | If `true`, never signs or submits txs. Server refuses to boot in this mode (use `npm run dryrun`). |
| `RPC_URL_MAINNET` | yes (prod) | — | *Your paid Solana RPC. Public RPC will get rate-limited.* |
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

```bash
npm install
npm run typecheck

# API-shape validation against live mainnet (no signing, no keys loaded):
npm run dryrun

# Full server boot (requires a complete .env):
cp .env.example .env
chmod 600 .env
# edit .env with your values
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
