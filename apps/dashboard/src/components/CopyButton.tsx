"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className={`rounded border border-border bg-bg-raised px-3 py-1.5 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
