import crypto from "crypto";
import { RawWebhookPayload, Signal, MarketPosition, Action } from "./types";

const VALID_ACTIONS: Action[] = ["buy", "sell"];
const VALID_POSITIONS: MarketPosition[] = ["long", "short", "flat"];

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export interface ValidationOk {
  ok: true;
  signal: Signal;
}
export interface ValidationErr {
  ok: false;
  status: number;
  message: string;
}
export type ValidationResult = ValidationOk | ValidationErr;

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function parseFiniteNumber(s: unknown, name: string): number {
  if (!isString(s)) throw new Error(`${name} must be a non-empty string`);
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`${name} is not a finite number`);
  return n;
}

export function validatePayload(body: unknown, expectedSecret: string): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, message: "body must be a JSON object" };
  }
  const p = body as Partial<RawWebhookPayload>;

  if (!isString(p.secret)) return { ok: false, status: 401, message: "missing secret" };
  if (!constantTimeEqual(p.secret, expectedSecret)) {
    return { ok: false, status: 401, message: "invalid secret" };
  }

  try {
    if (!isString(p.id)) throw new Error("id must be a non-empty string");
    if (p.id.length > 200) throw new Error("id too long");
    if (!isString(p.action) || !VALID_ACTIONS.includes(p.action as Action)) {
      throw new Error("action must be 'buy' or 'sell'");
    }
    if (!isString(p.ticker)) throw new Error("ticker required");
    if (!isString(p.market_position) || !VALID_POSITIONS.includes(p.market_position as MarketPosition)) {
      throw new Error("market_position must be 'long' | 'short' | 'flat'");
    }
    if (!isString(p.prev_market_position) || !VALID_POSITIONS.includes(p.prev_market_position as MarketPosition)) {
      throw new Error("prev_market_position must be 'long' | 'short' | 'flat'");
    }
    if (!isString(p.time)) throw new Error("time required");

    const price = parseFiniteNumber(p.price, "price");
    if (price <= 0 || price > 10_000_000) throw new Error("price out of expected range");

    parseFiniteNumber(p.contracts, "contracts");
    parseFiniteNumber(p.position_size_after, "position_size_after");

    const signal: Signal = {
      id: p.id!,
      receivedAt: Date.now(),
      rawPayload: JSON.stringify({ ...p, secret: "[REDACTED]" }),
      action: p.action as Action,
      ticker: p.ticker!,
      price,
      marketPosition: p.market_position as MarketPosition,
      prevMarketPosition: p.prev_market_position as MarketPosition,
      orderComment: typeof p.order_comment === "string" ? p.order_comment : "",
      time: p.time!,
    };
    return { ok: true, signal };
  } catch (e: any) {
    return { ok: false, status: 400, message: e?.message || "invalid payload" };
  }
}
