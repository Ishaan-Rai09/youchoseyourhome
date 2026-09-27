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
      <div className="w-full max-w-md animate-fade-up rounded-2xl border border-border bg-card p-8">
        <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent" />
        {!left ? (
          <>
            <p className="text-sm text-neutral-400">Taking you to</p>
            <p className="mt-1 text-lg font-semibold">{title}</p>
            <p className="mt-4 break-all font-mono text-xs text-neutral-500">
              {target}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-400">
            Redirecting… if nothing happens,{" "}
            <a href={target} className="text-accent underline">
              click here
            </a>
            .
          </p>
        )}
      </div>
    </main>
  );
}
