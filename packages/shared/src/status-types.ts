/**
 * Shape of the /status response from apps/webhook-server.
 * Consumed by apps/dashboard for the Screen 8 status UI.
 *
 * Keep this file in lockstep with the serializer in
 * apps/webhook-server/src/server.ts.
 */

export type HaltState =
  | { halted: false }
  | { halted: true; reason: string; since: number };

export interface OpenPosition {
  positionKey: string;
  side: "long" | "short";
  asset: string;
  sizeUsd: number;
  collateralUsd: number;
  entryPrice: number;
  leverage: number;
  openedAt: number;
  unrealizedPnlUsd: number | null;
}

export interface StatusResponse {
  network: "mainnet-beta" | "devnet";
  walletPubkey: string;
  walletSolBalance: number;
  walletUsdcBalance: number;
  halt: HaltState;
  openPositions: OpenPosition[];
  lastSignalReceivedAt: number | null;
  realizedPnlTodayUsd: number;
  tradesTodayCount: number;
  tradingParams: {
    asset: string;
    collateralUsdc: number;
    leverage: number;
    slippageEntryBps: number;
    slippageExitBps: number;
    maxDailyLossUsdc: number;
  };
  serverTime: number;
}
