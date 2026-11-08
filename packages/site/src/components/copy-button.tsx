"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

type CopyButtonProps = {
  text: string;
  /** Accessible name for the button. */
  label?: string;
};

/** Copies `text` to the clipboard and confirms for two seconds. */
export function CopyButton({ text, label = "Copy to clipboard" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-sans text-xs font-medium text-mist ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.08] hover:text-paper"
    >
      {copied ? (
        <Check className="size-3.5 text-accent" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
