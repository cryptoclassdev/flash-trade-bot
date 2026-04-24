import { test } from "node:test";
import { strict as assert } from "node:assert";
import { classify } from "../src/retry";

test("classify: BlockhashNotFound -> blockhash", () => {
  assert.equal(classify(new Error("BlockhashNotFound: blockhash not found")).cls, "blockhash");
});

test("classify: blockhash expired message -> blockhash", () => {
  assert.equal(classify(new Error("tx blockhash expired")).cls, "blockhash");
});

test("classify: slippage words -> slippage", () => {
  assert.equal(classify(new Error("MaxSlippage exceeded")).cls, "slippage");
  assert.equal(classify(new Error("price moved beyond tolerance")).cls, "slippage");
  assert.equal(classify(new Error("priceAfterSlippage validation failed")).cls, "slippage");
});

test("classify: dropped / throttled -> dropped", () => {
  assert.equal(classify(new Error("TransactionExpired before confirmation")).cls, "dropped");
  assert.equal(classify(new Error("rate limited, try again")).cls, "dropped");
  assert.equal(classify(new Error("HTTP 429 from rpc")).cls, "dropped");
  assert.equal(classify(new Error("HTTP 503 service unavailable")).cls, "dropped");
  assert.equal(classify(new Error("request timeout after 30s")).cls, "dropped");
});

test("classify: unknown error -> fatal (default)", () => {
  assert.equal(classify(new Error("Insufficient Funds, Token Account doesn't exist")).cls, "fatal");
  assert.equal(classify(new Error("UnsupportedProgramId")).cls, "fatal");
  assert.equal(classify(new Error("totally unknown failure")).cls, "fatal");
});

test("classify: non-Error inputs are handled", () => {
  assert.equal(classify("blockhash expired").cls, "blockhash");
  assert.equal(classify({ message: "rate limit hit" }).cls, "dropped");
  assert.equal(classify({ weird: "shape" }).cls, "fatal");
});
