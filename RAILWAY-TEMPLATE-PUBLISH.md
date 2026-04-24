# Publishing the Railway Template

One-time checklist for publishing `flash-trade-bot` as a Railway template.
Delete this file after the template is live; the URL goes in `README.md`.

## Pre-flight

- [ ] PR #1 (`chore/turborepo`) merged to `main`
- [ ] PR #2 (`feat/dashboard-plan`) merged to `main`
- [ ] Railway service pointing at `main` has redeployed successfully
- [ ] `/health` on your Railway domain returns `{"status":"ok","setup_mode":...}`
- [ ] Your Railway URL serves the dashboard at `/` (you see the landing page)
- [ ] You've walked the wizard end-to-end yourself at least once

## Railway dashboard steps

1. Railway dashboard → your project → **Settings** → **Publish Template**
2. Fill the template metadata:

### Template name
```
flash-trade-bot
```

### Short description (75 char max)
```
Self-hosted Solana perps trading bot with a built-in setup dashboard.
```

### README / long description
Paste the contents of `TEMPLATE.md` (at repo root).

### Category
```
Developer Tools
```
or
```
Finance
```

### Tags
```
solana, trading, telegram, tradingview, bot, perps, webhooks
```

### Repository
```
https://github.com/cryptoclassdev/flash-trade-bot
```

### Branch
```
main
```

### Dockerfile path
```
apps/webhook-server/Dockerfile
```

This is already set in `railway.toml` — Railway picks it up automatically.

### Volumes
```
/data
```
Mount at `/data`. Required — SQLite ledger lives here; without it, positions and halt state wipe on every redeploy.

### Environment variables

Paste these **with defaults** in Railway's template editor. The dashboard (served by the bot post-deploy) walks users through filling everything left blank.

```
SETUP_MODE=true
NETWORK=mainnet-beta
I_UNDERSTAND_REAL_MONEY=yes
DRY_RUN_ONLY=false
ASSET=BTC
COLLATERAL_USDC=20
LEVERAGE=2
SLIPPAGE_ENTRY_BPS=100
SLIPPAGE_EXIT_BPS=150
MAX_DAILY_LOSS_USDC=15
RPC_URL_MAINNET=
RPC_URL_MAINNET_FALLBACK=
PRIVATE_KEY=
WEBHOOK_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

**Key insight**: `SETUP_MODE=true` is the default so the bot boots into dashboard-only mode on first deploy. The user fills the blank vars using the dashboard, then removes `SETUP_MODE` to enable trading.

If Railway's editor asks for per-variable descriptions, copy/paste these:

| Variable | Description |
| --- | --- |
| `SETUP_MODE` | Leave as `true` for first deploy. Remove this variable after you complete the dashboard wizard to enable trading. |
| `NETWORK` | Solana network. `mainnet-beta` for live trading, `devnet` is dormant. |
| `I_UNDERSTAND_REAL_MONEY` | Must be literal `yes` to trade on mainnet. You are acknowledging real-money risk. |
| `DRY_RUN_ONLY` | Keep `false`. Set to `true` only for script-based API validation (not webhooks). |
| `ASSET` | Market symbol on flash.trade. `BTC` is the default; change only if the dashboard supports multiple. |
| `COLLATERAL_USDC` | Per-trade collateral, USD. Dashboard sets this via a slider. |
| `LEVERAGE` | Leverage multiplier 1-10. Dashboard sets via slider. |
| `SLIPPAGE_ENTRY_BPS` | Entry slippage tolerance, basis points. 100 = 1%. |
| `SLIPPAGE_EXIT_BPS` | Exit slippage tolerance, basis points. Usually higher than entry. |
| `MAX_DAILY_LOSS_USDC` | Daily realized-loss circuit breaker. Bot auto-halts when hit; auto-clears at UTC midnight. |
| `RPC_URL_MAINNET` | Paid Solana RPC endpoint. Public RPC rate-limits under load. Dashboard links you to Helius. |
| `RPC_URL_MAINNET_FALLBACK` | Optional secondary RPC. Used when primary throws dropped/timeout/5xx. |
| `PRIVATE_KEY` | Base58 Solana secret key. Generate via the dashboard; never reuse a personal wallet. |
| `WEBHOOK_SECRET` | Shared secret for TradingView webhook auth. Dashboard generates automatically. |
| `TELEGRAM_BOT_TOKEN` | BotFather token. Dashboard links to @BotFather. |
| `TELEGRAM_CHAT_ID` | Numeric chat id for notifications. Dashboard auto-fetches via Telegram API. |

3. Click **Publish**.
4. Railway gives you a public template URL. Copy it.

## Post-publish

1. Copy the template URL from Railway (format: `https://railway.com/new/template?referralCode=XXX` or `https://railway.com/template/XXX`).
2. Update `README.md`:
    ```md
    [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/<your-id>)
    ```
3. Delete this file (`RAILWAY-TEMPLATE-PUBLISH.md`) — it was a one-time checklist.
4. Commit and push:
    ```bash
    git rm RAILWAY-TEMPLATE-PUBLISH.md
    git commit -am "docs: update Railway template URL in README"
    git push
    ```
5. Test the button yourself: click it in a private browser window, deploy to a throwaway Railway project, walk the wizard, verify everything works end-to-end.
6. Share the URL on X / HN / crypto Telegram groups per `DASHBOARD-PLAN.md` §7 launch plan.

## What NOT to include in the template

- Your existing `PRIVATE_KEY`, `WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — users generate their own
- `RESUME` — operational only, never a deploy default
- `DASHBOARD_TOKEN` — only needed for cross-origin dashboards (same-origin bundled deploy doesn't need it)
- `DASHBOARD_ORIGIN` — same reason
- `DB_PATH` — set by the Dockerfile, not by the user
