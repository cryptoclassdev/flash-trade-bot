"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { WizardLayout } from "@/components/WizardLayout";
import { CopyButton } from "@/components/CopyButton";
import { readWizardState, writeWizardState } from "@/lib/storage";
import { getWalletBalance, type WalletBalance } from "@/lib/rpc";
import { buildSolanaPayUrl } from "@/lib/solana-pay";

const MIN_USDC = 50;
const MIN_SOL = 0.05;
const POLL_MS = 10_000;

export default function FundPage() {
  const router = useRouter();
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [autoPoll, setAutoPoll] = useState(false);

  useEffect(() => {
    const s = readWizardState();
    if (!s.walletPubkey) {
      router.replace("/setup/wallet");
      return;
    }
    setPubkey(s.walletPubkey);
  }, [router]);

  async function check() {
    if (!pubkey) return;
    setChecking(true);
    setError(null);
    try {
      const b = await getWalletBalance(pubkey);
      setBalance(b);
      if (b.usdc >= MIN_USDC && b.sol >= MIN_SOL) {
        setAutoPoll(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Balance check failed");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!autoPoll || !pubkey) return;
    const t = setInterval(check, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPoll, pubkey]);

  function onContinue() {
    writeWizardState({ walletFunded: true });
    router.push("/setup/rpc");
  }

  if (!pubkey) return null;

  const solanaPayUrl = buildSolanaPayUrl(pubkey, MIN_USDC);
  const funded = balance && balance.usdc >= MIN_USDC && balance.sol >= MIN_SOL;

  return (
    <WizardLayout step={2} title="Fund your wallet">
      <p className="mb-6 text-fg-muted">
        Send at least{" "}
        <span className="font-mono text-fg">{MIN_USDC} USDC</span> +{" "}
        <span className="font-mono text-fg">{MIN_SOL} SOL</span> (for gas) to
        this address on the{" "}
        <span className="font-medium text-fg">Solana network</span>. Not
        Ethereum. Not Polygon. Solana.
      </p>

      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className="flex items-start">
          <div className="rounded-lg border border-border bg-white p-3">
            <QRCodeSVG value={solanaPayUrl} size={180} />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-fg-subtle">
              Wallet address
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-bg-raised p-3">
              <code className="flex-1 break-all font-mono text-xs">
                {pubkey}
              </code>
              <CopyButton text={pubkey} />
            </div>
          </div>
          <a
            href={solanaPayUrl}
            className="inline-block rounded-md border border-border bg-bg-raised px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
          >
            Open in Phantom / Solflare →
          </a>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between rounded-lg border border-border bg-bg-raised p-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-fg-subtle">
              Current balance
            </div>
            <div className="mt-1 font-mono text-lg">
              {balance ? (
                <>
                  <span className={balance.usdc >= MIN_USDC ? "text-accent" : ""}>
                    {balance.usdc.toFixed(2)} USDC
                  </span>
                  {" · "}
                  <span className={balance.sol >= MIN_SOL ? "text-accent" : ""}>
                    {balance.sol.toFixed(4)} SOL
                  </span>
                </>
              ) : (
                <span className="text-fg-subtle">not checked yet</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              check();
              setAutoPoll(true);
            }}
            disabled={checking}
            className="rounded-md border border-border bg-bg px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-50"
          >
            {checking ? "Checking..." : "Check balance"}
          </button>
        </div>

        {autoPoll && !funded && (
          <p className="mt-3 text-xs text-fg-subtle">
            Polling every 10s. Solana transfers usually confirm in 2-3 seconds
            after your exchange broadcasts.
          </p>
        )}

        {balance && !funded && balance.usdc === 0 && (
          <p className="mt-3 text-xs text-warning">
            No USDC detected. A common mistake: USDC sent on the wrong network.
            Solana USDC mint starts with <code className="font-mono">EPjF</code>
            . Double-check the network dropdown in your exchange.
          </p>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mt-10 flex gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md bg-accent px-6 py-2.5 font-medium text-black transition hover:bg-accent-hover"
        >
          {funded ? "Continue →" : "Skip and continue anyway →"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/setup/wallet")}
          className="rounded-md border border-border px-4 py-2.5 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
        >
          ← Back
        </button>
      </div>
    </WizardLayout>
  );
}
