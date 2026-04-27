"use client";

import { generatePineFile } from "shared/pine-gen";

export interface StrategyEntry {
  id: string;
  name: string;
  description: string;
  asset: string;
  timeframe: string;
  longShort: "long" | "short" | "both";
  file: string;
  tags?: string[];
}

export async function fetchStrategies(): Promise<StrategyEntry[]> {
  const res = await fetch("/api/strategies");
  if (!res.ok) throw new Error(`Bot returned HTTP ${res.status}`);
  const json = (await res.json()) as StrategyEntry[];
  if (!Array.isArray(json)) throw new Error("Unexpected registry shape");
  return json;
}

export async function downloadStrategyPine(
  strategyId: string,
  webhookSecret: string,
): Promise<void> {
  const res = await fetch(`/pine-source?strategy=${encodeURIComponent(strategyId)}`);
  if (!res.ok) throw new Error(`Bot returned HTTP ${res.status} for ${strategyId}`);
  const source = await res.text();
  const generated = generatePineFile({ webhookSecret, pineSource: source });
  const blob = new Blob([generated], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flash-trade-bot-${strategyId}.pine`;
  a.click();
  URL.revokeObjectURL(url);
}
