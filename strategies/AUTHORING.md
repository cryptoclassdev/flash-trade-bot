# Authoring a strategy for flash-trade-bot

Every Pine file in `strategies/` must conform to the contract below.
The dashboard and bot rely on this shape to inject your secret, route
signals, and dedupe webhooks correctly.

If you write a new Pine and want it in the dashboard's strategy library,
PR it here. The CI `pine-schema.test.ts` test loops the registry and
verifies each file passes the invariants automatically.

---

## 1. Pine version + shape

```pinescript
//@version=6

strategy("Your Strategy Name", overlay=true, ...)
```

Indicators (`indicator(...)`) are not supported. The bot needs entry/exit
signals which only `strategy()` Pine produces.

## 2. WEBHOOK_SECRET input — required

Right after the `strategy(...)` declaration, declare this exact input:

```pinescript
WEBHOOK_SECRET = input.string("", "Webhook Secret (from your bot)", confirm=true, group="Bot Integration",
     tooltip="Set this to the WEBHOOK_SECRET shown on your dashboard's TradingView screen.")

if barstate.isfirst and WEBHOOK_SECRET == ""
    runtime.error("WEBHOOK_SECRET input is empty. Re-download the Pine file from your dashboard.")
```

The dashboard's `/pine-source` endpoint runs `packages/shared/pine-gen.ts`
which uses this regex to inject the user's secret as the default value:

```
/(WEBHOOK_SECRET\s*=\s*input\.string\(\s*)"[^"]*"(\s*,\s*"[^"]*Secret)/i
```

If your input declaration doesn't match (different name, missing the
word "Secret" in the title, multi-line declaration), injection fails
and the dashboard returns an error instead of serving the file.

## 3. alertJson() helper — required

Copy this verbatim. The bot's `verify.ts` rejects payloads that don't
match exactly:

```pinescript
alertJson(string action, string nextPos, string prevPos, string comment) =>
    '{"secret":"' + WEBHOOK_SECRET + '"' +
    ',"id":"' + str.tostring(time) + '-' + action + '-' + nextPos + '"' +
    ',"action":"' + action + '"' +
    ',"ticker":"' + syminfo.ticker + '"' +
    ',"contracts":"' + str.tostring(strategy.position_size) + '"' +
    ',"price":"' + str.tostring(close) + '"' +
    ',"position_size_after":"' + str.tostring(strategy.position_size) + '"' +
    ',"market_position":"' + nextPos + '"' +
    ',"prev_market_position":"' + prevPos + '"' +
    ',"order_comment":"' + comment + '"' +
    ',"time":"' + str.tostring(time) + '"}'
```

Required fields (the test enforces these):
`secret`, `id`, `action`, `ticker`, `contracts`, `price`,
`position_size_after`, `market_position`, `prev_market_position`,
`order_comment`, `time`.

`signal.id` must be unique per emission. The recommended pattern is
`time-action-nextPos` which guarantees uniqueness across a single bar
even when multiple alerts fire.

## 4. alert() calls — fire on every position transition

The bot derives intent from `prev_market_position` → `market_position`:

| Transition | Bot dispatches |
| --- | --- |
| `flat` → `long` | open long |
| `flat` → `short` | open short |
| `long` → `flat` | close long |
| `short` → `flat` | close short |
| `long` → `short` | atomic flip via `/transaction-builder/reverse-position` |
| `short` → `long` | atomic flip |
| same → same | noop |

You must `alert(alertJson(...), alert.freq_once_per_bar_close)` at every
strategy.entry / strategy.close / stop-fill. **One alert per logical
transition.** A flip is one alert, not two.

Example for an entry that may also be a flip:

```pinescript
if canEnterLong
    prevPos = inShort ? "short" : "flat"
    comment = inShort ? "Reverse to Long" : "LONG"
    if inShort and reverseOnSignal
        strategy.close("Short")
    strategy.entry("Long", strategy.long)
    alert(alertJson("buy", "long", prevPos, comment), alert.freq_once_per_bar_close)
```

## 5. Stop-loss fill detection

When `strategy.exit(stop=...)` fills, the position transitions from
open to flat — but Pine has no per-call hook. Detect at end-of-bar:

```pinescript
bool botAlertedThisBar = false
// ... in every entry/close block: botAlertedThisBar := true ...

var float botPrevPositionSize = 0

if prevHadPosition and not hasPositionNow and not botAlertedThisBar
    wasLong = botPrevPositionSize > 0
    if wasLong
        alert(alertJson("sell", "flat", "long", "Stop hit"), alert.freq_once_per_bar_close)
    else
        alert(alertJson("buy", "flat", "short", "Stop hit"), alert.freq_once_per_bar_close)

botPrevPositionSize := strategy.position_size
```

Without this, stop fills go unnoticed and the bot's on-chain position
desyncs from TradingView's simulation.

## 6. Hardcoded secrets — banned

The CI test fails on any 32+ char hex literal inside a `"secret":"..."` JSON
field. The only acceptable secret source is the `WEBHOOK_SECRET` input.

This protects against:
- Committing a real WEBHOOK_SECRET by accident
- A user pasting their secret directly into the script source

## 7. Register your strategy

Add an entry to `strategies/registry.json`:

```json
{
  "id": "your-strategy-id",
  "name": "Human Readable Name",
  "description": "One paragraph describing the strategy. ~200 chars.",
  "asset": "BTC",
  "timeframe": "5m",
  "longShort": "both",
  "file": "your-strategy-id.pine",
  "tags": ["category", "subcategory"]
}
```

`id` must match `file` minus the `.pine` extension.
`longShort` is one of `"long"`, `"short"`, or `"both"`.

The dashboard's `/strategies` page reads this registry and renders one
card per entry.

## 8. Test before PR

```bash
npm test  # pine-schema.test.ts loops registry and asserts each file conforms
```

If the test passes locally, CI will too.
