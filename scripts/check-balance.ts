import dotenv from "dotenv";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

dotenv.config();

const USDC_MINTS: Record<string, string> = {
  "devnet": "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

async function main(): Promise<void> {
  const network = (process.env.NETWORK || "devnet") as "devnet" | "mainnet-beta";
  const rpc = network === "devnet" ? process.env.RPC_URL_DEVNET : process.env.RPC_URL_MAINNET;
  if (!rpc) throw new Error(`RPC_URL_${network === "devnet" ? "DEVNET" : "MAINNET"} not set`);
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");

  const kp = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
  const conn = new Connection(rpc, "confirmed");

  const sol = await conn.getBalance(kp.publicKey);
  console.log(`network: ${network}`);
  console.log(`wallet:  ${kp.publicKey.toBase58()}`);
  console.log(`SOL:     ${(sol / LAMPORTS_PER_SOL).toFixed(6)}`);

  const usdcMint = new PublicKey(USDC_MINTS[network]);
  try {
    const ata = await getAssociatedTokenAddress(usdcMint, kp.publicKey);
    const acc = await getAccount(conn, ata);
    console.log(`USDC:    ${(Number(acc.amount) / 1e6).toFixed(6)}  (ata: ${ata.toBase58()})`);
  } catch {
    console.log(`USDC:    0  (no token account)`);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
