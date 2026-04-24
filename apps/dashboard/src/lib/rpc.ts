"use client";

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

export const PUBLIC_MAINNET_RPC = "https://api.mainnet-beta.solana.com";

export interface WalletBalance {
  sol: number;
  usdc: number;
}

/**
 * Poll a wallet's SOL + USDC balance against the given RPC (or public default).
 */
export async function getWalletBalance(
  pubkey: string,
  rpcUrl: string = PUBLIC_MAINNET_RPC,
): Promise<WalletBalance> {
  const conn = new Connection(rpcUrl, "confirmed");
  const owner = new PublicKey(pubkey);

  const [solLamports, tokenResp] = await Promise.all([
    conn.getBalance(owner),
    conn.getParsedTokenAccountsByOwner(owner, { mint: USDC_MINT }),
  ]);

  const usdc = tokenResp.value.reduce((total, acc) => {
    const info = acc.account.data.parsed?.info?.tokenAmount;
    const ui = typeof info?.uiAmount === "number" ? info.uiAmount : 0;
    return total + ui;
  }, 0);

  return {
    sol: solLamports / LAMPORTS_PER_SOL,
    usdc,
  };
}

/**
 * Validate a user-supplied RPC endpoint by calling getSlot.
 * Returns the slot number on success, throws a descriptive error otherwise.
 */
export async function validateRpcEndpoint(rpcUrl: string): Promise<number> {
  if (!/^https?:\/\//.test(rpcUrl)) {
    throw new Error("RPC URL must start with http:// or https://");
  }
  const conn = new Connection(rpcUrl, "confirmed");
  try {
    const slot = await conn.getSlot();
    if (typeof slot !== "number" || slot < 1) {
      throw new Error("RPC returned an unexpected response");
    }
    const genesisHash = await conn.getGenesisHash();
    // Mainnet-beta genesis hash; devnet differs.
    const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    if (genesisHash !== MAINNET_GENESIS) {
      throw new Error(
        "This endpoint is NOT Solana mainnet-beta. The bot trades on mainnet only. Create a mainnet endpoint in Helius.",
      );
    }
    return slot;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("RPC request failed");
  }
}
