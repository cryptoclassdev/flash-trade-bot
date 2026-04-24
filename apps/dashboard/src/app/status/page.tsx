"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { readWizardState, writeWizardState } from "@/lib/storage";
import { BotClient, type BotClientError } from "@/lib/bot-client";
import { track } from "@/lib/analytics";
import { TrackMount } from "@/components/TrackMount";
import type { StatusResponse } from "shared";

const POLL_MS = 15_000;

export default function StatusPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [railwayUrl, setRailwayUrl] = useState("");
  const [dashboardToken, setDashboardToken] = useState("");
  const [setupUrlInput, setSetupUrlInput] = useState("");
  const [setupTokenInput, setSetupTokenInput] = useState("");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<BotClientError | null>(null);
  const [loading, setLoading] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    const s = readWizardState();
    if (s.railwayUrl && s.dashboardToken) {
      setRailwayUrl(s.railwayUrl);
      setDashboardToken(s.dashboardToken);
      setConfigured(true);
    } else {
      setConfigured(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!railwayUrl) return;
    setLoading(true);
    setError(null);
    try {
      const client = new BotClient(railwayUrl, dashboardToken || null);
      const s = await client.status();
      setStatus(s);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e as BotClientError);
      track("error.status.poll_fail", {
        kind: (e as BotClientError).kind,
      });
    } finally {
      setLoading(false);
    }
  }, [railwayUrl, dashboardToken]);

  useEffect(() => {
    if (!railwayUrl) return;
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [railwayUrl, refresh]);

  async function onPauseResume() {
    if (!status) return;
    setPausing(true);
    try {
      const client = new BotClient(railwayUrl, dashboardToken || null);
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

  function onManualConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!setupUrlInput.trim()) return;
    const url = setupUrlInput.trim().replace(/\/+$/, "");
    writeWizardState({
      railwayUrl: url,
      dashboardToken: setupTokenInput.trim() || undefined,
    });
    setRailwayUrl(url);
    setDashboardToken(setupTokenInput.trim());
    setConfigured(true);
  }

  if (configured === null) return null;

  if (!configured) {
    return (
      <Frame>
        <h1 className="text-2xl font-semibold">Connect your bot</h1>
        <p className="mt-3 text-fg-muted">
          Paste the Railway URL of a deployed flash-trade-bot, plus the
          dashboard token you set as <code className="font-mono">DASHBOARD_TOKEN</code>{" "}
          on Railway.
        </p>
        <form onSubmit={onManualConfig} className="mt-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-fg-subtle">
              Railway URL
            </label>
            <input
              type="text"
              value={setupUrlInput}
              onChange={(e) => setSetupUrlInput(e.target.value)}
              placeholder="https://flash-trade-bot-production.up.railway.app"
              className="mt-2 w-full rounded-md border border-border bg-bg-raised px-3 py-2.5 font-mono text-sm focus:border-border-strong focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-fg-subtle">
              Dashboard token (optional — leave blank if DASHBOARD_TOKEN unset)
            </label>
            <input
              type="text"
              value={setupTokenInput}
              onChange={(e) => setSetupTokenInput(e.target.value)}
              placeholder="64 hex characters"
              className="mt-2 w-full rounded-md border border-border bg-bg-raised px-3 py-2.5 font-mono text-sm focus:border-border-strong focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-accent px-6 py-2.5 font-medium text-black transition hover:bg-accent-hover"
          >
            Connect →
          </button>
        </form>
        <p className="mt-8 text-sm text-fg-subtle">
          Haven&apos;t deployed yet?{" "}
          <Link className="underline hover:text-fg" href="/setup/wallet">
            Run the setup wizard
          </Link>
          .
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <TrackMount event="status.visited" />
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Status</h1>
        <span className="text-xs text-fg-subtle">
          {loading && !status ? "Loading..." : lastUpdated ? `Updated ${fmtRelative(lastUpdated)}` : ""}
        </span>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          <div className="font-medium">
            {error.kind === "cors"
              ? "Your bot hasn't been redeployed with dashboard support"
              : error.kind === "unauthorized"
                ? "Bot rejected the dashboard token"
                : error.kind === "not-found"
                  ? "Bot is missing dashboard routes"
                  : error.kind === "shape"
                    ? "Unexpected response shape"
                    : "Could not reach the bot"}
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
                        size ${p.sizeUsd.toFixed(0)} @ $
                        {p.entryPrice.toFixed(2)}
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
            <div className="flex items-center justify-between">
              <div className="text-fg-muted">
                Strategy: RSI Divergence · {status.tradingParams.asset} ·{" "}
                {status.tradingParams.leverage}× · $
                {status.tradingParams.collateralUsdc} per trade
              </div>
            </div>
            <div className="mt-2 text-xs text-fg-subtle">
              Last signal:{" "}
              {status.lastSignalReceivedAt
                ? fmtRelative(status.lastSignalReceivedAt)
                : "none yet"}
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
              href={`${railwayUrl}/export?secret=${encodeURIComponent(
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
