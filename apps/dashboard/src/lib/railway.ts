"use client";

import type { BotEnv } from "shared";

/**
 * Railway template deploy URL builder.
 *
 * Railway accepts a template URL with env values pre-filled via query params.
 * Format: https://railway.com/new/template?template=<repo-url>&envs=<KEY1,KEY2,...>&<KEY1>=<val>&<KEY2>=<val>...
 *
 * The GitHub repo itself is identified via `template`. Env values go on each key.
 */

const TEMPLATE_REPO_URL = "https://github.com/cryptoclassdev/flash-trade-bot";

export function buildRailwayDeployUrl(env: Partial<BotEnv>): string {
  const base = new URL("https://railway.com/new/template");
  base.searchParams.set("template", TEMPLATE_REPO_URL);

  const envKeys = Object.keys(env).filter((k) => env[k as keyof BotEnv] !== undefined);
  base.searchParams.set("envs", envKeys.join(","));

  for (const k of envKeys) {
    const v = env[k as keyof BotEnv];
    if (v === undefined) continue;
    base.searchParams.set(k, String(v));
  }

  return base.toString();
}

/**
 * Generate a cryptographically random hex string for use as WEBHOOK_SECRET
 * or DASHBOARD_TOKEN. 32 bytes → 64 hex chars, matching `openssl rand -hex 32`.
 */
export function generateHexSecret(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
