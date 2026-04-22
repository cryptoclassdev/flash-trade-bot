import { getDb } from "../src/ledger";

function fmt(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toISOString().replace("T", " ").replace(/\.\d+Z/, "Z");
}

function main(): void {
  const db = getDb();

  console.log("=== Recent signals (last 20) ===");
  const signals = db
    .prepare(
      `SELECT id, action, prev_market_position, market_position, status, received_at
       FROM signals ORDER BY received_at DESC LIMIT 20`
    )
    .all() as any[];
  for (const s of signals) {
    console.log(
      `${fmt(s.received_at)}  ${s.id.padEnd(24)}  ${s.action.padEnd(4)}  ${s.prev_market_position}->${s.market_position}  [${s.status}]`
    );
  }

  console.log("\n=== Recent trades (last 20) ===");
  const trades = db
    .prepare(
      `SELECT id, signal_id, attempt_number, status, side, size_usd, entry_price, tx_signature, error_message, created_at
       FROM trades ORDER BY created_at DESC LIMIT 20`
    )
    .all() as any[];
  for (const t of trades) {
    const sig = t.tx_signature ? `${t.tx_signature.slice(0, 8)}…` : "-";
    console.log(
      `${fmt(t.created_at)}  #${String(t.id).padEnd(4)}  attempt=${t.attempt_number}  ${(t.side || "-").padEnd(5)}  $${t.size_usd ?? "-"}  @${t.entry_price ?? "-"}  ${t.status.padEnd(9)}  tx=${sig}` +
      (t.error_message ? `  err=${t.error_message}` : "")
    );
  }

  console.log("\n=== Closed positions (last 20) ===");
  const positions = db
    .prepare(
      `SELECT id, side, size_usd, entry_price, exit_price, realized_pnl_usd, opened_at, closed_at
       FROM positions WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 20`
    )
    .all() as any[];
  let total = 0;
  for (const p of positions) {
    const pnl = p.realized_pnl_usd ?? 0;
    total += pnl;
    console.log(
      `${fmt(p.closed_at)}  ${p.side.padEnd(5)}  $${p.size_usd}  entry=${p.entry_price}  exit=${p.exit_price}  pnl=${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`
    );
  }
  console.log(`\nTotal realized PnL (last 20 closed): ${total >= 0 ? "+" : ""}${total.toFixed(2)}`);

  console.log("\n=== Open positions ===");
  const open = db
    .prepare(
      `SELECT id, side, size_usd, entry_price, opened_at FROM positions WHERE closed_at IS NULL`
    )
    .all() as any[];
  if (open.length === 0) console.log("(none)");
  for (const p of open) {
    console.log(`${fmt(p.opened_at)}  ${p.side.padEnd(5)}  $${p.size_usd}  entry=${p.entry_price}  positionKey=${p.id}`);
  }
}

main();
