"use client";

/**
 * Typed localStorage for wizard state.
 *
 * Design decisions:
 * - PRIVATE KEYS ARE NEVER STORED. They're shown once on Screen 1 and discarded.
 * - Everything stored here is either public (pubkey), user-controlled infra
 *   (Helius URL, Telegram token), or derived secrets that the user will paste
 *   into Railway anyway (WEBHOOK_SECRET, DASHBOARD_TOKEN).
 * - If a user leaks localStorage, the worst case is someone can poll their
 *   bot's /status. Funds stay safe.
 */

import type { StrategyConfig } from "shared";

export interface WizardState {
  walletPubkey?: string;
  walletFunded?: boolean;

  rpcUrl?: string;
  rpcUrlFallback?: string;

  telegramBotToken?: string;
  telegramChatId?: string;
  telegramVerified?: boolean;

  strategy?: StrategyConfig;

  webhookSecret?: string;
  dashboardToken?: string;

  railwayUrl?: string;
  botHealthVerified?: boolean;

  tradingviewConfirmed?: boolean;

  completedAt?: number;
}

const KEY = "flash-trade-bot.wizard";

export function readWizardState(): WizardState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as WizardState;
  } catch {
    return {};
  }
}

export function writeWizardState(patch: Partial<WizardState>): WizardState {
  const current = readWizardState();
  const next = { ...current, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota exceeded. Caller should surface a warning.
  }
  return next;
}

export function clearWizardState(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
