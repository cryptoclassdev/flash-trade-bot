/**
 * Generates a user-specific tradingview-strategy.pine file with their
 * WEBHOOK_SECRET pre-filled as the default value of the Pine input.string().
 *
 * Consumed by apps/dashboard on Screen 7 to serve a downloadable
 * Pine file. The generated file passes the same invariants as
 * apps/webhook-server/tests/pine-schema.test.ts.
 *
 * Stub for Phase 5 — full implementation lands with the TradingView
 * screen work.
 */

export interface PineGenInput {
  webhookSecret: string;
  pineSource: string;
}

export function generatePineFile({
  webhookSecret,
  pineSource,
}: PineGenInput): string {
  if (!/^[0-9a-f]{32,128}$/i.test(webhookSecret)) {
    throw new Error(
      "webhookSecret must be a hex string between 32 and 128 characters",
    );
  }
  // Pine input.string(defval, title, ...) — replace the defval literal
  // on the WEBHOOK_SECRET input only. The Pine reference file at the
  // repo root uses `input.string("", "Webhook Secret", ...)` by
  // default; we swap the empty string for the user's secret.
  //
  // This regex matches only the WEBHOOK_SECRET line to avoid clobbering
  // any other input.string() in the strategy.
  const replaced = pineSource.replace(
    /(WEBHOOK_SECRET\s*=\s*input\.string\(\s*)"[^"]*"(\s*,\s*"[^"]*Secret)/i,
    `$1"${webhookSecret}"$2`,
  );
  if (replaced === pineSource) {
    throw new Error(
      "Could not find the WEBHOOK_SECRET input.string() line in the Pine source",
    );
  }
  return replaced;
}
