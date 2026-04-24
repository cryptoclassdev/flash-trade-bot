"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WizardLayout } from "@/components/WizardLayout";
import { CopyButton } from "@/components/CopyButton";
import { readWizardState, writeWizardState } from "@/lib/storage";
import { buildRailwayDeployUrl, generateHexSecret } from "@/lib/railway";
import { track } from "@/lib/analytics";
import { STRATEGY_DEFAULTS } from "shared";
import type { BotEnv } from "shared";

export default function DeployPage() {
  const router = useRouter();
  const [state, setState] = useState<ReturnType<typeof readWizardState> | null>(
    null,
  );
  const [railwayUrl, setRailwayUrl] = useState("");
  const [healthStatus, setHealthStatus] = useState<
    "idle" | "checking" | "ok" | "fail"
  >("idle");
  const [healthMessage, setHealthMessage] = useState<string | null>(null);

  useEffect(() => {
    const s = readWizardState();
    if (!s.walletPubkey) {
      router.replace("/setup/wallet");
      return;
    }
    if (!s.webhookSecret || !s.dashboardToken) {
      const patch = {
        webhookSecret: s.webhookSecret || generateHexSecret(32),
        dashboardToken: s.dashboardToken || generateHexSecret(32),
      };
      setState(writeWizardState(patch));
    } else {
      setState(s);
    }
    if (s.railwayUrl) setRailwayUrl(s.railwayUrl);
  }, [router]);

  const deployEnv = useMemo<Partial<BotEnv>>(() => {
    if (!state) return {};
    const strategy = state.strategy || STRATEGY_DEFAULTS;
    return {
      NETWORK: "mainnet-beta",
      I_UNDERSTAND_REAL_MONEY: "yes",
      RPC_URL_MAINNET: state.rpcUrl,
      RPC_URL_MAINNET_FALLBACK: state.rpcUrlFallback,
      PRIVATE_KEY: "REPLACE_WITH_YOUR_PRIVATE_KEY",
      WEBHOOK_SECRET: state.webhookSecret,
      TELEGRAM_BOT_TOKEN: state.telegramBotToken,
      TELEGRAM_CHAT_ID: state.telegramChatId,
      DASHBOARD_TOKEN: state.dashboardToken,
      ASSET: strategy.ASSET,
      COLLATERAL_USDC: String(strategy.COLLATERAL_USDC),
      LEVERAGE: String(strategy.LEVERAGE),
      MAX_DAILY_LOSS_USDC: String(strategy.MAX_DAILY_LOSS_USDC),
      SLIPPAGE_ENTRY_BPS: String(strategy.SLIPPAGE_ENTRY_BPS),
      SLIPPAGE_EXIT_BPS: String(strategy.SLIPPAGE_EXIT_BPS),
    };
  }, [state]);

  const railwayDeployUrl = useMemo(
    () => buildRailwayDeployUrl(deployEnv),
    [deployEnv],
  );

  const envBlock = useMemo(
    () =>
      Object.entries(deployEnv)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    [deployEnv],
  );

  async function onVerify() {
    if (!railwayUrl.trim()) return;
    setHealthStatus("checking");
    setHealthMessage(null);
    try {
      const url = railwayUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${url}/health`, {
        mode: "cors",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`Health check returned HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        status?: string;
        wallet?: string;
        network?: string;
      };
      if (json.status !== "ok") {
        throw new Error(`Unexpected /health response: ${JSON.stringify(json)}`);
      }
      if (state?.walletPubkey && json.wallet && json.wallet !== state.walletPubkey) {
        throw new Error(
          "The bot is running with a different wallet than the one you generated. Check the PRIVATE_KEY env var in Railway.",
        );
      }
      setHealthStatus("ok");
      setHealthMessage(
        json.network === "mainnet-beta"
          ? "Bot is live on mainnet-beta."
          : `Bot is running (network=${json.network}).`,
      );
      track("setup.bot.verified");
    } catch (e) {
      setHealthStatus("fail");
      setHealthMessage(
        e instanceof Error ? e.message : "Could not reach the bot.",
      );
      track("error.railway.health_fail");
    }
  }

  function onContinue() {
    if (healthStatus !== "ok" || !railwayUrl.trim()) return;
    writeWizardState({
      railwayUrl: railwayUrl.trim().replace(/\/+$/, ""),
      botHealthVerified: true,
    });
    router.push("/setup/tradingview");
  }

  if (!state) return null;

  const ready =
    !!state.rpcUrl &&
    !!state.telegramBotToken &&
    !!state.telegramChatId &&
    !!state.walletPubkey;

  return (
    <WizardLayout step={6} title="Deploy to Railway">
      {!ready && (
        <div className="mb-6 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
          One or more earlier steps were skipped. The deploy URL below will be
          incomplete. Go back and finish them before deploying.
        </div>
      )}

      <div className="mb-6 space-y-3 rounded-lg border border-border bg-bg-raised p-4 text-sm">
        <Check ok={!!state.walletPubkey}>Wallet generated</Check>
        <Check ok={!!state.walletFunded}>Wallet funded (or skipped)</Check>
        <Check ok={!!state.rpcUrl}>Helius RPC connected</Check>
        <Check ok={!!state.telegramVerified}>Telegram bot verified</Check>
        <Check ok={!!state.strategy}>Strategy configured</Check>
      </div>

      <div className="space-y-5">
        <div>
          <a
            href={railwayDeployUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md bg-accent px-6 py-3 font-medium text-black transition hover:bg-accent-hover"
          >
            Deploy on Railway →
          </a>
          <p className="mt-2 text-xs text-fg-subtle">
            Opens Railway in a new tab with env vars pre-filled. Paste your
            private key into <code className="font-mono">PRIVATE_KEY</code>{" "}
            (it&apos;s marked <code>REPLACE_WITH_YOUR_PRIVATE_KEY</code>), then
            click Deploy.
          </p>
        </div>

        <details>
          <summary className="cursor-pointer text-xs text-fg-subtle hover:text-fg-muted">
            Can&apos;t use the button? Copy env vars as a block.
          </summary>
          <div className="mt-3 rounded-md border border-border bg-bg p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-fg-subtle">
                Paste into Railway&apos;s raw editor
              </span>
              <CopyButton text={envBlock} label="Copy all" />
            </div>
            <pre className="overflow-x-auto font-mono text-xs text-fg-muted">
              {envBlock}
            </pre>
          </div>
        </details>
      </div>

      <hr className="my-10 border-border" />

      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wide text-fg-subtle">
            Your Railway domain (once deploy finishes)
          </label>
          <input
            type="text"
            value={railwayUrl}
            onChange={(e) => {
              setRailwayUrl(e.target.value);
              setHealthStatus("idle");
            }}
            placeholder="https://flash-trade-bot-production.up.railway.app"
            className="mt-2 w-full rounded-md border border-border bg-bg-raised px-3 py-2.5 font-mono text-sm focus:border-border-strong focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={onVerify}
          disabled={!railwayUrl.trim() || healthStatus === "checking"}
          className="rounded-md border border-border bg-bg-raised px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40"
        >
          {healthStatus === "checking" ? "Checking /health..." : "Verify bot is up"}
        </button>

        {healthStatus === "ok" && healthMessage && (
          <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
            ✓ {healthMessage}
          </div>
        )}
        {healthStatus === "fail" && healthMessage && (
          <div className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {healthMessage}
          </div>
        )}
      </div>

      <div className="mt-10 flex gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={healthStatus !== "ok"}
          className="rounded-md bg-accent px-6 py-2.5 font-medium text-black transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue →
        </button>
        <button
          type="button"
          onClick={() => router.push("/setup/strategy")}
          className="rounded-md border border-border px-4 py-2.5 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
        >
          ← Back
        </button>
      </div>
    </WizardLayout>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex items-center gap-2 ${ok ? "text-fg" : "text-fg-subtle"}`}
    >
      <span className={ok ? "text-accent" : "text-fg-subtle"}>
        {ok ? "✓" : "○"}
      </span>
      <span>{children}</span>
    </div>
  );
}
