# Disclaimer

**Read this in full before deploying or using this software.**

## Not financial advice

Nothing in this repository — the code, the README, the comments, the example Pine strategy, or any other file — constitutes financial, investment, tax, or legal advice. The software automates the execution of trading decisions you, the operator, make. You are solely responsible for the strategy you configure, the trades it produces, and every resulting gain or loss.

If you are unsure whether automated derivatives trading is appropriate for you, consult a licensed professional in your jurisdiction before deploying this software.

## No warranty

This software is provided **"as is"**, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. See `LICENSE`.

The author(s) and contributors make no guarantees that:
- The bot will execute trades correctly in all market conditions.
- The bot will be available, online, or responsive at any particular time.
- TradingView webhooks will arrive, or arrive in order.
- The underlying exchange (flash.trade), RPC provider, or hosting platform will remain operational.
- Third-party dependencies (flash-sdk, @solana/web3.js, express, etc.) are free of defects or vulnerabilities.

A bug, a network outage, a dependency regression, a Railway incident, an RPC hiccup, or a price-feed glitch can all cause incorrect trades, missed trades, or liquidations. **The software will at some point misbehave.** Configure position sizes accordingly.

## You can lose money

**Perpetual futures are leveraged derivatives.** You can lose more than your initial collateral, up to 100% on liquidation. Historical backtests of any strategy — including the example Pine script in this repo — do not predict future results.

Start with trivially small sizes. Use `DRY_RUN_ONLY=true` to validate the API path before risking capital. Keep your wallet balance capped at the amount you are prepared to lose entirely. The bot's `MAX_DAILY_LOSS_USDC` circuit breaker is not a guarantee — it halts opens after realized losses cross the threshold, but open positions can still be liquidated in one candle.

## Your jurisdiction may prohibit this

Automated derivatives trading, perpetual futures, and on-chain margin trading are regulated differently in every country. In some jurisdictions they are restricted to accredited investors, or prohibited outright for retail users. It is **your** responsibility — not the author's — to determine whether you are legally permitted to use this software where you live.

Examples of jurisdictions where flash.trade, Solana-based perpetuals, or automated trading may be restricted (non-exhaustive, check current local rules): United States (CFTC/SEC rules on retail perpetuals), United Kingdom (FCA restrictions on crypto derivatives for retail), parts of the European Union (MiCA / national securities laws).

If operating the bot would violate your local law, **do not deploy it**.

## Operational responsibility

By deploying this software, you accept responsibility for:

- **Wallet security.** The private key you paste into Railway (or any host) controls real funds. Never reuse a wallet, never share the key, cap the balance.
- **Secret hygiene.** `WEBHOOK_SECRET`, `PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `RPC_URL_*` — treat all as credentials. Rotate on every suspected leak.
- **Monitoring.** Check `/status`, watch Telegram, verify realized PnL matches the flash.trade UI. If they diverge, halt the bot and reconcile manually.
- **Upgrades.** When this repo ships fixes, you are responsible for redeploying. Old versions will not be patched retroactively.
- **Tax reporting.** Every trade the bot executes is a taxable event in most jurisdictions. Track your trades (`npm run trades` exports from SQLite), reconcile to on-chain data, and report as required.

## No liability

In no event shall the author(s), contributors, or copyright holders be liable for any direct, indirect, incidental, special, exemplary, or consequential damages — including but not limited to lost profits, lost capital, lost data, missed trades, or forced liquidations — arising from or in connection with this software, even if advised of the possibility of such damage.

## If you do not accept these terms

Do not deploy or run this software. Fork it, remove it from your Railway account, and stop using it.

## Acknowledgment

By setting `I_UNDERSTAND_REAL_MONEY=yes` in your `.env` or Railway environment, you acknowledge that you have read, understood, and accepted this disclaimer in full.
