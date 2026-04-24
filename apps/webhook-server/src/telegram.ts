import axios from "axios";
import { AppConfig } from "./config";

let cfg: AppConfig | null = null;

export function initTelegram(c: AppConfig): void {
  cfg = c;
}

async function send(text: string): Promise<void> {
  if (!cfg) throw new Error("telegram not initialized");
  const url = `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`;
  try {
    await axios.post(
      url,
      { chat_id: cfg.telegramChatId, text, parse_mode: "HTML", disable_web_page_preview: true },
      { timeout: 5000 }
    );
  } catch (e: any) {
    console.error("[telegram] send failed:", e?.response?.status, e?.response?.data || e?.message);
  }
}

export function shortSig(sig: string): string {
  if (!sig) return "";
  return sig.length <= 12 ? sig : `${sig.slice(0, 6)}…${sig.slice(-6)}`;
}

export const tg = {
  signalReceived: (action: string, ticker: string, id: string) =>
    send(`📥 Signal received: ${action} ${ticker} (id: ${id})`),

  attempting: (side: string, sizeUsd: number, ticker: string, price: number) =>
    send(`⏳ Sending: ${side} $${sizeUsd} ${ticker} @ ~${price}`),

  filled: (side: string, sizeUsd: number, ticker: string, actualPrice: number | undefined, sig: string) =>
    send(
      `✅ Filled: ${side} $${sizeUsd} ${ticker}` +
      (actualPrice !== undefined ? ` @ ${actualPrice}` : "") +
      `, tx: ${shortSig(sig)}`
    ),

  failed: (n: number, error: string) =>
    send(`❌ FAILED after ${n} attempts: ${error}. Manual intervention may be needed.`),

  halt: (reason: string) => send(`🛑 Bot halted: ${reason}`),

  custom: (text: string) => send(text),
};
