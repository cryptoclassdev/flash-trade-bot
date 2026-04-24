import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validatePayload, constantTimeEqual } from "../src/verify";

const SECRET = "a".repeat(64);

function goodPayload(overrides: Record<string, unknown> = {}) {
  return {
    secret: SECRET,
    id: "test-1",
    action: "buy",
    ticker: "BTCUSD",
    contracts: "0.001",
    price: "65000",
    position_size_after: "0.001",
    market_position: "long",
    prev_market_position: "flat",
    order_comment: "unit test",
    time: "2026-04-22T00:00:00Z",
    ...overrides,
  };
}

test("constantTimeEqual: equal strings are equal", () => {
  assert.equal(constantTimeEqual("abc", "abc"), true);
});

test("constantTimeEqual: different lengths are not equal", () => {
  assert.equal(constantTimeEqual("abc", "abcd"), false);
});

test("constantTimeEqual: same length different content is not equal", () => {
  assert.equal(constantTimeEqual("abc", "abd"), false);
});

test("validatePayload: good payload is accepted", () => {
  const r = validatePayload(goodPayload(), SECRET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.signal.action, "buy");
    assert.equal(r.signal.price, 65000);
  }
});

test("validatePayload: missing secret -> 401", () => {
  const r = validatePayload(goodPayload({ secret: undefined }), SECRET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 401);
});

test("validatePayload: wrong secret -> 401", () => {
  const r = validatePayload(goodPayload({ secret: "b".repeat(64) }), SECRET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 401);
});

test("validatePayload: bad action -> 400", () => {
  const r = validatePayload(goodPayload({ action: "yolo" }), SECRET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("validatePayload: bad market_position -> 400", () => {
  const r = validatePayload(goodPayload({ market_position: "sideways" }), SECRET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("validatePayload: non-positive price -> 400", () => {
  const r = validatePayload(goodPayload({ price: "0" }), SECRET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("validatePayload: price out of upper range -> 400", () => {
  const r = validatePayload(goodPayload({ price: "20000000" }), SECRET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("validatePayload: non-object body -> 400", () => {
  const r = validatePayload("not-an-object", SECRET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("validatePayload: raw_payload redacts the secret", () => {
  const r = validatePayload(goodPayload(), SECRET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(r.signal.rawPayload.includes("[REDACTED]"));
    assert.ok(!r.signal.rawPayload.includes(SECRET));
  }
});
