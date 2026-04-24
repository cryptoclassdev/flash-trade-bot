"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WizardLayout } from "@/components/WizardLayout";
import { readWizardState, writeWizardState } from "@/lib/storage";
import { validateRpcEndpoint } from "@/lib/rpc";
import { track } from "@/lib/analytics";

export default function RpcPage() {
  const router = useRouter();
  const [rpcUrl, setRpcUrl] = useState("");
  const [fallback, setFallback] = useState("");
  const [status, setStatus] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const s = readWizardState();
    if (!s.walletPubkey) router.replace("/setup/wallet");
    if (s.rpcUrl) setRpcUrl(s.rpcUrl);
    if (s.rpcUrlFallback) setFallback(s.rpcUrlFallback);
  }, [router]);

  async function onTest() {
    setStatus("testing");
    setMessage(null);
    try {
      const slot = await validateRpcEndpoint(rpcUrl.trim());
      setStatus("ok");
      setMessage(`Connected. Current slot: ${slot.toLocaleString()}.`);
      track("setup.rpc.validated");
    } catch (e) {
      setStatus("fail");
      setMessage(e instanceof Error ? e.message : "RPC test failed");
      track("error.rpc.test_failed");
    }
  }

  function onContinue() {
    if (status !== "ok") return;
    writeWizardState({
      rpcUrl: rpcUrl.trim(),
      rpcUrlFallback: fallback.trim() || undefined,
    });
    router.push("/setup/telegram");
  }

  return (
    <WizardLayout step={3} title="Connect a Solana RPC">
      <p className="mb-6 text-fg-muted">
        The public Solana endpoint rate-limits under load. Helius&apos; free
        tier handles this strategy comfortably.
      </p>

      <ol className="mb-8 space-y-2 text-sm text-fg-muted">
        <li>
          1. Open{" "}
          <a
            className="underline hover:text-fg"
            href="https://www.helius.dev/"
            target="_blank"
            rel="noreferrer"
          >
            helius.dev
          </a>{" "}
          and sign up.
        </li>
        <li>2. Dashboard → Create Endpoint → Mainnet.</li>
        <li>3. Copy the full URL (includes <code className="font-mono">?api-key=...</code>).</li>
      </ol>

      <label className="text-xs uppercase tracking-wide text-fg-subtle">
        Helius mainnet URL
      </label>
      <input
        type="text"
        value={rpcUrl}
        onChange={(e) => {
          setRpcUrl(e.target.value);
          setStatus("idle");
        }}
        placeholder="https://mainnet.helius-rpc.com/?api-key=..."
        className="mt-2 w-full rounded-md border border-border bg-bg-raised px-3 py-2.5 font-mono text-sm focus:border-border-strong focus:outline-none"
      />

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-fg-subtle hover:text-fg-muted">
          Add a fallback RPC (recommended for production)
        </summary>
        <input
          type="text"
          value={fallback}
          onChange={(e) => setFallback(e.target.value)}
          placeholder="Optional second mainnet RPC (Triton, QuickNode, etc.)"
          className="mt-3 w-full rounded-md border border-border bg-bg-raised px-3 py-2.5 font-mono text-xs focus:border-border-strong focus:outline-none"
        />
      </details>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onTest}
          disabled={!rpcUrl.trim() || status === "testing"}
          className="rounded-md border border-border bg-bg-raised px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40"
        >
          {status === "testing" ? "Testing..." : "Test connection"}
        </button>
        {status === "ok" && (
          <span className="text-sm text-accent">✓ {message}</span>
        )}
      </div>

      {status === "fail" && message && (
        <div className="mt-4 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {message}
        </div>
      )}

      <div className="mt-10 flex gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={status !== "ok"}
          className="rounded-md bg-accent px-6 py-2.5 font-medium text-black transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue →
        </button>
        <button
          type="button"
          onClick={() => router.push("/setup/fund")}
          className="rounded-md border border-border px-4 py-2.5 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
        >
          ← Back
        </button>
      </div>
    </WizardLayout>
  );
}
