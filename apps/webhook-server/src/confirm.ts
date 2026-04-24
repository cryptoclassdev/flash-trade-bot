import { Connection, TransactionConfirmationStatus } from "@solana/web3.js";
import { FlashBackend, Side } from "./types";

const TERMINAL: TransactionConfirmationStatus[] = ["confirmed", "finalized"];

export interface ConfirmOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface OnChainCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Wait for a tx signature to reach the "confirmed" commitment.
 * Returns true on success, false on timeout. Throws on a chain-reported failure.
 */
export async function waitForSignature(
  conn: Connection,
  signature: string,
  opts: ConfirmOptions = {}
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const interval = opts.pollIntervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { value } = await conn.getSignatureStatus(signature, { searchTransactionHistory: true });
    if (value) {
      if (value.err) {
        throw new Error(`tx failed on-chain: ${JSON.stringify(value.err)}`);
      }
      if (value.confirmationStatus && TERMINAL.includes(value.confirmationStatus)) {
        return true;
      }
    }
    await sleep(interval);
  }
  return false;
}

/**
 * After an open: poll the indexer/SDK until the expected position appears.
 * Tolerates the indexer being a few seconds behind chain finality.
 */
export async function expectPositionOpened(
  backend: FlashBackend,
  asset: string,
  side: Side,
  opts: ConfirmOptions = {}
): Promise<{ ok: true; positionKey: string } | { ok: false; reason: string }> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const interval = opts.pollIntervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const positions = await backend.getUserPositions();
      const match = positions.find(
        (p) => p.side === side && p.marketSymbol.toUpperCase().includes(asset.toUpperCase())
      );
      if (match) return { ok: true, positionKey: match.positionKey };
    } catch (e: any) {
      // tolerate transient errors during polling
    }
    await sleep(interval);
  }
  return { ok: false, reason: `position ${side} ${asset} did not appear within ${timeoutMs}ms` };
}

/**
 * After a close: poll until the position is gone.
 */
export async function expectPositionClosed(
  backend: FlashBackend,
  positionKey: string,
  opts: ConfirmOptions = {}
): Promise<OnChainCheck> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const interval = opts.pollIntervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const positions = await backend.getUserPositions();
      if (!positions.some((p) => p.positionKey === positionKey)) {
        return { ok: true };
      }
    } catch {
      // ignore transient
    }
    await sleep(interval);
  }
  return { ok: false, reason: `position ${positionKey} still present after ${timeoutMs}ms` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
