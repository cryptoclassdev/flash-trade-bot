"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WizardLayout } from "@/components/WizardLayout";
import { readWizardState, writeWizardState } from "@/lib/storage";
import {
  fetchBotInfo,
  fetchLatestChatId,
  sendTestMessage,
  validateTokenShape,
} from "@/lib/telegram";
import { track } from "@/lib/analytics";

export default function TelegramPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState<number | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "fetching" | "ready" | "sending" | "verified" | "fail"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const s = readWizardState();
    if (!s.walletPubkey) router.replace("/setup/wallet");
    if (s.telegramBotToken) setToken(s.telegramBotToken);
    if (s.telegramChatId) setChatId(Number(s.telegramChatId));
  }, [router]);

  async function onFetchChatId() {
    const trimmed = token.trim();
    setMessage(null);
    if (!validateTokenShape(trimmed)) {
      setStatus("fail");
      setMessage(
        "That doesn't look like a Telegram bot token. Format: <digits>:<alphanumeric>",
      );
      return;
    }
    setStatus("fetching");
    try {
      const info = await fetchBotInfo(trimmed);
      setBotUsername(info.username);
      const id = await fetchLatestChatId(trimmed);
      setChatId(id);
      setStatus("ready");
    } catch (e) {
      setStatus("fail");
      const msg = e instanceof Error ? e.message : "Telegram API error";
      setMessage(msg);
      if (msg.toLowerCase().includes("no messages")) {
        track("error.telegram.no_updates");
      }
    }
  }

  async function onSendTest() {
    if (!chatId || !token) return;
    setStatus("sending");
    setMessage(null);
    try {
      await sendTestMessage(token.trim(), chatId);
      setStatus("verified");
      setMessage(
        "Test message sent. Check Telegram — you should see it within a second.",
      );
      track("setup.telegram.validated");
    } catch (e) {
      setStatus("fail");
      setMessage(e instanceof Error ? e.message : "Send failed");
    }
  }

  function onContinue() {
    if (status !== "verified" || !chatId) return;
    writeWizardState({
      telegramBotToken: token.trim(),
      telegramChatId: String(chatId),
      telegramVerified: true,
    });
    router.push("/setup/strategy");
  }

  return (
    <WizardLayout step={4} title="Connect a Telegram bot">
      <p className="mb-6 text-fg-muted">
        The trading bot uses Telegram for trade alerts and error notifications.
      </p>

      <ol className="mb-6 space-y-2 text-sm text-fg-muted">
        <li>
          1. Open{" "}
          <a
            className="underline hover:text-fg"
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
          >
            @BotFather
          </a>{" "}
          on Telegram.
        </li>
        <li>
          2. Send <code className="font-mono">/newbot</code>, pick a name,
          paste the <em>HTTP API token</em> below.
        </li>
        <li>
          3. Start a chat with your new bot and send it any message (e.g.
          &quot;hi&quot;).
        </li>
      </ol>

      <label className="text-xs uppercase tracking-wide text-fg-subtle">
        Bot HTTP API token
      </label>
      <input
        type="text"
        value={token}
        onChange={(e) => {
          setToken(e.target.value);
          setStatus("idle");
          setChatId(null);
          setBotUsername(null);
        }}
        placeholder="1234567890:AAH..."
        className="mt-2 w-full rounded-md border border-border bg-bg-raised px-3 py-2.5 font-mono text-sm focus:border-border-strong focus:outline-none"
      />

      <button
        type="button"
        onClick={onFetchChatId}
        disabled={!token.trim() || status === "fetching"}
        className="mt-4 rounded-md border border-border bg-bg-raised px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40"
      >
        {status === "fetching"
          ? "Looking up your chat..."
          : "Fetch my chat ID"}
      </button>

      {chatId && botUsername && (
        <div className="mt-6 rounded-lg border border-border bg-bg-raised p-4">
          <div className="text-xs uppercase tracking-wide text-fg-subtle">
            Bot + chat found
          </div>
          <div className="mt-2 space-y-1 font-mono text-sm">
            <div>
              @{botUsername}
            </div>
            <div className="text-fg-muted">chat_id = {chatId}</div>
          </div>
          <button
            type="button"
            onClick={onSendTest}
            disabled={status === "sending"}
            className="mt-4 rounded-md border border-border bg-bg px-4 py-2 text-sm text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40"
          >
            {status === "sending" ? "Sending..." : "Send test message"}
          </button>
        </div>
      )}

      {status === "verified" && message && (
        <div className="mt-4 rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
          ✓ {message}
        </div>
      )}

      {status === "fail" && message && (
        <div className="mt-4 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {message}
        </div>
      )}

      <div className="mt-10 flex gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={status !== "verified"}
          className="rounded-md bg-accent px-6 py-2.5 font-medium text-black transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue →
        </button>
        <button
          type="button"
          onClick={() => router.push("/setup/rpc")}
          className="rounded-md border border-border px-4 py-2.5 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
        >
          ← Back
        </button>
      </div>
    </WizardLayout>
  );
}
