import Link from "next/link";
import type { ReactNode } from "react";

const STEPS: Array<{ href: string; label: string }> = [
  { href: "/setup/wallet", label: "Wallet" },
  { href: "/setup/fund", label: "Fund" },
  { href: "/setup/rpc", label: "RPC" },
  { href: "/setup/telegram", label: "Telegram" },
  { href: "/setup/strategy", label: "Strategy" },
  { href: "/setup/deploy", label: "Deploy" },
  { href: "/setup/tradingview", label: "TradingView" },
];

export function WizardLayout({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  const pct = (step / STEPS.length) * 100;
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <header className="mb-10">
        <Link
          href="/"
          className="font-mono text-xs text-fg-muted hover:text-fg"
        >
          ← flash-trade-bot
        </Link>
        <div className="mt-6 flex items-center justify-between text-xs text-fg-subtle">
          <span className="font-mono">
            Step {step} of {STEPS.length}
          </span>
          <span className="font-mono">{STEPS[step - 1]?.label}</span>
        </div>
        <div className="mt-2 h-1 w-full rounded bg-border">
          <div
            className="h-1 rounded bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <h1 className="mb-8 text-2xl font-semibold sm:text-3xl">{title}</h1>

      <div className="flex-1">{children}</div>
    </main>
  );
}
