"use client";

import { useEffect, useState } from "react";

/**
 * Client-side instant redirect for humans. Bots/scrapers never execute JS, so
 * they index the branded OG tags rendered by the server instead — that's the
 * "first look" the product is about.
 */
export default function AutoRedirect({
  target,
  title,
}: {
  target: string;
  title: string;
}) {
  const [left, setLeft] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLeft(true);
      window.location.replace(target);
    }, 600);
    return () => clearTimeout(timer);
  }, [target]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-md animate-fade-up rounded-lg border border-line bg-card p-8">
        <div className="mx-auto mb-6 h-7 w-7 animate-spin rounded-full border border-line border-t-foreground" />
        {!left ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              Redirecting
            </p>
            <p className="mt-3 text-lg font-medium tracking-tight">{title}</p>
            <p className="mt-4 break-all font-mono text-xs text-faint">{target}</p>
          </>
        ) : (
          <p className="text-sm text-muted">
            If nothing happens,{" "}
            <a href={target} className="text-foreground underline underline-offset-4">
              continue here
            </a>
            .
          </p>
        )}
      </div>
    </main>
  );
}
