"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WizardLayout } from "@/components/WizardLayout";
import { CopyButton } from "@/components/CopyButton";
import { readWizardState, writeWizardState } from "@/lib/storage";

export default function TradingViewPage() {
  const router = useRouter();
  const [railwayUrl, setRailwayUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const s = readWizardState();
    if (!s.walletPubkey) {
      router.replace("/setup/wallet");
      return;
    }
    if (!s.railwayUrl || !s.webhookSecret) {
      router.replace("/setup/deploy");
      return;
    }
    setRailwayUrl(s.railwayUrl);
    setWebhookSecret(s.webhookSecret);
  }, [router]);

  const webhookUrl = railwayUrl ? `${railwayUrl}/webhook` : "";
  const pineDownloadUrl = webhookSecret
    ? `/api/pine?secret=${encodeURIComponent(webhookSecret)}`
    : "";

  function onFinish() {
    if (!confirmed) return;
    writeWizardState({
      tradingviewConfirmed: true,
      completedAt: Date.now(),
    });
    router.push("/status");
  }

  if (!railwayUrl) return null;

  return (
    <WizardLayout step={7} title="Wire up TradingView">
      <p className="mb-6 text-fg-muted">
        The bot is running. Now we need TradingView to send it signals when
        the RSI Divergence strategy fires.
      </p>

      <ol className="space-y-6">
        <Step n={1} title="Download the Pine script">
          <p className="text-sm text-fg-muted">
            Your webhook secret is already baked into the Pine file&apos;s
            input default — you won&apos;t need to paste it manually.
          </p>
          <a
            href={pineDownloadUrl}
            download
            className="mt-3 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:bg-accent-hover"
          >
            Download flash-trade-bot-rsi-divergence.pine
          </a>
        </Step>

        <Step n={2} title="Open TradingView and create the strategy">
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
            <li>
              Open a BTCUSD chart (any exchange — the price-action is universal).
            </li>
            <li>
              Click <span className="font-medium text-fg">Pine Editor</span>{" "}
              (bottom panel).
            </li>
            <li>Paste the downloaded script.</li>
            <li>
              Click <span className="font-medium text-fg">Save</span> — any
              name works.
            </li>
            <li>
              Click <span className="font-medium text-fg">Add to chart</span>.
              TradingView opens the Inputs dialog; your secret is already
              filled. Click OK.
            </li>
          </ul>
        </Step>

        <Step n={3} title="Create the alert">
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
            <li>
              Click the ⏰ (clock) icon on the chart toolbar.
            </li>
            <li>
              <span className="font-medium text-fg">Condition</span>: select
              your strategy → &quot;alert() function calls only&quot;.
            </li>
            <li>
              <span className="font-medium text-fg">Expiration</span>:
              Open-ended.
            </li>
            <li>
              Switch to the <span className="font-medium text-fg">Notifications</span>{" "}
              tab, check <span className="font-medium text-fg">Webhook URL</span>
              , paste:
            </li>
          </ul>

          <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-bg-raised p-3">
            <code className="flex-1 break-all font-mono text-xs">
              {webhookUrl}
            </code>
            <CopyButton text={webhookUrl} />
          </div>

          <p className="mt-3 text-xs text-fg-subtle">
            Leave the message body blank — the Pine script builds the JSON
            payload internally. Click Create.
          </p>
        </Step>
      </ol>

      <label className="mt-10 flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I&apos;ve created the TradingView alert and the webhook URL is
          pointing at my Railway bot.
        </span>
      </label>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={onFinish}
          disabled={!confirmed}
          className="rounded-md bg-accent px-6 py-2.5 font-medium text-black transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Finish setup →
        </button>
        <button
          type="button"
          onClick={() => router.push("/setup/deploy")}
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
