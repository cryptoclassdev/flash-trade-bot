import dotenv from "dotenv";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

dotenv.config();

export type Network = "devnet" | "mainnet-beta";

export interface AppConfig {
  network: Network;
  rpcUrl: string;
  pythnetUrl: string;
  flashApiBaseUrl: string;
  /** null when dryRunOnly=true — the private key is not loaded in that mode. */
  walletKeypair: Keypair | null;
  walletPubkey: string;
  webhookSecret: string;
  port: number;
  telegramBotToken: string;
  telegramChatId: string;
  asset: string;
  collateralUsdc: number;
  leverage: number;
  slippageEntryBps: number;
  slippageExitBps: number;
  maxDailyLossUsdc: number;
  resumeOnBoot: boolean;
  /**
   * Dry-run: make API calls only, do not sign or submit any transactions.
   * When true, PRIVATE_KEY is NOT loaded. DRY_RUN_WALLET_PUBKEY supplies the owner field for API calls.
   */
  dryRunOnly: boolean;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function num(name: string, parsed: number, min?: number, max?: number): number {
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number`);
  if (min !== undefined && parsed < min) throw new Error(`${name} must be >= ${min}`);
  if (max !== undefined && parsed > max) throw new Error(`${name} must be <= ${max}`);
  return parsed;
}

export function loadConfig(): AppConfig {
  const network = required("NETWORK") as Network;
  if (network !== "devnet" && network !== "mainnet-beta") {
    throw new Error(`NETWORK must be 'devnet' or 'mainnet-beta', got: ${network}`);
  }

  const dryRunOnly = (process.env.DRY_RUN_ONLY || "").toLowerCase() === "true";

  // Real-money guard only applies when NOT dry-running. Dry-run cannot submit txs.
  if (network === "mainnet-beta" && !dryRunOnly) {
    const ack = process.env.I_UNDERSTAND_REAL_MONEY;
    if (ack !== "yes") {
      throw new Error(
        "Refusing to start on mainnet-beta without I_UNDERSTAND_REAL_MONEY=yes. " +
        "Set it explicitly in .env to acknowledge real-money trading."
      );
    }
  }

  // Dry-run skips all sign+send paths, so RPC URL and PRIVATE_KEY are not needed.
  let rpcUrl = "";
  let walletKeypair: Keypair | null = null;
  let walletPubkey: string;

  if (dryRunOnly) {
    const pk = required("DRY_RUN_WALLET_PUBKEY");
    try {
      walletPubkey = new PublicKey(pk).toBase58();
    } catch {
      throw new Error("DRY_RUN_WALLET_PUBKEY is not a valid base58 pubkey");
    }
    // walletKeypair stays null — the private key is intentionally not loaded.
  } else {
    rpcUrl = network === "devnet" ? required("RPC_URL_DEVNET") : required("RPC_URL_MAINNET");
    const privateKeyB58 = required("PRIVATE_KEY");
    try {
      walletKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyB58));
    } catch {
      throw new Error("PRIVATE_KEY is not a valid base58 secret key");
    }
    walletPubkey = walletKeypair.publicKey.toBase58();
  }

  return {
    network,
    rpcUrl,
    pythnetUrl: process.env.PYTHNET_URL || "https://pythnet.rpcpool.com",
    flashApiBaseUrl: process.env.FLASH_API_BASE_URL || "https://flashapi.trade",
    walletKeypair,
    walletPubkey,
    webhookSecret: dryRunOnly ? (process.env.WEBHOOK_SECRET || "dryrun-noop") : required("WEBHOOK_SECRET"),
    port: num("PORT", parseInt(process.env.PORT || "3000", 10), 1, 65535),
    telegramBotToken: dryRunOnly ? (process.env.TELEGRAM_BOT_TOKEN || "") : required("TELEGRAM_BOT_TOKEN"),
    telegramChatId: dryRunOnly ? (process.env.TELEGRAM_CHAT_ID || "") : required("TELEGRAM_CHAT_ID"),
    asset: process.env.ASSET || "BTC",
    collateralUsdc: num("COLLATERAL_USDC", parseFloat(process.env.COLLATERAL_USDC || "20"), 0.01, 100000),
    leverage: num("LEVERAGE", parseFloat(process.env.LEVERAGE || "2"), 1, 100),
    slippageEntryBps: num("SLIPPAGE_ENTRY_BPS", parseInt(process.env.SLIPPAGE_ENTRY_BPS || "100", 10), 1, 5000),
    slippageExitBps: num("SLIPPAGE_EXIT_BPS", parseInt(process.env.SLIPPAGE_EXIT_BPS || "150", 10), 1, 5000),
    maxDailyLossUsdc: num("MAX_DAILY_LOSS_USDC", parseFloat(process.env.MAX_DAILY_LOSS_USDC || "15"), 0, 1e9),
    resumeOnBoot: (process.env.RESUME || "").toLowerCase() === "true",
    dryRunOnly,
  };
}

export function bpsToPctString(bps: number): string {
  return (bps / 100).toString();
}
