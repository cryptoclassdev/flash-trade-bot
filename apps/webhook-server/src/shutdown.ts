/**
 * In-flight executor tracking + graceful shutdown handler.
 *
 * Railway sends SIGTERM, waits ~30s, then SIGKILL. We use 25s for safety:
 *   1. stop accepting new webhooks
 *   2. wait for in-flight executor promises to settle (bounded)
 *   3. close the SQLite handle (flush WAL)
 *   4. exit 0
 *
 * If the executor is still running at the deadline, we exit anyway —
 * the open trade's tx signature is already in the ledger and can be
 * reconciled on next boot.
 */

const SHUTDOWN_DEADLINE_MS = 25_000;

const inFlight = new Set<Promise<unknown>>();

export function track<T>(p: Promise<T>): Promise<T> {
  inFlight.add(p);
  p.finally(() => inFlight.delete(p));
  return p;
}

export async function drain(deadlineMs: number = SHUTDOWN_DEADLINE_MS): Promise<void> {
  if (inFlight.size === 0) return;
  console.log(`[shutdown] waiting for ${inFlight.size} in-flight executor call(s), deadline ${deadlineMs}ms`);
  const deadline = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), deadlineMs));
  const all = Promise.allSettled([...inFlight]).then(() => "drained" as const);
  const result = await Promise.race([all, deadline]);
  if (result === "timeout") {
    console.warn(`[shutdown] deadline hit with ${inFlight.size} call(s) still running; exiting anyway`);
  } else {
    console.log(`[shutdown] drained cleanly`);
  }
}
