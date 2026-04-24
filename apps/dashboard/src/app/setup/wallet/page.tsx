"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WizardLayout } from "@/components/WizardLayout";
import { CopyButton } from "@/components/CopyButton";
import {
  buildBackupFile,
  generateWallet,
  parsePrivateKey,
  type GeneratedWallet,
} from "@/lib/wallet";
import { writeWizardState } from "@/lib/storage";

export default function WalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<GeneratedWallet | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const [advanced, setAdvanced] = useState(false);
  const [pastedKey, setPastedKey] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteAck, setPasteAck] = useState(false);

  function onGenerate() {
    setWallet(generateWallet());
    setRevealed(false);
    setAcknowledged(false);
  }

  function onDownload() {
    if (!wallet) return;
    const blob = new Blob([buildBackupFile(wallet)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flash-trade-bot-wallet-${wallet.pubkey.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onContinue() {
    if (!wallet || !acknowledged) return;
    writeWizardState({ walletPubkey: wallet.pubkey });
    router.push("/setup/fund");
  }

  function onPasteSubmit() {
    setPasteError(null);
    try {
      const parsed = parsePrivateKey(pastedKey);
      if (!pasteAck) {
        setPasteError("You must acknowledge the security warning to continue.");
        return;
      }
      writeWizardState({ walletPubkey: parsed.pubkey });
      router.push("/setup/fund");
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : "Invalid key");
    }
  }

  return (
    <WizardLayout step={1} title="Create your trading wallet">
      {!advanced && (
        <>
          <p className="mb-6 text-fg-muted">
            The bot needs its own Solana wallet. Generate a fresh one below —
            the key is created in your browser and never sent to us.
          </p>

          {!wallet && (
            <button
              type="button"
              onClick={onGenerate}
              className="rounded-md bg-accent px-6 py-3 font-medium text-black transition hover:bg-accent-hover"
            >
              Generate new trading wallet
            </button>
          )}

          {wallet && (
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-bg-raised p-4">
                <div className="mb-2 text-xs uppercase tracking-wide text-fg-subtle">
                  Public address
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all font-mono text-sm">
                    {wallet.pubkey}
                  </code>
                  <CopyButton text={wallet.pubkey} />
                </div>
              </div>

              <div className="rounded-lg border border-danger/40 bg-danger/5 p-4">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-danger">
                  <span>Private key — save this</span>
                  <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    className="text-xs normal-case text-fg-muted hover:text-fg"
                  >
                    {revealed ? "Hide" : "Reveal"}
                  </button>
                </div>
                <div className="flex items-start gap-2">
                  <code className="flex-1 break-all font-mono text-sm">
                    {revealed
                      ? wallet.privateKeyBase58
                      : "•".repeat(88)}
                  </code>
                  <CopyButton text={wallet.privateKeyBase58} />
                </div>
                <p className="mt-3 text-xs text-fg-muted">
                  Anyone with this key can drain your funds. We never see it
                  and cannot recover it.
                </p>
              </div>

              <button
                type="button"
                onClick={onDownload}
                className="rounded border border-border bg-bg-raised px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
              >
                Download backup file
              </button>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I&apos;ve saved my private key somewhere safe. I understand
                  flash-trade-bot cannot recover it if I lose it.
                </span>
              </label>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={!acknowledged}
                  className="rounded-md bg-accent px-6 py-2.5 font-medium text-black transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue to funding →
                </button>
                <button
                  type="button"
                  onClick={onGenerate}
                  className="rounded-md border border-border px-4 py-2.5 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
                >
                  Generate a different one
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAdvanced(true)}
            className="mt-10 text-xs text-fg-subtle underline hover:text-fg-muted"
          >
            Advanced: use an existing wallet instead
          </button>
        </>
      )}

      {advanced && (
        <div className="space-y-5">
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-fg-muted">
            <div className="mb-2 font-medium text-warning">
              This is not recommended.
            </div>
            Reusing your main Phantom/Solflare wallet means the bot can spend
            anything in it — not just the collateral you intend to trade. A
            bug or Railway breach drains everything. The default path
            (generating a new wallet) keeps the bot sandboxed from your
            main holdings.
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-fg-subtle">
              Private key (base58)
            </label>
            <textarea
              value={pastedKey}
              onChange={(e) => setPastedKey(e.target.value)}
              className="mt-2 h-24 w-full rounded-md border border-border bg-bg-raised p-3 font-mono text-sm focus:border-border-strong focus:outline-none"
              placeholder="Your 87-88 character base58 private key..."
              spellCheck={false}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={pasteAck}
              onChange={(e) => setPasteAck(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I understand that if this wallet or the Railway server running
              the bot is compromised, every asset in this wallet (not just the
              trading collateral) is at risk.
            </span>
          </label>

          {pasteError && (
            <div className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              {pasteError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onPasteSubmit}
              disabled={!pastedKey.trim() || !pasteAck}
              className="rounded-md bg-accent px-6 py-2.5 font-medium text-black transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Use this wallet →
            </button>
            <button
              type="button"
              onClick={() => {
                setAdvanced(false);
                setPastedKey("");
                setPasteError(null);
              }}
              className="rounded-md border border-border px-4 py-2.5 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
            >
              Back to safe default
            </button>
          </div>
        </div>
      )}
    </WizardLayout>
  );
}
