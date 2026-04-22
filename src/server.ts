import express, { Request, Response } from "express";
import { Connection } from "@solana/web3.js";
import { loadConfig, AppConfig } from "./config";
import { validatePayload } from "./verify";
import {
  hasSignal,
  insertSignal,
  lastSignalReceivedAt,
  openPositions,
  realizedPnlSinceUtcMidnight,
} from "./ledger";
import { initTelegram, tg } from "./telegram";
import { execute } from "./executor";
import { pickBackend } from "./flash";
import { isHalted, haltReason, clearHalt } from "./halt";

/**
 * Preflight checks at boot. Returns a list of warnings; throws on fatal misconfig.
 * On Railway, warn loudly if the ledger DB is not on a mounted volume — without
 * the volume, positions + halt state are wiped on every redeploy.
 */
function preflight(cfg: AppConfig): string[] {
  const warnings: string[] = [];
  const railwayVolume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const dbPath = process.env.DB_PATH || "";

  if (railwayVolume) {
    if (!dbPath) {
      warnings.push(
        `[preflight] Running on Railway but DB_PATH is unset. Set DB_PATH=${railwayVolume}/ledger.db ` +
        `and attach a volume or positions will be wiped on every redeploy.`
      );
    } else if (!dbPath.startsWith(railwayVolume)) {
      warnings.push(
        `[preflight] Running on Railway but DB_PATH (${dbPath}) is not under the volume mount (${railwayVolume}). ` +
        `Positions will be wiped on every redeploy.`
      );
    }
  }

  if (cfg.network === "mainnet-beta" && !cfg.dryRunOnly) {
    if (cfg.collateralUsdc * cfg.leverage > 1000) {
      warnings.push(
        `[preflight] Notional size (collateral * leverage = $${cfg.collateralUsdc * cfg.leverage}) is above $1000. ` +
        `Double-check COLLATERAL_USDC and LEVERAGE before going live.`
      );
    }
  }

  return warnings;
}

async function main(): Promise<void> {
  const cfg = loadConfig();

  if (cfg.dryRunOnly) {
    console.error(
      "[fatal] DRY_RUN_ONLY=true — the server refuses to start in this mode.\n" +
      "        Run scripts/dry-run.ts for API validation. Webhook processing requires a live wallet."
    );
    process.exit(1);
  }

  if (cfg.network === "devnet") {
    console.warn(
      "\n" +
      "=============================================================\n" +
      "  ⚠  WARNING: flash.trade's devnet program is DECOMMISSIONED. ⚠\n" +
      "  Trades will fail on-chain with UnsupportedProgramId.\n" +
      "  Use NETWORK=mainnet-beta for production, or DRY_RUN_ONLY=true\n" +
      "  with scripts/dry-run.ts for API shape validation.\n" +
      "=============================================================\n"
    );
  }

  initTelegram(cfg);

  for (const w of preflight(cfg)) console.warn(w);

  if (cfg.resumeOnBoot) {
    clearHalt();
    console.log("[boot] RESUME=true — cleared halt state");
  }

  const conn = new Connection(cfg.rpcUrl, "confirmed");
  const backend = pickBackend(cfg);

  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      network: cfg.network,
      wallet: cfg.walletPubkey,
      halted: isHalted(),
      halt_reason: haltReason() || undefined,
    });
  });

  app.get("/status", (_req: Request, res: Response) => {
    res.json({
      network: cfg.network,
      wallet: cfg.walletPubkey,
      halted: isHalted(),
      halt_reason: haltReason() || undefined,
      open_positions: openPositions(),
      last_signal_received_at: lastSignalReceivedAt(),
      realized_pnl_today_usdc: realizedPnlSinceUtcMidnight(),
      trading_params: {
        asset: cfg.asset,
        collateral_usdc: cfg.collateralUsdc,
        leverage: cfg.leverage,
        slippage_entry_bps: cfg.slippageEntryBps,
        slippage_exit_bps: cfg.slippageExitBps,
        max_daily_loss_usdc: cfg.maxDailyLossUsdc,
      },
    });
  });

  app.post("/webhook", async (req: Request, res: Response) => {
    const result = validatePayload(req.body, cfg.webhookSecret);
    if (!result.ok) {
      console.warn(`[webhook] rejected: ${result.message}`);
      res.status(result.status).json({ error: result.message });
      return;
    }
    const signal = result.signal;

    if (hasSignal(signal.id)) {
      console.log(`[webhook] duplicate id=${signal.id}, ignoring`);
      res.status(200).json({ ok: true, deduped: true });
      return;
    }
    insertSignal(signal);

    res.status(202).json({ ok: true, id: signal.id });

    tg.signalReceived(signal.action, signal.ticker, signal.id).catch(() => {});

    execute(signal, { cfg, backend, conn }).catch(async (e) => {
      console.error(`[executor] uncaught on signal=${signal.id}:`, e);
      await tg.failed(1, e?.message || String(e)).catch(() => {});
    });
  });

  app.use((err: any, _req: Request, res: Response, _next: any) => {
    console.error("[server] unhandled error:", err?.message || err);
    res.status(500).json({ error: "internal_error" });
  });

  // Bind 0.0.0.0 so Railway's edge proxy can reach the process. The only
  // authentication layer is the constant-time webhook secret check in verify.ts.
  // Locally, the port is only reachable from your machine.
  app.listen(cfg.port, "0.0.0.0", () => {
    console.log(
      `[boot] flash-trade-bot listening on 0.0.0.0:${cfg.port}  network=${cfg.network}  wallet=${cfg.walletPubkey}` +
      (isHalted() ? `  HALTED: ${haltReason()}` : "")
    );
    const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
    if (publicDomain) {
      console.log(`[boot] public webhook URL: https://${publicDomain}/webhook`);
      console.log(`[boot] health check:       https://${publicDomain}/health`);
      console.log(`[boot] status page:        https://${publicDomain}/status`);
    }
  });
}

main().catch((e) => {
  console.error("[fatal]", e?.message || e);
  process.exit(1);
});
