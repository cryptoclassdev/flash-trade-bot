import { getState, setState, realizedPnlSinceUtcMidnight } from "./ledger";
import { tg } from "./telegram";

const KEY_HALTED = "halted";
const KEY_REASON = "halt_reason";

export function isHalted(): boolean {
  return getState(KEY_HALTED) === "true";
}

export function haltReason(): string {
  return getState(KEY_REASON) || "";
}

export async function halt(reason: string): Promise<void> {
  setState(KEY_HALTED, "true");
  setState(KEY_REASON, reason);
  console.error(`[halt] ${reason}`);
  await tg.halt(reason).catch(() => {});
}

export function clearHalt(): void {
  setState(KEY_HALTED, "false");
  setState(KEY_REASON, "");
}

/**
 * After each closed position we reconcile the daily loss limit.
 * Called from the executor right after writing realized PnL into the ledger.
 *
 * Returns true if the halt was triggered.
 */
export async function checkDailyLossLimit(maxDailyLossUsdc: number): Promise<boolean> {
  if (isHalted()) return true;
  const pnl = realizedPnlSinceUtcMidnight();
  if (pnl <= -Math.abs(maxDailyLossUsdc)) {
    await halt(
      `Daily loss limit hit: ${pnl.toFixed(2)} USD <= -${maxDailyLossUsdc}. ` +
      `Restart with RESUME=true to resume.`
    );
    return true;
  }
  return false;
}
