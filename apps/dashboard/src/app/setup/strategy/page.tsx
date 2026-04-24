"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WizardLayout } from "@/components/WizardLayout";
import { readWizardState, writeWizardState } from "@/lib/storage";
import { STRATEGY_DEFAULTS, type StrategyConfig } from "shared";
import { track } from "@/lib/analytics";

export default function StrategyPage() {
  const router = useRouter();
  const [config, setConfig] = useState<StrategyConfig>(STRATEGY_DEFAULTS);

  useEffect(() => {
    const s = readWizardState();
    if (!s.walletPubkey) router.replace("/setup/wallet");
    if (s.strategy) setConfig(s.strategy);
  }, [router]);

  function update<K extends keyof StrategyConfig>(
    key: K,
    value: StrategyConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onContinue() {
    track("setup.strategy.configured", {
      leverage: config.LEVERAGE,
      collateralUsdc: config.COLLATERAL_USDC,
    });
    writeWizardState({ strategy: config });
    router.push("/setup/deploy");
  }

  const notional = config.COLLATERAL_USDC * config.LEVERAGE;

  return (
    <WizardLayout step={5} title="Set your strategy parameters">
      <p className="mb-6 text-fg-muted">
        These control how much the bot risks per signal. You can change them
        later by editing env vars in Railway.
      </p>

      <div className="space-y-6 rounded-lg border border-border bg-bg-raised p-5">
        <Field label="Strategy">
          <div className="rounded-md border border-border bg-bg px-3 py-2 text-sm">
            RSI Divergence · BTC · 5m
          </div>
          <p className="mt-1 text-xs text-fg-subtle">
            Only one strategy for v1. More coming once the dashboard validates.
          </p>
        </Field>

        <Slider
          label="Collateral per trade (USDC)"
          min={10}
          max={500}
          step={5}
          value={config.COLLATERAL_USDC}
          onChange={(v) => update("COLLATERAL_USDC", v)}
        />

        <Slider
          label="Leverage"
          min={1}
          max={10}
          step={1}
          value={config.LEVERAGE}
          onChange={(v) => update("LEVERAGE", v)}
        />

        <Slider
          label="Max daily loss (USDC)"
          min={5}
          max={100}
          step={1}
          value={config.MAX_DAILY_LOSS_USDC}
          onChange={(v) => update("MAX_DAILY_LOSS_USDC", v)}
        />
      </div>

      <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm">
        <div className="font-medium text-accent">Summary</div>
        <div className="mt-2 text-fg">
          You&apos;ll trade{" "}
          <span className="font-mono">
            ~${notional.toFixed(0)}
          </span>{" "}
          notional per signal (collateral × leverage). The bot halts
          automatically if today&apos;s realized loss hits{" "}
          <span className="font-mono">${config.MAX_DAILY_LOSS_USDC}</span>.
          Halt auto-clears at UTC midnight.
        </div>
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer text-xs text-fg-subtle hover:text-fg-muted">
          Advanced — slippage
        </summary>
        <div className="mt-3 space-y-4 rounded-md border border-border bg-bg-raised p-4">
          <Slider
            label="Entry slippage (basis points)"
            min={25}
            max={500}
            step={25}
            value={config.SLIPPAGE_ENTRY_BPS}
            onChange={(v) => update("SLIPPAGE_ENTRY_BPS", v)}
          />
          <Slider
            label="Exit slippage (basis points)"
            min={25}
            max={500}
            step={25}
            value={config.SLIPPAGE_EXIT_BPS}
            onChange={(v) => update("SLIPPAGE_EXIT_BPS", v)}
          />
        </div>
      </details>

      <div className="mt-10 flex gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md bg-accent px-6 py-2.5 font-medium text-black transition hover:bg-accent-hover"
        >
          Continue →
        </button>
        <button
          type="button"
          onClick={() => router.push("/setup/telegram")}
          className="rounded-md border border-border px-4 py-2.5 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
        >
          ← Back
        </button>
      </div>
    </WizardLayout>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      {children}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs uppercase tracking-wide text-fg-subtle">
          {label}
        </label>
        <span className="font-mono text-sm text-accent">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
      <div className="mt-1 flex justify-between text-xs text-fg-subtle">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
