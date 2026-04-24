"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WizardLayout } from "@/components/WizardLayout";
import { CopyButton } from "@/components/CopyButton";
import { readWizardState, writeWizardState } from "@/lib/storage";
import { generateHexSecret } from "@/lib/railway";
import { track } from "@/lib/analytics";
import { STRATEGY_DEFAULTS, type BotEnv } from "shared";

/**
 * In the bundled architecture, the bot IS already deployed (you're reading
 * this screen because the bot served the dashboard). So this screen no
 * longer says "deploy to Railway". It tells the user what env vars to paste
 * into their existing Railway service + remove SETUP_MODE, then wait for
 * the automatic restart.
 */

type SetupInfo = {
  setupMode: boolean;
  network: string;
  missingEnv: string[];
  webhookUrl: string;
};

export default function DeployPage() {
  const router = useRouter();
  const [state, setState] = useState<ReturnType<typeof readWizardState> | null>(
    null,
  );
  const [setupInfo, setSetupInfo] = useState<SetupInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = readWizardState();
    if (!s.walletPubkey) {
      router.replace("/setup/wallet");
      return;
    }
    // Generate one-time secrets if missing. These get pasted into Railway.
    if (!s.webhookSecret) {
      setState(writeWizardState({ webhookSecret: generateHexSecret(32) }));
    } else {
      setState(s);
    }
  }, [router]);

  const envBlock = useMemo(() => {
    if (!state) return "";
    const strategy = state.strategy || STRATEGY_DEFAULTS;
    const values: Partial<BotEnv> = {
      NETWORK: "mainnet-beta",
      I_UNDERSTAND_REAL_MONEY: "yes",
      RPC_URL_MAINNET: state.rpcUrl,
      RPC_URL_MAINNET_FALLBACK: state.rpcUrlFallback,
      PRIVATE_KEY: "REPLACE_WITH_YOUR_PRIVATE_KEY",
      WEBHOOK_SECRET: state.webhookSecret,
      TELEGRAM_BOT_TOKEN: state.telegramBotToken,
      TELEGRAM_CHAT_ID: state.telegramChatId,
      ASSET: strategy.ASSET,
      COLLATERAL_USDC: String(strategy.COLLATERAL_USDC),
      LEVERAGE: String(strategy.LEVERAGE),
      MAX_DAILY_LOSS_USDC: String(strategy.MAX_DAILY_LOSS_USDC),
      SLIPPAGE_ENTRY_BPS: String(strategy.SLIPPAGE_ENTRY_BPS),
      SLIPPAGE_EXIT_BPS: String(strategy.SLIPPAGE_EXIT_BPS),
    };
    return Object.entries(values)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  }, [state]);

  async function checkStatus() {
    setChecking(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/setup-info");
      if (!res.ok) throw new Error(`Bot returned HTTP ${res.status}`);
      const info = (await res.json()) as SetupInfo;
      setSetupInfo(info);
      if (!info.setupMode) {
        setReady(true);
        setStatusMessage("Bot is out of setup mode and ready to trade.");
        track("setup.bot.verified");
      } else if (info.missingEnv.length === 0) {
        setStatusMessage(
          "All env vars are set, but SETUP_MODE is still true. Remove SETUP_MODE on Railway and wait for the restart.",
        );
      } else {
        setStatusMessage(
          `Still waiting on: ${info.missingEnv.join(", ")}. Paste them into Railway and wait for the restart.`,
        );
      }
    } catch (e) {
      setStatusMessage(
        e instanceof Error ? e.message : "Could not reach the bot",
      );
      track("error.railway.health_fail");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkStatus();
  }, []);

  function onContinue() {
    if (!ready) return;
    writeWizardState({ botHealthVerified: true });
    router.push("/setup/tradingview");
  }

  if (!state) return null;

  return (
    <WizardLayout step={6} title="Finish Railway configuration">
      <p className="mb-6 text-fg-muted">
        Your bot is already deployed on Railway (you&apos;re reading this page
        served by it). Now it needs the env vars from the earlier steps, and
        you need to flip it out of setup mode.
      </p>

      <ol className="mb-8 space-y-5">
        <Step n={1} title="Open your Railway service → Variables">
          <p className="text-sm text-fg-muted">
            Settings → Variables tab on your{" "}
            <code className="font-mono">flash-trade-bot</code> service.
          </p>
        </Step>

        <Step n={2} title="Paste these variables">
          <p className="text-sm text-fg-muted">
            Use the &quot;Raw Editor&quot; on Railway and paste the full block.
            Replace <code className="font-mono">REPLACE_WITH_YOUR_PRIVATE_KEY</code>
            {" "}with the base58 private key you generated in step 1.
          </p>
          <div className="mt-3 rounded-md border border-border bg-bg p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-fg-subtle">
                Env block
              </span>
              <CopyButton text={envBlock} label="Copy all" />
            </div>
            <pre className="max-h-72 overflow-auto font-mono text-xs text-fg-muted">
              {envBlock}
            </pre>
          </div>
        </Step>

        <Step n={3} title="Remove SETUP_MODE">
          <p className="text-sm text-fg-muted">
            Delete the <code className="font-mono">SETUP_MODE</code> variable
            (or set it to <code className="font-mono">false</code>). Railway
            redeploys automatically — takes about 60 seconds.
          </p>
        </Step>
      </ol>

      <div className="rounded-lg border border-border bg-bg-raised p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-fg-subtle">
              Bot status
            </div>
            <div
              className={`mt-1 text-sm ${ready ? "text-accent" : "text-fg-muted"}`}
            >
              {ready
                ? "✓ Ready to trade"
                : setupInfo?.setupMode
                  ? "SETUP_MODE still on — waiting for restart"
                  : "Checking..."}
            </div>
            {statusMessage && (
              <div className="mt-2 text-xs text-fg-subtle">{statusMessage}</div>
            )}
          </div>
          <button
            type="button"
            onClick={checkStatus}
            disabled={checking}
            className="rounded-md border border-border bg-bg px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-50"
          >
            {checking ? "Checking..." : "Re-check"}
          </button>
        </div>
      </div>

      <div className="mt-10 flex gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={!ready}
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

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-lg border border-border bg-bg-raised p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong font-mono text-sm">
          {n}
        </span>
        <h3 className="font-medium">{title}</h3>
      </div>
      {children}
    </li>
  );
}
