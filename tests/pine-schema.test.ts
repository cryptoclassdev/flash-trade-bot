import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PINE_PATH = join(__dirname, "..", "tradingview-strategy.pine");

test("Pine schema: secret is sourced from input, not a TradingView placeholder", () => {
  const src = readFileSync(PINE_PATH, "utf8");
  // TradingView does NOT substitute {{...}} placeholders in strings passed
  // to alert() — only in the alert dialog's Message field. Our Pine uses
  // alert(), so any {{SECRET}} literal would be sent verbatim and rejected
  // by verify.ts. Secret must come from input.string(...) instead.
  assert.ok(
    !src.includes("{{SECRET}}"),
    "tradingview-strategy.pine contains {{SECRET}} which TradingView will NOT substitute in alert() calls. Use input.string() for the secret."
  );
  assert.ok(
    /input\.string\(\s*"[^"]*"\s*,\s*"[^"]*Secret/i.test(src),
    "tradingview-strategy.pine should declare the webhook secret via input.string(...)"
  );
});

test("Pine schema: alertJson emits all fields verify.ts requires", () => {
  const src = readFileSync(PINE_PATH, "utf8");
  const required = [
    '"secret":"',
    '"id":"',
    '"action":"',
    '"ticker":"',
    '"contracts":"',
    '"price":"',
    '"position_size_after":"',
    '"market_position":"',
    '"prev_market_position":"',
    '"order_comment":"',
    '"time":"',
  ];
  for (const field of required) {
    assert.ok(src.includes(field), `Pine schema missing field ${field}`);
  }
});
