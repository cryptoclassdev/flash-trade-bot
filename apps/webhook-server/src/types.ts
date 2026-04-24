export type Action = "buy" | "sell";
export type MarketPosition = "long" | "short" | "flat";
export type Side = "long" | "short";
export type SignalStatus = "received" | "processing" | "filled" | "failed";
export type TradeStatus = "pending" | "sent" | "confirmed" | "failed";

export interface RawWebhookPayload {
  secret: string;
  id: string;
  action: Action;
  ticker: string;
  contracts: string;
  price: string;
  position_size_after: string;
  market_position: MarketPosition;
  prev_market_position: MarketPosition;
  order_comment: string;
  time: string;
}

export interface Signal {
  id: string;
  receivedAt: number;
  rawPayload: string;
  action: Action;
  ticker: string;
  price: number;
  marketPosition: MarketPosition;
  prevMarketPosition: MarketPosition;
  orderComment: string;
  time: string;
}

export type Intent =
  | { kind: "open"; side: Side }
  | { kind: "close"; side: Side }
  | { kind: "flip"; from: Side; to: Side }
  | { kind: "noop"; reason: string };

export interface OpenResult {
  txSig: string;
  positionKey?: string;  // may be undefined when backend cannot discover it pre-confirmation
  fillPrice?: number;
  raw?: any;  // set only in dry-run mode — full API response for inspection
}

export interface CloseResult {
  txSig: string;
  realizedPnlUsd?: number;
  fillPrice?: number;
  raw?: any;
}

export interface FlipResult {
  txSig: string;
  newPositionKey?: string;
  raw?: any;
}

export interface PositionView {
  positionKey: string;
  side: Side;
  sizeUsd: number;
  collateralUsd: number;
  entryPrice: number;
  marketSymbol: string;
}

export interface FlashBackend {
  openPosition(args: {
    side: Side;
    collateralUsdc: number;
    leverage: number;
    slippagePct: string;
  }): Promise<OpenResult>;

  closePosition(args: {
    positionKey: string;
    side: Side;
    slippagePct: string;
  }): Promise<CloseResult>;

  flipPosition(args: {
    positionKey: string;
    fromSide: Side;
    toSide: Side;
    slippagePct: string;
  }): Promise<FlipResult>;

  getUserPositions(): Promise<PositionView[]>;
}
