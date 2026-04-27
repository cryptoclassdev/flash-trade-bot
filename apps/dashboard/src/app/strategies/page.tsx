"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readWizardState } from "@/lib/storage";
import {
  downloadStrategyPine,
  fetchStrategies,
  type StrategyEntry,
} from "@/lib/strategies";

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string>("");

  useEffect(() => {
    setWebhookSecret(readWizardState().webhookSecret || "");
    fetchStrategies()
      .then(setStrategies)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load strategies"),
      );
  }, []);

  async function onDownload(id: string) {
    setDownloadError(null);
    if (!webhookSecret) {
      setDownloadError(
        "Your dashboard doesn't have a webhook secret yet. Run the setup wizard first so we can generate one for you.",
      );
      return;
    }
    setDownloadingId(id);
    try {
      await downloadStrategyPine(id, webhookSecret);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

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
          href="/status"
          className="text-xs text-fg-subtle hover:text-fg-muted"
        >
          Bot status
        </Link>
      </header>

      <h1 className="mb-2 text-2xl font-semibold">Strategy library</h1>
      <p className="mb-8 text-fg-muted">
        Curated trading strategies that work with your bot. Pick one, download
        the Pine file with your webhook secret pre-filled, and create a
        TradingView alert pointing at your bot. Multiple strategies can run on
        the same bot — they share your global risk settings.
      </p>

      {!webhookSecret && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-warning">
          Run the{" "}
          <Link href="/setup/wallet" className="underline hover:text-fg">
            setup wizard
          </Link>{" "}
          first. We need a webhook secret before we can generate Pine files for
          you.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {strategies === null && !error && (
        <div className="rounded-lg border border-border bg-bg-raised p-6 text-fg-subtle">
          Loading...
        </div>
      )}

      {strategies && (
        <div className="space-y-4">
          {strategies.map((s) => (
            <article
              key={s.id}
              className="rounded-lg border border-border bg-bg-raised p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{s.name}</h2>
                  <div className="mt-1 flex gap-2 text-xs text-fg-subtle">
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono">
                      {s.asset}
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono">
                      {s.timeframe}
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono">
                      {s.longShort}
                    </span>
                    {s.tags?.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-border px-1.5 py-0.5"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDownload(s.id)}
                  disabled={!webhookSecret || downloadingId === s.id}
                  className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {downloadingId === s.id
                    ? "Generating..."
                    : "Use this strategy"}
                </button>
              </div>
              <p className="mt-3 text-sm text-fg-muted">{s.description}</p>
            </article>
          ))}
        </div>
      )}

      {downloadError && (
        <div className="mt-4 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {downloadError}
        </div>
      )}

      <footer className="mt-16 text-xs text-fg-subtle">
        Want to add your own strategy?{" "}
        <a
          href="https://github.com/cryptoclassdev/flash-trade-bot/blob/main/strategies/AUTHORING.md"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-fg-muted"
        >
          See the authoring contract
        </a>{" "}
        and PR a Pine file.
      </footer>
    </main>
  );
}
