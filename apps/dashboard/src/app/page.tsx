import Link from "next/link";
import { TrackMount } from "@/components/TrackMount";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-16 sm:py-24">
      <TrackMount event="dashboard.landed" />
      <header className="mb-16 flex items-center justify-between">
        <div className="font-mono text-sm text-fg-muted">flash-trade-bot</div>
        <nav className="flex gap-6 text-sm text-fg-muted">
          <a
            href="https://github.com/cryptoclassdev/flash-trade-bot"
            className="hover:text-fg"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <Link href="/status" className="hover:text-fg">
            Status
          </Link>
        </nav>
      </header>

      <section className="flex flex-1 flex-col justify-center">
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          Run automated Solana perps trading
          <br />
          <span className="text-accent">on your own wallet.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-fg-muted">
          A guided setup for the{" "}
          <a
            href="https://github.com/cryptoclassdev/flash-trade-bot"
            className="text-fg underline underline-offset-4 hover:text-accent"
            target="_blank"
            rel="noreferrer"
          >
            flash-trade-bot
          </a>{" "}
          Railway template. Takes about 30 minutes. You generate the wallet, you
          fund it, you hold the keys. We just make the setup less painful.
        </p>

        <dl className="mt-10 grid grid-cols-1 gap-6 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-bg-raised p-4">
            <dt className="text-fg-subtle">Setup time</dt>
            <dd className="mt-1 font-mono text-xl">~30 min</dd>
          </div>
          <div className="rounded-lg border border-border bg-bg-raised p-4">
            <dt className="text-fg-subtle">Infra cost</dt>
            <dd className="mt-1 font-mono text-xl">~$20/mo</dd>
            <p className="mt-1 text-xs text-fg-muted">
              Railway + TradingView Pro+
            </p>
          </div>
          <div className="rounded-lg border border-border bg-bg-raised p-4">
            <dt className="text-fg-subtle">Custody</dt>
            <dd className="mt-1 font-mono text-xl text-accent">Self</dd>
            <p className="mt-1 text-xs text-fg-muted">We never see your key.</p>
          </div>
        </dl>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link
            href="/setup/wallet"
            className="inline-flex items-center justify-center rounded-md bg-accent px-8 py-3 font-medium text-black transition hover:bg-accent-hover focus-visible:outline-accent"
          >
            Start setup →
          </Link>
          <Link
            href="/status"
            className="inline-flex items-center justify-center px-4 py-3 text-sm text-fg-muted hover:text-fg"
          >
            I already deployed — show my bot&apos;s status
          </Link>
        </div>

        <p className="mt-8 max-w-2xl text-xs text-fg-subtle">
          You&apos;ll need USDC on Solana and a TradingView Pro+ account. Not
          financial advice — see the{" "}
          <a
            href="https://github.com/cryptoclassdev/flash-trade-bot/blob/main/DISCLAIMER.md"
            className="underline hover:text-fg-muted"
            target="_blank"
            rel="noreferrer"
          >
            disclaimer
          </a>{" "}
          and{" "}
          <a
            href="https://github.com/cryptoclassdev/flash-trade-bot/blob/main/SECURITY-NOTES.md"
            className="underline hover:text-fg-muted"
            target="_blank"
            rel="noreferrer"
          >
            security notes
          </a>{" "}
          before funding a wallet.
        </p>
      </section>

      <footer className="mt-24 flex items-center justify-between text-xs text-fg-subtle">
        <span>MIT licensed · solo-founder build</span>
        <a
          href="https://github.com/cryptoclassdev/flash-trade-bot/issues"
          className="hover:text-fg-muted"
          target="_blank"
          rel="noreferrer"
        >
          Report an issue
        </a>
      </footer>
    </main>
  );
}
