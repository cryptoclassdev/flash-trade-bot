import { test } from "node:test";
import { strict as assert } from "node:assert";
import { deriveIntent } from "../src/executor";

test("deriveIntent: flat -> long = open long", () => {
  assert.deepEqual(deriveIntent("flat", "long"), { kind: "open", side: "long" });
});

test("deriveIntent: flat -> short = open short", () => {
  assert.deepEqual(deriveIntent("flat", "short"), { kind: "open", side: "short" });
});

test("deriveIntent: long -> flat = close long", () => {
  assert.deepEqual(deriveIntent("long", "flat"), { kind: "close", side: "long" });
});

test("deriveIntent: short -> flat = close short", () => {
  assert.deepEqual(deriveIntent("short", "flat"), { kind: "close", side: "short" });
});

test("deriveIntent: long -> short = flip long->short", () => {
  assert.deepEqual(deriveIntent("long", "short"), { kind: "flip", from: "long", to: "short" });
});

test("deriveIntent: short -> long = flip short->long", () => {
  assert.deepEqual(deriveIntent("short", "long"), { kind: "flip", from: "short", to: "long" });
});

test("deriveIntent: same position = noop", () => {
  assert.equal(deriveIntent("long", "long").kind, "noop");
  assert.equal(deriveIntent("short", "short").kind, "noop");
  assert.equal(deriveIntent("flat", "flat").kind, "noop");
});
