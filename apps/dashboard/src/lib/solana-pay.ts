"use client";

import { PublicKey } from "@solana/web3.js";
import { encodeURL } from "@solana/pay";
import BigNumber from "bignumber.js";
import { USDC_MINT } from "./rpc";

/**
 * Build a Solana Pay URL that, when opened in Phantom/Solflare/Backpack,
 * pre-fills a USDC transfer of `amount` to `recipient`.
 *
 * @param recipient  base58 pubkey string
 * @param amount     USDC amount (e.g. 50 for $50)
 * @param label      displayed in the wallet's confirmation UI
 */
export function buildSolanaPayUrl(
  recipient: string,
  amount: number,
  label = "flash-trade-bot funding",
): string {
  const url = encodeURL({
    recipient: new PublicKey(recipient),
    amount: new BigNumber(amount),
    splToken: USDC_MINT,
    label,
    message: "Fund your trading bot wallet",
  });
  return url.toString();
}
