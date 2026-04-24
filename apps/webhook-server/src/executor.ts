import { Connection } from "@solana/web3.js";
import { Signal, Intent, Side, MarketPosition, FlashBackend } from "./types";
import { AppConfig, bpsToPctString } from "./config";
import {
  insertTrade,
  updateTrade,
  insertPosition,
  closePositionRow,
  getOpenPosition,
  updateSignalStatus,
} from "./ledger";
import { tg, shortSig } from "./telegram";
import { withRetry } from "./retry";
import { waitForSignature, expectPositionOpened, expectPositionClosed } from "./confirm";
import { checkDailyLossLimit, halt, isHalted } from "./halt";

export function deriveIntent(prev: MarketPosition, next: MarketPosition): Intent {
  if (prev === next) return { kind: "noop", reason: `prev=${prev}, market=${next}` };
  if (prev === "flat" && next === "long") return { kind: "open", side: "long" };
  if (prev === "flat" && next === "short") return { kind: "open", side: "short" };
  if (prev === "long" && next === "flat") return { kind: "close", side: "long" };
  if (prev === "short" && next === "flat") return { kind: "close", side: "short" };
  if (prev === "long" && next === "short") return { kind: "flip", from: "long", to: "short" };
  if (prev === "short" && next === "long") return { kind: "flip", from: "short", to: "long" };
  return { kind: "noop", reason: `unhandled prev=${prev}, market=${next}` };
}

export interface Deps {
  cfg: AppConfig;
  backend: FlashBackend;
  conn: Connection;
}

export async function execute(signal: Signal, deps: Deps): Promise<void> {
  const { cfg, backend, conn } = deps;
  const intent = deriveIntent(signal.prevMarketPosition, signal.marketPosition);
  console.log(`[executor] signal=${signal.id} intent=${JSON.stringify(intent)}`);
  updateSignalStatus(signal.id, "processing");

  if (intent.kind === "noop") {
    console.log(`[executor] noop — ${intent.reason}`);
    updateSignalStatus(signal.id, "filled");
    return;
  }

  // Halt blocks new opens, but never blocks closes (we want to reduce risk).
  if (isHalted() && intent.kind === "open") {
    const msg = "halted: open refused (RESUME=true to resume)";
    console.warn(`[executor] ${msg}`);
    insertTrade({ signalId: signal.id, attempt: 1, status: "failed", errorMessage: msg });
    updateSignalStatus(signal.id, "failed");
    return;
  }

  try {
    if (intent.kind === "open") {
      await runOpen(signal, intent.side, deps);
    } else if (intent.kind === "close") {
      await runClose(signal, intent.side, deps);
    } else {
      // flip
      await runFlip(signal, intent.from, intent.to, deps);
    }
  } catch (e: any) {
    const errMsg = e?.message || String(e);
    console.error(`[executor] uncaught error on signal=${signal.id}: ${errMsg}`);
    updateSignalStatus(signal.id, "failed");
    await tg.failed(1, errMsg).catch(() => {});
    await halt(`Executor crashed on signal ${signal.id}: ${errMsg}`).catch(() => {});
  }
}

async function runOpen(signal: Signal, side: Side, deps: Deps): Promise<void> {
  const { cfg, backend, conn } = deps;
  const sizeUsd = cfg.collateralUsdc * cfg.leverage;
  await tg.attempting(side, sizeUsd, signal.ticker, signal.price);

  const result = await withRetry(async (ctx) => {
    const tradeId = insertTrade({
      signalId: signal.id, attempt: ctx.attempt, status: "pending",
      side, sizeUsd, entryPrice: signal.price,
    });
    const r = await backend.openPosition({
      side, collateralUsdc: cfg.collateralUsdc, leverage: cfg.leverage,
      slippagePct: bpsToPctString(cfg.slippageEntryBps),
    });
    updateTrade(tradeId, { status: "sent", txSignature: r.txSig });
    const confirmed = await waitForSignature(conn, r.txSig, { timeoutMs: 30_000 });
    if (!confirmed) throw new Error(`tx ${r.txSig} not confirmed within 30s (likely dropped)`);
    const onchain = await expectPositionOpened(backend, cfg.asset, side);
    if (!onchain.ok) throw new Error(onchain.reason);

    updateTrade(tradeId, {
      status: "confirmed",
      confirmedAt: Date.now(),
      entryPrice: r.fillPrice ?? signal.price,
    });
    insertPosition({
      positionKey: onchain.positionKey,
      openedSignalId: signal.id,
      side,
      sizeUsd,
      collateralUsd: cfg.collateralUsdc,
      entryPrice: r.fillPrice ?? signal.price,
    });
    return { txSig: r.txSig, positionKey: onchain.positionKey, fillPrice: r.fillPrice };
  });

  if (!result.ok) {
    updateSignalStatus(signal.id, "failed");
    await tg.failed(result.attempts, `${result.error.cls}: ${result.error.message}`);
    if (result.error.cls === "fatal") {
      await halt(`Open failed (fatal) for signal ${signal.id}: ${result.error.message}`);
    }
    return;
  }
  updateSignalStatus(signal.id, "filled");
  await tg.filled(side, deps.cfg.collateralUsdc * deps.cfg.leverage, signal.ticker, result.value.fillPrice, result.value.txSig);
}

async function runClose(signal: Signal, side: Side, deps: Deps): Promise<void> {
  const { cfg, backend, conn } = deps;
  const open = getOpenPosition();
  if (!open) {
    const msg = "close requested but no open position recorded in ledger";
    console.warn(`[executor] ${msg}`);
    insertTrade({ signalId: signal.id, attempt: 1, status: "failed", errorMessage: msg });
    updateSignalStatus(signal.id, "failed");
    await tg.failed(1, msg);
    return;
  }
  if (open.side !== side) {
    console.warn(`[executor] close side mismatch (ledger=${open.side}, signal=${side}); proceeding with ledger side`);
  }
  const sizeUsd = cfg.collateralUsdc * cfg.leverage;
  await tg.attempting(`close ${open.side}`, sizeUsd, signal.ticker, signal.price);

  const result = await withRetry(async (ctx) => {
    const tradeId = insertTrade({
      signalId: signal.id, attempt: ctx.attempt, status: "pending",
      side: open.side, sizeUsd, entryPrice: signal.price,
    });
    const r = await backend.closePosition({
      positionKey: open.positionKey, side: open.side,
      slippagePct: bpsToPctString(cfg.slippageExitBps),
    });
    updateTrade(tradeId, { status: "sent", txSignature: r.txSig });
    const confirmed = await waitForSignature(conn, r.txSig, { timeoutMs: 30_000 });
    if (!confirmed) throw new Error(`tx ${r.txSig} not confirmed within 30s`);
    const onchain = await expectPositionClosed(backend, open.positionKey);
    if (!onchain.ok) throw new Error(onchain.reason);

    updateTrade(tradeId, { status: "confirmed", confirmedAt: Date.now() });
    closePositionRow({
      positionKey: open.positionKey,
      closedSignalId: signal.id,
      exitPrice: r.fillPrice ?? signal.price,
      realizedPnlUsd: r.realizedPnlUsd ?? 0,
    });
    return r;
  });

  if (!result.ok) {
    updateSignalStatus(signal.id, "failed");
    await tg.failed(result.attempts, `${result.error.cls}: ${result.error.message}`);
    if (result.error.cls === "fatal") {
      await halt(`Close failed (fatal) for signal ${signal.id}: ${result.error.message}`);
    }
    return;
  }
  updateSignalStatus(signal.id, "filled");
  await tg.filled(`close ${open.side}`, deps.cfg.collateralUsdc * deps.cfg.leverage, signal.ticker, result.value.fillPrice, result.value.txSig);
  await checkDailyLossLimit(cfg.maxDailyLossUsdc);
}

async function runFlip(signal: Signal, fromSide: Side, toSide: Side, deps: Deps): Promise<void> {
  const { cfg, backend, conn } = deps;
  const open = getOpenPosition();
  if (!open) {
    // No open in ledger — degrade to a plain open in toSide.
    console.warn(`[executor] flip requested but no open position; treating as open ${toSide}`);
    return runOpen(signal, toSide, deps);
  }
  const sizeUsd = cfg.collateralUsdc * cfg.leverage;
  await tg.attempting(`flip ${fromSide}->${toSide}`, sizeUsd, signal.ticker, signal.price);

  const result = await withRetry(async (ctx) => {
    const tradeId = insertTrade({
      signalId: signal.id, attempt: ctx.attempt, status: "pending",
      side: toSide, sizeUsd, entryPrice: signal.price,
    });
    const r = await backend.flipPosition({
      positionKey: open.positionKey,
      fromSide, toSide,
      slippagePct: bpsToPctString(cfg.slippageEntryBps),
    });
    updateTrade(tradeId, { status: "sent", txSignature: r.txSig });
    const confirmed = await waitForSignature(conn, r.txSig, { timeoutMs: 30_000 });
    if (!confirmed) throw new Error(`tx ${r.txSig} not confirmed within 30s`);
    const onchain = await expectPositionOpened(backend, cfg.asset, toSide);
    if (!onchain.ok) throw new Error(onchain.reason);

    updateTrade(tradeId, { status: "confirmed", confirmedAt: Date.now() });
    closePositionRow({
      positionKey: open.positionKey,
      closedSignalId: signal.id,
      exitPrice: signal.price,
      realizedPnlUsd: 0, // The reverse endpoint doesn't split PnL; we'd need a separate read.
    });
    insertPosition({
      positionKey: onchain.positionKey,
      openedSignalId: signal.id,
      side: toSide, sizeUsd, collateralUsd: cfg.collateralUsdc,
      entryPrice: signal.price,
    });
    return r;
  });

  if (!result.ok) {
    updateSignalStatus(signal.id, "failed");
    await tg.failed(result.attempts, `${result.error.cls}: ${result.error.message}`);
    if (result.error.cls === "fatal") {
      await halt(`Flip failed (fatal) for signal ${signal.id}: ${result.error.message}`);
    }
    return;
  }
  updateSignalStatus(signal.id, "filled");
  await tg.filled(`flip ${fromSide}->${toSide}`, deps.cfg.collateralUsdc * deps.cfg.leverage, signal.ticker, signal.price, result.value.txSig);
  await checkDailyLossLimit(cfg.maxDailyLossUsdc);
}
