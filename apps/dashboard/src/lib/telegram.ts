"use client";

/**
 * Minimal Telegram Bot API client used by Screen 4 to validate a user's
 * token and auto-fetch their chat ID after they message their new bot.
 *
 * All calls happen client-side. The user's bot token stays in the browser
 * (and eventually in Railway env vars). We never proxy it.
 */

interface TgUpdateChat {
  id: number;
  type: string;
  first_name?: string;
  username?: string;
}

interface TgUpdate {
  update_id: number;
  message?: {
    chat: TgUpdateChat;
    text?: string;
  };
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

const TG_TOKEN_RE = /^\d{8,12}:[A-Za-z0-9_-]{30,}$/;

export function validateTokenShape(token: string): boolean {
  return TG_TOKEN_RE.test(token.trim());
}

export async function fetchBotInfo(
  token: string,
): Promise<{ username: string; first_name: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const json = (await res.json()) as TgResponse<{
    username: string;
    first_name: string;
  }>;
  if (!json.ok || !json.result) {
    throw new Error(
      json.description ||
        "Telegram rejected this token. Check it with BotFather's /token command.",
    );
  }
  return json.result;
}

/**
 * Pull the latest update and return the chat id from the most recent message.
 * User must have sent at least one message to their bot for this to work.
 */
export async function fetchLatestChatId(token: string): Promise<number> {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?limit=5&offset=-5`,
  );
  const json = (await res.json()) as TgResponse<TgUpdate[]>;
  if (!json.ok) {
    throw new Error(
      json.description ||
        "Telegram API error. Re-check your token.",
    );
  }
  const updates = json.result || [];
  const withChat = updates.filter((u) => u.message?.chat?.id);
  if (withChat.length === 0) {
    throw new Error(
      "No messages found. Open Telegram, find your bot, send it any message (like 'hi'), then click 'Fetch chat ID' again.",
    );
  }
  const latest = withChat[withChat.length - 1];
  return latest.message!.chat.id;
}

export async function sendTestMessage(
  token: string,
  chatId: number,
): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "✅ flash-trade-bot dashboard: Telegram connection verified. Trade alerts will land in this chat.",
      }),
    },
  );
  const json = (await res.json()) as TgResponse<unknown>;
  if (!json.ok) {
    throw new Error(
      json.description || "Failed to send test message.",
    );
  }
}
