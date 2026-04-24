"use client";

import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export interface GeneratedWallet {
  pubkey: string;
  privateKeyBase58: string;
}

/**
 * Generate a fresh Solana keypair in the browser via Web Crypto.
 * The private key stays client-side and is never sent anywhere.
 */
export function generateWallet(): GeneratedWallet {
  const kp = Keypair.generate();
  return {
    pubkey: kp.publicKey.toBase58(),
    privateKeyBase58: bs58.encode(kp.secretKey),
  };
}

/**
 * Parse a base58 private key and derive its pubkey. Used by the
 * advanced "paste existing key" path on Screen 1.
 */
export function parsePrivateKey(input: string): GeneratedWallet {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Private key is empty");
  let secretKey: Uint8Array;
  try {
    secretKey = bs58.decode(trimmed);
  } catch {
    throw new Error(
      "Not valid base58. Expected a string of 87-88 base58 characters.",
    );
  }
  if (secretKey.length !== 64) {
    throw new Error(
      `Expected 64-byte secret key, got ${secretKey.length} bytes. Check that you copied the full key.`,
    );
  }
  const kp = Keypair.fromSecretKey(secretKey);
  return {
    pubkey: kp.publicKey.toBase58(),
    privateKeyBase58: trimmed,
  };
}

export function isValidPubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the contents of the downloadable wallet-backup.txt file.
 * Plaintext on purpose — user is explicitly backing up their key.
 */
export function buildBackupFile(wallet: GeneratedWallet): string {
  return [
    "# flash-trade-bot wallet backup",
    `# Generated: ${new Date().toISOString()}`,
    "#",
    "# KEEP THIS FILE OFFLINE. Anyone with the private key can drain your funds.",
    "# The dashboard never sees this key — it is generated client-side.",
    "",
    `PUBKEY=${wallet.pubkey}`,
    `PRIVATE_KEY=${wallet.privateKeyBase58}`,
    "",
  ].join("\n");
}
