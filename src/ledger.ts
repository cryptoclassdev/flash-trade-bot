import Database from "better-sqlite3";
import path from "path";
import { Signal, SignalStatus, TradeStatus, Side } from "./types";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "ledger.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      received_at INTEGER NOT NULL,
      raw_payload TEXT NOT NULL,
      action TEXT NOT NULL,
      market_position TEXT NOT NULL,
      prev_market_position TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received'
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id TEXT NOT NULL REFERENCES signals(id),
      tx_signature TEXT,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      side TEXT,
      size_usd REAL,
      entry_price REAL,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      confirmed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_trades_signal ON trades(signal_id);

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      opened_signal_id TEXT REFERENCES signals(id),
      closed_signal_id TEXT REFERENCES signals(id),
      side TEXT NOT NULL,
      size_usd REAL,
      collateral_usd REAL,
      entry_price REAL,
      exit_price REAL,
      realized_pnl_usd REAL,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_positions_open ON positions(closed_at) WHERE closed_at IS NULL;

    CREATE TABLE IF NOT EXISTS bot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function hasSignal(id: string): boolean {
  const row = getDb().prepare("SELECT 1 FROM signals WHERE id = ?").get(id);
  return !!row;
}

export function insertSignal(s: Signal): void {
  getDb()
    .prepare(
      `INSERT INTO signals (id, received_at, raw_payload, action, market_position, prev_market_position, status)
       VALUES (?, ?, ?, ?, ?, ?, 'received')`
    )
    .run(s.id, s.receivedAt, s.rawPayload, s.action, s.marketPosition, s.prevMarketPosition);
}

export function updateSignalStatus(id: string, status: SignalStatus): void {
  getDb().prepare("UPDATE signals SET status = ? WHERE id = ?").run(status, id);
}

export function insertTrade(args: {
  signalId: string;
  attempt: number;
  status: TradeStatus;
  side?: Side;
  sizeUsd?: number;
  entryPrice?: number;
  txSignature?: string;
  errorMessage?: string;
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO trades (signal_id, tx_signature, attempt_number, status, side, size_usd, entry_price, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.signalId,
      args.txSignature ?? null,
      args.attempt,
      args.status,
      args.side ?? null,
      args.sizeUsd ?? null,
      args.entryPrice ?? null,
      args.errorMessage ?? null,
      Date.now()
    );
  return Number(info.lastInsertRowid);
}

export function updateTrade(
  tradeId: number,
  patch: { status?: TradeStatus; txSignature?: string; entryPrice?: number; errorMessage?: string; confirmedAt?: number }
): void {
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.status !== undefined) { sets.push("status = ?"); vals.push(patch.status); }
  if (patch.txSignature !== undefined) { sets.push("tx_signature = ?"); vals.push(patch.txSignature); }
  if (patch.entryPrice !== undefined) { sets.push("entry_price = ?"); vals.push(patch.entryPrice); }
  if (patch.errorMessage !== undefined) { sets.push("error_message = ?"); vals.push(patch.errorMessage); }
  if (patch.confirmedAt !== undefined) { sets.push("confirmed_at = ?"); vals.push(patch.confirmedAt); }
  if (sets.length === 0) return;
  vals.push(tradeId);
  getDb().prepare(`UPDATE trades SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

export function insertPosition(args: {
  positionKey: string;
  openedSignalId: string;
  side: Side;
  sizeUsd?: number;
  collateralUsd?: number;
  entryPrice?: number;
}): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO positions (id, opened_signal_id, side, size_usd, collateral_usd, entry_price, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.positionKey,
      args.openedSignalId,
      args.side,
      args.sizeUsd ?? null,
      args.collateralUsd ?? null,
      args.entryPrice ?? null,
      Date.now()
    );
}

export function closePositionRow(args: {
  positionKey: string;
  closedSignalId: string;
  exitPrice?: number;
  realizedPnlUsd?: number;
}): void {
  getDb()
    .prepare(
      `UPDATE positions SET closed_signal_id = ?, exit_price = ?, realized_pnl_usd = ?, closed_at = ?
       WHERE id = ?`
    )
    .run(
      args.closedSignalId,
      args.exitPrice ?? null,
      args.realizedPnlUsd ?? null,
      Date.now(),
      args.positionKey
    );
}

export function getOpenPosition(): { positionKey: string; side: Side } | null {
  const row = getDb()
    .prepare(`SELECT id as positionKey, side FROM positions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`)
    .get() as { positionKey: string; side: Side } | undefined;
  return row ?? null;
}

export function lastSignalReceivedAt(): number | null {
  const row = getDb()
    .prepare(`SELECT received_at FROM signals ORDER BY received_at DESC LIMIT 1`)
    .get() as { received_at: number } | undefined;
  return row?.received_at ?? null;
}

export function openPositions(): Array<{ positionKey: string; side: Side; sizeUsd: number | null; entryPrice: number | null; openedAt: number }> {
  const rows = getDb()
    .prepare(
      `SELECT id as positionKey, side, size_usd as sizeUsd, entry_price as entryPrice, opened_at as openedAt
       FROM positions WHERE closed_at IS NULL ORDER BY opened_at DESC`
    )
    .all() as Array<{ positionKey: string; side: Side; sizeUsd: number | null; entryPrice: number | null; openedAt: number }>;
  return rows;
}

export function realizedPnlSinceUtcMidnight(): number {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(realized_pnl_usd), 0) as total
       FROM positions WHERE closed_at IS NOT NULL AND closed_at >= ?`
    )
    .get(utcMidnight) as { total: number };
  return row.total ?? 0;
}

export function setState(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO bot_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, Date.now());
}

export function getState(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM bot_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}
