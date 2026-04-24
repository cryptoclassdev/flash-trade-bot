import Link from "next/link";

export default function StatusPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-16">
      <header className="mb-16 flex items-center justify-between">
        <Link href="/" className="font-mono text-sm text-fg-muted hover:text-fg">
          ← flash-trade-bot
        </Link>
      </header>

      <section className="flex flex-1 flex-col justify-center">
        <h1 className="text-3xl font-semibold">Status</h1>
        <p className="mt-4 text-fg-muted">
          Live monitoring ships in Phase 6 of{" "}
          <a
            href="https://github.com/cryptoclassdev/flash-trade-bot/blob/main/DASHBOARD-PLAN.md"
            className="underline hover:text-fg"
            target="_blank"
            rel="noreferrer"
          >
            DASHBOARD-PLAN.md
          </a>
          . Come back soon.
        </p>
      </section>
    </main>
  );
}
