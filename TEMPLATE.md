# Deploy and Host flash-trade-bot on Railway

flash-trade-bot is a self-hosted bot that turns TradingView strategy alerts into real perpetual-futures trades on flash.trade (Solana mainnet). It authenticates incoming webhooks, derives open/close/flip intents from position transitions, signs Solana transactions locally with your keypair, and notifies you on Telegram. You hold the keys. You bring the Pine strategy. One deploy, one trader.

## About Hosting flash-trade-bot

Deploying flash-trade-bot on Railway gives you an always-on Express server behind Railway's HTTPS edge, a SQLite audit ledger on a mounted persistent volume, auto-restart on failure, graceful shutdown on redeploys, and a public webhook URL your TradingView alerts POST to. You bring a freshly generated Solana wallet, a paid RPC endpoint, a Telegram bot for notifications, and your own Pine strategy. The bot boots with `I_UNDERSTAND_REAL_MONEY=no` by default so you can verify `/health`, `/status`, and the full pipeline end-to-end before flipping the switch on live trading.

## Common Use Cases

- Run your own TradingView Pine strategy against flash.trade perpetuals 24/7 without keeping a laptop online.
- Automate entries, exits, and position flips on Solana-based perps without handing custody of your wallet to a third-party service.
- Validate a new strategy on small size with built-in safety guards: explicit real-money acknowledgment, daily-loss circuit breaker, slippage tolerance, webhook-secret authentication, and a dry-run mode that never signs.

## Dependencies for flash-trade-bot Hosting

- A freshly generated Solana wallet (base58 secret key). Never reuse an existing wallet. Fund with only what you can afford to lose.
- A small USDC balance on the wallet plus about 0.02 SOL for gas.
- A paid Solana mainnet RPC endpoint. The public endpoint is rate-limited and will drop trades.
- A TradingView Pro+ subscription. Free and Essential tiers cannot send webhook alerts.
- A Telegram bot token from @BotFather and your numeric chat id for trade notifications.
- A Pine strategy that emits webhook alerts in the schema this bot validates. A reference example ships with the repo.

### Deployment Dependencies

- [Helius RPC (free tier)](https://www.helius.dev/)
- [TradingView Pro+ pricing](https://www.tradingview.com/pricing/)
- [@BotFather on Telegram](https://t.me/BotFather)
- [Solana CLI install guide](https://docs.solana.com/cli/install-solana-cli-tools)
- [flash.trade](https://flash.trade/)
- [Source repository](https://github.com/cryptoclassdev/flash-trade-bot)

### Implementation Details

The bot exposes four HTTP endpoints behind Railway's edge:

- `POST /webhook`: TradingView signal ingress. Constant-time secret check, dedupe by signal id, async executor.
- `GET /health`: liveness plus halt state. Used by Railway's healthcheck and your own monitoring.
- `GET /status`: open positions, last signal timestamp, realized PnL today, live trading parameters.
- `GET /export?secret=...`: gzipped SQLite backup of the ledger for off-site archival.

Trade intents are derived from the TradingView position transition:

```
flat  -> long   = open long
flat  -> short  = open short
long  -> flat   = close long
short -> flat   = close short
long  -> short  = flip
short -> long   = flip
same  -> same   = noop
```

Railway-specific constraints: `numReplicas=1` (SQLite plus multi-instance equals corruption), volume mounted at `/data` for the ledger database, graceful SIGTERM drain with a 25-second deadline before Railway's SIGKILL, and rate limiting on `/webhook` at 60 requests per minute per IP. Full architecture, operational runbook, and the risk disclaimer live in the repo's `README.md`, `AGENTS.md`, `SECURITY-NOTES.md`, and `DISCLAIMER.md`.

## Why Deploy flash-trade-bot on Railway?

Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying flash-trade-bot on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.
