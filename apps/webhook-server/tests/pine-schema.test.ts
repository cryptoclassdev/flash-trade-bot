import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STRATEGIES_DIR = join(__dirname, "..", "..", "..", "strategies");
const REGISTRY_PATH = join(STRATEGIES_DIR, "registry.json");

interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  asset: string;
  timeframe: string;
  longShort: "long" | "short" | "both";
  file: string;
  tags?: string[];
}

const registry: RegistryEntry[] = JSON.parse(
  readFileSync(REGISTRY_PATH, "utf8"),
);

test("Strategies registry: at least one strategy listed", () => {
  assert.ok(registry.length >= 1, "strategies/registry.json must list at least one strategy");
});

test("Strategies registry: each entry's id matches its filename", () => {
  for (const entry of registry) {
    assert.equal(
      entry.file,
      `${entry.id}.pine`,
      `entry.file must equal '<id>.pine' (got id=${entry.id}, file=${entry.file})`,
    );
  }
});

test("Strategies registry: every Pine file in strategies/ is registered", () => {
  const files = readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith(".pine"));
  const registeredFiles = new Set(registry.map((r) => r.file));
  for (const f of files) {
    assert.ok(
      registeredFiles.has(f),
      `${f} exists in strategies/ but is not in registry.json — orphan strategy`,
    );
  }
});

// Run the schema invariants against EVERY Pine file in the registry. Adding a
// new strategy that breaks the contract fails CI immediately.
for (const entry of registry) {
  const path = join(STRATEGIES_DIR, entry.file);

  test(`Pine schema [${entry.id}]: secret is sourced from input, not a TradingView placeholder`, () => {
    const src = readFileSync(path, "utf8");
    assert.ok(
      !src.includes("{{SECRET}}"),
      `${entry.file} contains {{SECRET}} which TradingView will NOT substitute in alert() calls. Use input.string() for the secret.`,
    );
    assert.ok(
      /input\.string\(\s*"[^"]*"\s*,\s*"[^"]*Secret/i.test(src),
      `${entry.file} should declare the webhook secret via input.string(...) with "Secret" in the title`,
    );
  });

  test(`Pine schema [${entry.id}]: no hardcoded hex secret leaks into the source`, () => {
    const src = readFileSync(path, "utf8");
    const hexSecretInJson = /"secret":"[0-9a-fA-F]{32,}"/;
    assert.ok(
      !hexSecretInJson.test(src),
      `${entry.file} has a hardcoded hex WEBHOOK_SECRET in a JSON field. Use Pine string concatenation against the WEBHOOK_SECRET input instead.`,
    );
    const concatPattern = /"secret":"'\s*\+\s*WEBHOOK_SECRET\s*\+\s*'"/;
    assert.ok(
      concatPattern.test(src),
      `${entry.file} should build the secret JSON field via: "secret":"' + WEBHOOK_SECRET + '"`,
    );
  });

  test(`Pine schema [${entry.id}]: alertJson emits all fields verify.ts requires`, () => {
    const src = readFileSync(path, "utf8");
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
      assert.ok(src.includes(field), `${entry.file} schema missing field ${field}`);
    }
  });
}
