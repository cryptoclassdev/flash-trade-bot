/**
 * scripts/dry-run.ts — API shape validation against mainnet /transaction-builder.
 *
 * Guarantees:
 *   1. process.env.DRY_RUN_ONLY is forced to "true" before config loads.
 *   2. DRY_RUN_WALLET_PUBKEY is what the API sees as `owner`. PRIVATE_KEY is NEVER read.
 *   3. The ApiBackend short-circuits before signing or broadcasting.
 *   4. Even if the flag were bypassed, cfg.walletKeypair is null so signing throws.
 *
 * Usage: npm run dryrun   (or: ts-node scripts/dry-run.ts)
 */

// Hard-pin dry-run env BEFORE importing any module that reads process.env.
process.env.DRY_RUN_ONLY = "true";
process.env.NETWORK = "mainnet-beta";
// Default wallet pubkey if user hasn't set one — this is the user's bot wallet.
if (!process.env.DRY_RUN_WALLET_PUBKEY) {
  process.env.DRY_RUN_WALLET_PUBKEY = "3k4ubZqLaqW1xXEYXxF7M2sx3n5Z1vRTLSTMbZ72KN94";
}

import dotenv from "dotenv";
dotenv.config();
// Re-apply hard pins after dotenv — .env must not override these:
process.env.DRY_RUN_ONLY = "true";
process.env.NETWORK = "mainnet-beta";

import { loadConfig, bpsToPctString } from "../src/config";
import { pickBackend } from "../src/flash";
import { FlashBackend } from "../src/types";

function assert(cond: any, msg: string): void {
  if (!cond) {
    console.error(`  ❌ ASSERT FAILED: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✅ ${msg}`);
  }
}

function fmt(n: any, digits = 2): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x.toFixed(digits);
}

async function runOpen(backend: FlashBackend, cfg: any, collateralUsdc: number, label: string): Promise<any> {
  console.log(`\n--- OPEN ${label}: $${collateralUsdc} collateral, ${cfg.leverage}x, LONG BTC ---`);
  const result = await backend.openPosition({
    side: "long",
    collateralUsdc,
    leverage: cfg.leverage,
    slippagePct: bpsToPctString(cfg.slippageEntryBps),
  });
  const raw = result.raw || {};
  console.log("response:");
  console.log(`  err                     : ${raw.err === null ? "null ✓" : JSON.stringify(raw.err)}`);
  console.log(`  newEntryPrice           : ${raw.newEntryPrice}`);
  console.log(`  newLeverage             : ${raw.newLeverage}`);
  console.log(`  newLiquidationPrice     : ${raw.newLiquidationPrice}`);
  console.log(`  entryFee                : ${raw.entryFee}`);
  console.log(`  entryFeeBeforeDiscount  : ${raw.entryFeeBeforeDiscount}`);
  console.log(`  openPositionFeePercent  : ${raw.openPositionFeePercent}`);
  console.log(`  youPayUsdUi             : ${raw.youPayUsdUi}`);
  console.log(`  youRecieveUsdUi         : ${raw.youRecieveUsdUi}`);
  console.log(`  marginFeePercentage     : ${raw.marginFeePercentage}`);
  console.log(`  availableLiquidity      : ${raw.availableLiquidity}`);
  console.log(`  outputAmountUi          : ${raw.outputAmountUi}`);
  console.log(`  transactionBase64 len   : ${typeof raw.transactionBase64 === "string" ? raw.transactionBase64.length : "N/A"}`);

  console.log("assertions:");
  assert(result.txSig === "DRYRUN_NOT_SUBMITTED", "txSig is sentinel (no broadcast)");
  const errOk = raw.err === null || raw.err === undefined || typeof raw.err === "string";
  assert(errOk, "err is null | undefined | string");
  const success = raw.err === null || raw.err === undefined;
  if (success) {
    assert(typeof raw.transactionBase64 === "string" && raw.transactionBase64.length > 100, "transactionBase64 is non-empty");
    assert(Number.isFinite(Number(raw.newEntryPrice)) && Number(raw.newEntryPrice) > 0, "newEntryPrice > 0");
    assert(Number.isFinite(Number(raw.newLiquidationPrice)) && Number(raw.newLiquidationPrice) > 0, "newLiquidationPrice > 0");
    assert(Number.isFinite(Number(raw.entryFee)) && Number(raw.entryFee) >= 0, "entryFee >= 0");
  }
  return raw;
}

async function runCloseFakeKey(backend: FlashBackend, cfg: any): Promise<any> {
  console.log(`\n--- CLOSE with fake positionKey ---`);
  const fakeKey = "11111111111111111111111111111111";
  const result = await backend.closePosition({
    positionKey: fakeKey,
    side: "long",
    slippagePct: bpsToPctString(cfg.slippageExitBps),
  });
  const raw = result.raw || {};
  console.log("response:");
  console.log(`  err                     : ${raw.err === null ? "null" : JSON.stringify(raw.err)}`);
  for (const k of Object.keys(raw)) {
    if (k === "transactionBase64" || k === "err") continue;
    console.log(`  ${k.padEnd(24)}: ${JSON.stringify(raw[k])}`);
  }
  console.log(`  transactionBase64 len   : ${typeof raw.transactionBase64 === "string" ? raw.transactionBase64.length : "N/A"}`);

  console.log("assertions:");
  assert(result.txSig === "DRYRUN_NOT_SUBMITTED", "txSig is sentinel (no broadcast)");
  assert(raw.err === null || typeof raw.err === "string", "err is null or string (API-validated, not malformed-request)");
  assert(raw.err !== null, "expected err !== null (fake positionKey should be rejected by API, not our code)");
  return raw;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  console.log(`[dry-run] mode: DRY_RUN_ONLY=true  network=${cfg.network}  wallet(owner)=${cfg.walletPubkey}`);
  console.log(`[dry-run] wallet keypair loaded? ${cfg.walletKeypair ? "YES (UNEXPECTED)" : "NO ✓ (secret not read)"}`);
  console.log(`[dry-run] API base URL: ${cfg.flashApiBaseUrl}`);

  const backend = pickBackend(cfg);

  // 1) Open $20 collateral (the production size)
  const open20 = await runOpen(backend, cfg, 20, "PRIMARY");

  // 2) Open $10 collateral (minimum-size probe)
  const open10 = await runOpen(backend, cfg, 10, "MIN-PROBE $10");

  // 3) Close with a fake positionKey — we expect the API to respond with an error
  const closeFake = await runCloseFakeKey(backend, cfg);

  // Summary
  console.log(`\n=========================== SUMMARY ===========================`);
  const ok = (e: any) => e === null || e === undefined;
  console.log(`open $20  err: ${ok(open20.err) ? "accepted (no err)" : JSON.stringify(open20.err)}`);
  console.log(`open $10  err: ${ok(open10.err) ? "accepted (no err)" : JSON.stringify(open10.err)}`);
  console.log(`close fake err: ${ok(closeFake.err) ? "UNEXPECTED null/undefined!" : JSON.stringify(closeFake.err)}`);

  if (ok(open20.err)) {
    console.log(`\nMarket snapshot (from open $20):`);
    console.log(`  BTC entry price    : $${fmt(open20.newEntryPrice)}`);
    console.log(`  Liquidation price  : $${fmt(open20.newLiquidationPrice)}`);
    console.log(`  Entry fee (USD)    : $${fmt(open20.entryFee, 4)}`);
    console.log(`  Pay / Receive USD  : $${fmt(open20.youPayUsdUi)} / $${fmt(open20.youRecieveUsdUi)}`);
  }
  console.log(`===============================================================`);

  if (process.exitCode) {
    console.error(`\n[dry-run] one or more assertions failed — exit ${process.exitCode}`);
  } else {
    console.log(`\n[dry-run] all assertions passed.`);
  }
}

main().catch((e) => {
  console.error("[dry-run] fatal:", e?.message || e);
  if (e?.response?.data) console.error("  API response:", JSON.stringify(e.response.data));
  process.exit(1);
});
