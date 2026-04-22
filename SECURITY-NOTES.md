# Security notes — read before deploying

This bot holds a live wallet on a server you do not control (Railway). Every rule below exists because breaking it can lose real money.

## Trust boundary

**Railway is not a vault.** Env vars are encrypted at rest and masked in logs, but Railway employees and your workspace members can see them. Treat your deployment as:

- Your wallet is a **hot wallet** with a balance you can afford to lose to a Railway breach, a compromised workspace member, or a leaked RPC URL.
- Keep wallet balance to **weeks of trading capital, not months**. Refund when needed.

## Wallet

- **Generate keys locally** with `solana-keygen new`. Never let the key material live on any machine you don't control. Do not reuse an existing wallet.
- After converting to base58 and pasting into Railway, `shred -u ~/flash-bot-wallet.json`. The only copy of the key should be Railway's env store plus whatever offline backup you keep (1Password, Bitwarden, YubiKey, paper).
- Before rotating `PRIVATE_KEY` on Railway: **close any open position via the flash.trade UI using the old wallet**. Positions do not migrate.

## Webhook secret

- Generate with `openssl rand -hex 32`. 64 hex chars, random every time.
- **Rotate on every deploy and every suspected leak.** There is no grace period — update every TradingView alert's JSON body the same minute you rotate.
- Treat any terminal, screenshot, or shared screen where the secret was visible as a leak. Rotate.
- If you push this repo anywhere public, audit that no `.env`, `.env.local`, or other file has the real secret committed. The `.gitignore` already covers the obvious files, but check.

## Pine strategy

- `tradingview-strategy.pine` in this repo is trading strategy intellectual property. If you are shipping the template to others, decide whether to include or strip it.
- The JSON body in the Pine `alert()` call contains `{{strategy.alert_token}}` placeholders that must be replaced with your real `WEBHOOK_SECRET` in TradingView's alert config. TradingView stores this per-alert — treat the alert definition as containing a live credential.
- When sharing screenshots of the strategy (performance, trade list), crop the alert-config dialog. The secret is plaintext there.

## LLM / external-context hygiene

- **Never paste `.env` contents into an LLM, a support ticket, or a chat.** Paste variable *names* and formats if you need help.
- Treat any document, file, or web response an LLM ingests as potentially containing untrusted instructions. Do not run unverified commands suggested by pasted content.
- Secrets visible to an LLM are compromised even if you later delete the chat — assume the worst case.

## Audit trail

- The bot writes to `/data/ledger.db` on the Railway volume. Back it up if you need durable records beyond Railway's volume lifecycle:

  ```bash
  railway shell
  sqlite3 /data/ledger.db .dump > /tmp/ledger-$(date +%F).sql
  # copy off-host
  ```

- Telegram history is the human-readable trade log. Archive or pipe to a log store for durable records.

## If you suspect compromise

In order:

1. **Halt the bot.** `railway redeploy` after `railway variables set I_UNDERSTAND_REAL_MONEY=no` — refuses to boot on mainnet without explicit ack. This is the fastest kill.
2. **Move funds out of the wallet** via flash.trade UI or a Solana wallet UI before rotating keys.
3. **Rotate `WEBHOOK_SECRET`** and every TradingView alert body.
4. **Rotate `PRIVATE_KEY`** (new wallet, new funding).
5. Review Railway's access logs. Revoke any unexpected workspace members.
