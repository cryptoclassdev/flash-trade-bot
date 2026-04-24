import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";

dotenv.config();

type Action = "buy" | "sell";
type Pos = "long" | "short" | "flat";

function arg(name: string, def?: string): string {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (def !== undefined) return def;
  throw new Error(`missing --${name}`);
}

async function main(): Promise<void> {
  const action = arg("action", "buy") as Action;
  const market = arg("market_position", "long") as Pos;
  const prev = arg("prev_market_position", "flat") as Pos;
  const ticker = arg("ticker", "BTCUSD");
  const price = arg("price", "65000");
  const id = arg("id", `test-${crypto.randomBytes(6).toString("hex")}`);

  const port = process.env.PORT || "3000";
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) throw new Error("WEBHOOK_SECRET not set in .env");

  const payload = {
    secret,
    id,
    action,
    ticker,
    contracts: "0.0006",
    price,
    position_size_after: market === "flat" ? "0" : market === "long" ? "0.0006" : "-0.0006",
    market_position: market,
    prev_market_position: prev,
    order_comment: `test ${action} ${prev}->${market}`,
    time: new Date().toISOString(),
  };

  const url = `http://127.0.0.1:${port}/webhook`;
  console.log(`POST ${url}`);
  console.log("payload:", { ...payload, secret: "[REDACTED]" });

  try {
    const resp = await axios.post(url, payload, { timeout: 10000 });
    console.log(`HTTP ${resp.status}`, resp.data);
  } catch (e: any) {
    if (e?.response) {
      console.error(`HTTP ${e.response.status}`, e.response.data);
      process.exit(1);
    }
    console.error("request failed:", e?.message || e);
    process.exit(1);
  }
}

main();
