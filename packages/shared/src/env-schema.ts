/**
 * Canonical schema for the bot's env vars. Used by apps/dashboard to
 * build the Railway deploy URL with pre-filled values, and by future
 * validation code.
 *
 * Keep in lockstep with apps/webhook-server/src/config.ts and
 * apps/webhook-server/.env.example.
 */

export interface BotEnv {
  // Hard requirements (mainnet)
  NETWORK: "mainnet-beta" | "devnet";
  I_UNDERSTAND_REAL_MONEY: "yes" | "no";
  RPC_URL_MAINNET: string;
  PRIVATE_KEY: string;
  WEBHOOK_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;

  // Optional / defaulted
  RPC_URL_MAINNET_FALLBACK?: string;
  DRY_RUN_ONLY?: "true" | "false";
  ASSET?: string;
  COLLATERAL_USDC?: string;
  LEVERAGE?: string;
  SLIPPAGE_ENTRY_BPS?: string;
  SLIPPAGE_EXIT_BPS?: string;
  MAX_DAILY_LOSS_USDC?: string;
  RESUME?: "true" | "false";
  DASHBOARD_TOKEN?: string;
  DASHBOARD_ORIGIN?: string;
}

export const ENV_DEFAULTS: Partial<BotEnv> = {
  NETWORK: "mainnet-beta",
  I_UNDERSTAND_REAL_MONEY: "yes",
  ASSET: "BTC",
  COLLATERAL_USDC: "20",
  LEVERAGE: "2",
  SLIPPAGE_ENTRY_BPS: "100",
  SLIPPAGE_EXIT_BPS: "150",
  MAX_DAILY_LOSS_USDC: "15",
};

/**
 * Subset of env vars the Screen 5 strategy form writes to.
 * Sliders/dropdowns surface these; defaults flow from ENV_DEFAULTS.
 */
export interface StrategyConfig {
  ASSET: string;
  COLLATERAL_USDC: number;
  LEVERAGE: number;
  MAX_DAILY_LOSS_USDC: number;
  SLIPPAGE_ENTRY_BPS: number;
  SLIPPAGE_EXIT_BPS: number;
}

export const STRATEGY_DEFAULTS: StrategyConfig = {
  ASSET: "BTC",
  COLLATERAL_USDC: 20,
  LEVERAGE: 2,
  MAX_DAILY_LOSS_USDC: 15,
  SLIPPAGE_ENTRY_BPS: 100,
  SLIPPAGE_EXIT_BPS: 150,
};
