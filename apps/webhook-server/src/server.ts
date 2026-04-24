import express, { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { Connection } from "@solana/web3.js";
import axios from "axios";
import { createGzip } from "zlib";
import path from "path";
import { createReadStream, existsSync } from "fs";
import { constantTimeEqual } from "./verify";
import { loadConfig, AppConfig } from "./config";
import { validatePayload } from "./verify";
import {
  hasSignal,
  insertSignal,
  lastSignalReceivedAt,
  openPositions,
  realizedPnlSinceUtcMidnight,
  closeDb,
} from "./ledger";
import { initTelegram, tg } from "./telegram";
import { execute } from "./executor";
import { pickBackend } from "./flash";
import { isHalted, haltReason, halt, clearHalt } from "./halt";
import { track, drain } from "./shutdown";
import type { StatusResponse } from "shared";

/**
 * Emergency Telegram alert before any other init. Used when loadConfig() throws:
 * config.ts is the only place that reads TELEGRAM_BOT_TOKEN, so we read env directly.
 * Silent failure — if Telegram creds aren't set, the user won't be alerted this way,
 * but the crash log is still in Railway.
 */
async function sendBootCrashAlert(err: unknown): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const msg = (err as { message?: string } | null | undefined)?.message || String(err);
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: chat, text: `🛑 flash-trade-bot failed to boot: ${msg}` },
      { timeout: 5000 }
    );
  } catch { /* swallow — can't alert about the alert */ }
}

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
  app.set("trust proxy", 1); // Railway terminates TLS upstream; trust X-Forwarded-For for rate limit keying
  app.use(express.json({ limit: "16kb" }));

  // Rate limit /webhook only. Health + status stay unlimited for Railway's
  // own healthcheck + user monitoring. 60 requests/minute per IP is generous
  // for a single TradingView Pro account (max ~1 alert/bar, rarely under 1m bars).
  const webhookLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "rate_limited", message: "too many webhook requests" },
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      network: cfg.network,
      wallet: cfg.walletPubkey,
      halted: isHalted(),
      halt_reason: haltReason() || undefined,
    });
  });

  // CORS for dashboard-originated requests (/status, /pause, /resume).
  // Default allowlist: the public dashboard + localhost dev. Override with DASHBOARD_ORIGIN.
  const DEFAULT_DASHBOARD_ORIGINS = [
    "https://flashtradebot.xyz",
    "https://www.flashtradebot.xyz",
    "http://localhost:3001",
  ];
  const allowedOrigins = cfg.dashboardOrigin
    ? cfg.dashboardOrigin.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_DASHBOARD_ORIGINS;

  const corsForDashboard = (req: Request, res: Response, next: () => void) => {
    const origin = req.headers.origin || "";
    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };

  // If DASHBOARD_TOKEN is set, require `Authorization: Bearer <token>` on
  // /status, /pause, /resume. Otherwise (v0-style deploys without the dashboard
  // setup), these endpoints stay open for backward compat.
  const requireDashboardAuth = (req: Request, res: Response, next: () => void) => {
    if (!cfg.dashboardToken) {
      next();
      return;
    }
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || !constantTimeEqual(token, cfg.dashboardToken)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };

  app.get("/status", corsForDashboard, requireDashboardAuth, async (_req: Request, res: Response) => {
    // Wallet balance lookup from the configured RPC. Non-fatal if it fails —
    // dashboard can still render the rest.
    let solBalance = 0;
    let usdcBalance = 0;
    try {
      const { PublicKey, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
      const owner = new PublicKey(cfg.walletPubkey);
      const [lamports, tokenResp] = await Promise.all([
        conn.getBalance(owner),
        conn.getParsedTokenAccountsByOwner(owner, {
          mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
        }),
      ]);
      solBalance = lamports / LAMPORTS_PER_SOL;
      usdcBalance = tokenResp.value.reduce((t, a) => {
        const ui = a.account.data.parsed?.info?.tokenAmount?.uiAmount;
        return t + (typeof ui === "number" ? ui : 0);
      }, 0);
    } catch (e) {
      console.warn(`[status] balance lookup failed: ${(e as Error).message}`);
    }

    const halted = isHalted();
    const response: StatusResponse = {
      network: cfg.network,
      walletPubkey: cfg.walletPubkey,
      walletSolBalance: solBalance,
      walletUsdcBalance: usdcBalance,
      halt: halted
        ? { halted: true, reason: haltReason(), since: 0 }
        : { halted: false },
      openPositions: openPositions().map((p: any) => ({
        positionKey: p.id || p.positionKey || "",
        side: (p.side || "long") as "long" | "short",
        asset: p.asset || cfg.asset,
        sizeUsd: Number(p.size_usd ?? p.sizeUsd ?? 0),
        collateralUsd: Number(p.collateral_usd ?? p.collateralUsd ?? 0),
        entryPrice: Number(p.entry_price ?? p.entryPrice ?? 0),
        leverage: Number(p.leverage ?? cfg.leverage),
        openedAt: Number(p.opened_at ?? p.openedAt ?? 0),
        unrealizedPnlUsd: null,
      })),
      lastSignalReceivedAt: lastSignalReceivedAt(),
      realizedPnlTodayUsd: realizedPnlSinceUtcMidnight(),
      tradesTodayCount: 0,
      tradingParams: {
        asset: cfg.asset,
        collateralUsdc: cfg.collateralUsdc,
        leverage: cfg.leverage,
        slippageEntryBps: cfg.slippageEntryBps,
        slippageExitBps: cfg.slippageExitBps,
        maxDailyLossUsdc: cfg.maxDailyLossUsdc,
      },
      serverTime: Date.now(),
    };
    res.json(response);
  });

  // Dashboard-initiated pause. Halts new OPENS only; closes still flow through.
  app.post("/pause", corsForDashboard, requireDashboardAuth, async (_req: Request, res: Response) => {
    if (isHalted()) {
      res.json({ ok: true, already: "halted", reason: haltReason() });
      return;
    }
    await halt("Paused via dashboard");
    res.json({ ok: true });
  });

  app.post("/resume", corsForDashboard, requireDashboardAuth, (_req: Request, res: Response) => {
    clearHalt();
    res.json({ ok: true });
  });

  // Always respond to preflight OPTIONS on the dashboard-touched routes.
  app.options("/status", corsForDashboard);
  app.options("/pause", corsForDashboard);
  app.options("/resume", corsForDashboard);

  // GET /export?secret=<WEBHOOK_SECRET>
  // Streams a gzipped copy of the ledger.db file for off-site backup.
  // Same constant-time secret check as /webhook. Rate-limited by the same
  // bucket IPs don't get free enumeration of the URL.
  app.get("/export", webhookLimiter, (req: Request, res: Response) => {
    const secret = typeof req.query.secret === "string" ? req.query.secret : "";
    if (!secret || !constantTimeEqual(secret, cfg.webhookSecret)) {
      res.status(401).json({ error: "invalid secret" });
      return;
    }
    const dbPath = process.env.DB_PATH || path.join(process.cwd(), "ledger.db");
    if (!existsSync(dbPath)) {
      res.status(404).json({ error: "ledger not found" });
      return;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ledger-${cfg.walletPubkey.slice(0, 8)}-${ts}.db.gz"`
    );
    createReadStream(dbPath)
      .on("error", (e) => {
        console.error(`[export] stream error: ${e.message}`);
        if (!res.headersSent) res.status(500).end();
      })
      .pipe(createGzip())
      .pipe(res);
  });

  app.post("/webhook", webhookLimiter, async (req: Request, res: Response) => {
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

    // Track in-flight so graceful shutdown can wait for it
    track(
      execute(signal, { cfg, backend, conn }).catch(async (e) => {
        console.error(`[executor] uncaught on signal=${signal.id}:`, e);
        await tg.failed(1, e?.message || String(e)).catch(() => {});
      })
    );
  });

  app.use((err: any, _req: Request, res: Response, _next: any) => {
    console.error("[server] unhandled error:", err?.message || err);
    res.status(500).json({ error: "internal_error" });
  });

  // Bind 0.0.0.0 so Railway's edge proxy can reach the process. The only
  // authentication layer is the constant-time webhook secret check in verify.ts.
  // Locally, the port is only reachable from your machine.
  const server = app.listen(cfg.port, "0.0.0.0", () => {
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

  // Graceful shutdown: Railway's SIGTERM -> SIGKILL window is 30s.
  // Stop accepting new webhooks, drain in-flight executors, flush SQLite, exit.
  let shuttingDown = false;
  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${sig}, stopping listener`);
    server.close(() => console.log("[shutdown] listener closed"));
    await drain();
    closeDb();
    console.log("[shutdown] bye");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT",  () => void shutdown("SIGINT"));
}

main().catch(async (e) => {
  console.error("[fatal]", (e as { message?: string } | null | undefined)?.message || e);
  await sendBootCrashAlert(e);
  process.exit(1);
});
