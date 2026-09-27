"use client";

import { useState } from "react";

/** Tiny copy button for server-rendered pages (bio page footer, etc.). */
export default function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="font-mono text-[11px] text-faint underline underline-offset-4 transition hover:text-foreground"
    >
      {copied ? "copied ✓" : "copy link"}
    </button>
  );
}
