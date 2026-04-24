"use client";

import type { StatusResponse } from "shared";

export type BotClientError =
  | { kind: "cors"; message: string }
  | { kind: "unauthorized"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "network"; message: string }
  | { kind: "shape"; message: string };

export class BotClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | null,
  ) {}

  private headers(): HeadersInit {
    const h: Record<string, string> = { accept: "application/json" };
    if (this.token) h.authorization = `Bearer ${this.token}`;
    return h;
  }

  async status(): Promise<StatusResponse> {
    const res = await this.fetchJson(`${this.baseUrl}/status`);
    return res as StatusResponse;
  }

  async pause(): Promise<{ ok: boolean }> {
    return this.fetchJson(`${this.baseUrl}/pause`, { method: "POST" }) as Promise<{
      ok: boolean;
    }>;
  }

  async resume(): Promise<{ ok: boolean }> {
    return this.fetchJson(`${this.baseUrl}/resume`, {
      method: "POST",
    }) as Promise<{ ok: boolean }>;
  }

  async health(): Promise<{ status: string; wallet?: string; network?: string }> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw wrap("network", `health ${res.status}`);
    return res.json();
  }

  private async fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: this.headers(), mode: "cors" });
    } catch (e) {
      // fetch() only throws on network failure (or CORS preflight block).
      // When CORS blocks, the error message in most browsers is generic —
      // we surface it as `cors` because that's the most actionable hint.
      throw wrap(
        "cors",
        e instanceof Error
          ? `${e.message}. Your bot likely needs a redeploy to enable the dashboard CORS allowlist.`
          : "Could not reach the bot",
      );
    }
    if (res.status === 401) {
      throw wrap(
        "unauthorized",
        "Bot rejected the dashboard token. The DASHBOARD_TOKEN env var on Railway may not match what the dashboard stored. Re-run setup to rotate.",
      );
    }
    if (res.status === 404) {
      throw wrap(
        "not-found",
        "Endpoint not found on your bot. Redeploy from the latest template — the /status endpoint or /pause /resume routes are missing.",
      );
    }
    if (!res.ok) {
      throw wrap("network", `HTTP ${res.status} from bot`);
    }
    try {
      return await res.json();
    } catch {
      throw wrap("shape", "Bot returned non-JSON response");
    }
  }
}

function wrap(kind: BotClientError["kind"], message: string): BotClientError {
  const err = { kind, message } as BotClientError;
  (err as Error & BotClientError).message = message;
  return err;
}
