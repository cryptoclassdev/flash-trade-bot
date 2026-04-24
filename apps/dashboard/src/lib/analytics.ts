"use client";

import { track as vercelTrack } from "@vercel/analytics";

/**
 * Funnel events defined in DASHBOARD-PLAN.md §8.
 * Keep in lockstep — adding a new event requires a plan entry.
 */
export type EventName =
  // setup funnel
  | "dashboard.landed"
  | "setup.started"
  | "setup.wallet.generated"
  | "setup.wallet.pasted"
  | "setup.funded"
  | "setup.rpc.validated"
  | "setup.telegram.validated"
  | "setup.strategy.configured"
  | "setup.deploy.clicked"
  | "setup.bot.verified"
  | "setup.tradingview.confirmed"
  | "setup.completed"
  | "status.visited"
  | "status.pause.clicked"
  | "status.resume.clicked"
  // errors
  | "error.wallet.invalid_key"
  | "error.rpc.test_failed"
  | "error.telegram.no_updates"
  | "error.railway.health_fail"
  | "error.status.poll_fail";

type EventProps = Record<string, string | number | boolean | null>;

/**
 * Emit an anonymous funnel event. Safe in SSR (no-op when window is undefined).
 * Never pass anything identifying — telemetry is aggregate only.
 */
export function track(name: EventName, props?: EventProps): void {
  try {
    if (typeof window === "undefined") return;
    vercelTrack(name, props);
  } catch {
    // Telemetry must never crash user flow.
  }
}
