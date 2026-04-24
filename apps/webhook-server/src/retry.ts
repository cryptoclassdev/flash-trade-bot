export type ErrorClass = "blockhash" | "slippage" | "dropped" | "fatal";

export interface ClassifiedError {
  cls: ErrorClass;
  message: string;
}

const PATTERNS: Array<{ cls: ErrorClass; pat: RegExp }> = [
  { cls: "blockhash", pat: /BlockhashNotFound|blockhash.*expired|blockhash not found/i },
  { cls: "slippage", pat: /slippage|MaxSlippage|price.*moved|priceAfterSlippage|exceeded.*slippage/i },
  { cls: "dropped", pat: /dropped|TransactionExpired|node.*behind|insufficient.*priority|skipped|rate.?limit|429|503|timeout/i },
];

export function classify(err: unknown): ClassifiedError {
  const msg = (err as any)?.message || (typeof err === "string" ? err : JSON.stringify(err));
  for (const { cls, pat } of PATTERNS) {
    if (pat.test(msg)) return { cls, message: msg };
  }
  return { cls: "fatal", message: msg };
}

export interface AttemptContext {
  attempt: number; // 1-indexed
  priorityMicroLamports: number;
}

export interface RetryConfig {
  maxAttempts?: number;
  basePriorityMicroLamports?: number;
  maxSlippageRetries?: number;
}

/**
 * Wraps a single trade attempt with the retry rules:
 *   - blockhash expired   -> retry, refresh handled by the action itself
 *   - slippage exceeded   -> retry up to maxSlippageRetries (separate counter)
 *   - dropped/throttled   -> retry with priority fee bumped 2x
 *   - fatal               -> halt immediately
 *
 * The action receives the current attempt context so it can rebuild the tx
 * (refetch quote / blockhash / bump fee).
 */
export async function withRetry<T>(
  action: (ctx: AttemptContext) => Promise<T>,
  cfg: RetryConfig = {}
): Promise<{ ok: true; value: T; attempts: number } | { ok: false; error: ClassifiedError; attempts: number }> {
  const maxAttempts = cfg.maxAttempts ?? 3;
  const basePriority = cfg.basePriorityMicroLamports ?? 50_000;
  const maxSlippage = cfg.maxSlippageRetries ?? 2;

  let attempt = 0;
  let priority = basePriority;
  let slippageTries = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const value = await action({ attempt, priorityMicroLamports: priority });
      return { ok: true, value, attempts: attempt };
    } catch (e) {
      const cls = classify(e);
      console.warn(`[retry] attempt ${attempt}/${maxAttempts} failed (${cls.cls}): ${cls.message}`);
      if ((e as any)?.stack) console.warn(`[retry] stack: ${(e as any).stack.split("\n").slice(0, 12).join("\n")}`);

      if (cls.cls === "fatal") {
        return { ok: false, error: cls, attempts: attempt };
      }
      if (cls.cls === "slippage") {
        slippageTries += 1;
        if (slippageTries > maxSlippage) {
          return { ok: false, error: { cls: "slippage", message: "max slippage retries exceeded" }, attempts: attempt };
        }
      }
      if (cls.cls === "dropped") {
        priority = priority * 2;
        console.warn(`[retry] bumping priority fee to ${priority} microLamports`);
      }
      // blockhash: just loop; the action refetches on next call.

      if (attempt >= maxAttempts) {
        return { ok: false, error: cls, attempts: attempt };
      }
      await sleep(Math.min(2_000, 250 * 2 ** (attempt - 1)));
    }
  }
  return { ok: false, error: { cls: "fatal", message: "unreachable" }, attempts: attempt };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
