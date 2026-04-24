"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { readWizardState } from "@/lib/storage";
import { BotClient, type BotClientError } from "@/lib/bot-client";
import { track } from "@/lib/analytics";
import { TrackMount } from "@/components/TrackMount";
import type { StatusResponse } from "shared";

const POLL_MS = 15_000;

type SetupInfo = {
  setupMode: boolean;
  network: string;
  missingEnv: string[];
  webhookUrl: string;
};

export default function StatusPage() {
  const [origin, setOrigin] = useState<string | null>(null);
  const [setupInfo, setSetupInfo] = useState<SetupInfo | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<BotClientError | null>(null);
  const [loading, setLoading] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const fetchSetupInfo = useCallback(async (): Promise<SetupInfo | null> => {
    try {
      const res = await fetch("/api/setup-info");
      if (!res.ok) return null;
      return (await res.json()) as SetupInfo;
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!origin) return;
    setLoading(true);
    setError(null);
    try {
      const info = await fetchSetupInfo();
      setSetupInfo(info);
      if (info?.setupMode) {
        setStatus(null);
        setLastUpdated(Date.now());
        return;
      }
      const client = new BotClient(origin, null);
      const s = await client.status();
      setStatus(s);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e as BotClientError);
      track("error.status.poll_fail", { kind: (e as BotClientError).kind });
    } finally {
      setLoading(false);
    }
  }, [origin, fetchSetupInfo]);

  useEffect(() => {
    if (!origin) return;
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [origin, refresh]);

  async function onPauseResume() {
    if (!status || !origin) return;
    setPausing(true);
    try {
      const client = new BotClient(origin, null);
      if (status.halt.halted) {
        track("status.resume.clicked");
        await client.resume();
      } else {
        track("status.pause.clicked");
        await client.pause();
      }
      await refresh();
    } catch (e) {
      setError(e as BotClientError);
    } finally {
      setPausing(false);
    }
  }

  if (!origin) return null;

  // Bot is still in setup mode → nudge user to finish configuration.
  if (setupInfo?.setupMode) {
    return (
      <Frame>
        <TrackMount event="status.visited" />
        <h1 className="text-2xl font-semibold">Setup not finished</h1>
        <p className="mt-3 text-fg-muted">
          The bot is running in <code className="font-mono">SETUP_MODE</code>.
          Trading is disabled until you paste env vars into Railway and remove
          SETUP_MODE.
        </p>
        {setupInfo.missingEnv.length > 0 && (
          <div className="mt-6 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
            <div className="text-warning">Missing env vars on Railway:</div>
            <ul className="mt-2 list-disc pl-5 font-mono text-xs text-fg-muted">
              {setupInfo.missingEnv.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </div>
        )}
        <Link
          href="/setup/wallet"
          className="mt-8 inline-flex rounded-md bg-accent px-6 py-2.5 font-medium text-black hover:bg-accent-hover"
        >
          Resume setup →
        </Link>
      </Frame>
    );
  }

  return (
    <Frame>
      <TrackMount event="status.visited" />
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Status</h1>
        <span className="text-xs text-fg-subtle">
          {loading && !status
            ? "Loading..."
            : lastUpdated
              ? `Updated ${fmtRelative(lastUpdated)}`
              : ""}
        </span>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          <div className="font-medium">
            {error.kind === "network"
              ? "Could not reach the bot"
              : error.kind === "shape"
                ? "Unexpected response shape"
                : "Error"}
          </div>
          <div className="mt-1 text-fg-muted">{error.message}</div>
        </div>
      )}

      {status && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card label="Wallet">
              <div className="font-mono text-xl">
                ${status.walletUsdcBalance.toFixed(2)}{" "}
                <span className="text-xs text-fg-subtle">USDC</span>
              </div>
              <div className="mt-1 font-mono text-sm text-fg-muted">
                {status.walletSolBalance.toFixed(4)} SOL
              </div>
              <div
                className="mt-2 truncate font-mono text-[10px] text-fg-subtle"
                title={status.walletPubkey}
              >
                {status.walletPubkey}
              </div>
            </Card>

            <Card label="Positions">
              {status.openPositions.length === 0 ? (
                <div className="font-mono text-fg-subtle">none open</div>
              ) : (
                <div className="space-y-2">
                  {status.openPositions.map((p) => (
                    <div key={p.positionKey} className="font-mono text-sm">
                      <div
                        className={
                          p.side === "long" ? "text-accent" : "text-danger"
                        }
                      >
                        {p.asset} {p.side}
                      </div>
                      <div className="text-xs text-fg-muted">
                        size ${p.sizeUsd.toFixed(0)} @ ${p.entryPrice.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card label="Today">
              <div
                className={`font-mono text-xl ${
                  status.realizedPnlTodayUsd >= 0 ? "text-accent" : "text-danger"
                }`}
              >
                {status.realizedPnlTodayUsd >= 0 ? "+" : ""}
                ${status.realizedPnlTodayUsd.toFixed(2)}
              </div>
              <div className="mt-1 text-xs text-fg-muted">realized PnL</div>
              <div
                className={`mt-3 rounded px-2 py-1 text-xs ${
                  status.halt.halted
                    ? "bg-warning/10 text-warning"
                    : "bg-accent/10 text-accent"
                }`}
              >
                {status.halt.halted
                  ? `Halted: ${status.halt.reason}`
                  : "Trading"}
              </div>
            </Card>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-bg-raised p-4 text-sm">
            <div className="text-fg-muted">
              Strategy: RSI Divergence · {status.tradingParams.asset} ·{" "}
              {status.tradingParams.leverage}× · $
              {status.tradingParams.collateralUsdc} per trade
            </div>
            <div className="mt-2 text-xs text-fg-subtle">
              Last signal:{" "}
              {status.lastSignalReceivedAt
                ? fmtRelative(status.lastSignalReceivedAt)
                : "none yet"}{" "}
              · Network: {status.network}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onPauseResume}
              disabled={pausing}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                status.halt.halted
                  ? "bg-accent text-black hover:bg-accent-hover"
                  : "border border-border bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg"
              } disabled:opacity-50`}
            >
              {pausing
                ? "..."
                : status.halt.halted
                  ? "Resume bot"
                  : "Pause bot"}
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-md border border-border bg-bg-raised px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-50"
            >
              Refresh
            </button>
            <a
              href={`/export?secret=${encodeURIComponent(
                readWizardState().webhookSecret || "",
              )}`}
              className="rounded-md border border-border bg-bg-raised px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
              target="_blank"
              rel="noreferrer"
            >
              Download ledger backup
            </a>
          </div>
        </>
      )}
    </Frame>
  );
}

function Card({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-raised p-5">
      <div className="mb-2 text-xs uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      {children}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <Link
          href="/"
          className="font-mono text-sm text-fg-muted hover:text-fg"
        >
          ← flash-trade-bot
        </Link>
        <Link
          href="/setup/wallet"
          className="text-xs text-fg-subtle hover:text-fg-muted"
        >
          Re-run setup
        </Link>
      </header>
      <div className="flex-1">{children}</div>
    </main>
  );
}

function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleString();
}
