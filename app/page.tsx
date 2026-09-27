"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BRAND_NAME, BRAND_HOST, brandLink } from "@/lib/brand";

type Metadata = {
  title: string | null;
  description: string | null;
  siteName: string | null;
  hostname: string | null;
};

type Suggestion = {
  slug: string;
  available: boolean;
  source: "ai" | "smart";
};

type ClaimedLink = {
  slug: string;
  targetUrl: string;
  title: string | null;
  description: string | null;
};

type Step = "input" | "branding" | "done";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

function CopyButton({ text }: { text: string }) {
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
      className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:border-accent"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [customSlug, setCustomSlug] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);

  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<ClaimedLink | null>(null);

  // The real host this app runs on — localhost in dev, your domain in prod.
  const [host, setHost] = useState(BRAND_HOST);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(window.location.host);
  }, []);

  const fullLink = (slug: string) =>
    `${host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}/${slug}`;

  const analyze = useCallback(async () => {
    setUrlError(null);
    const raw = urlInput.trim();
    if (!raw) return setUrlError("Paste your deployed URL first.");
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(candidate);
      if (!u.hostname.includes(".")) throw new Error();
      setResolvedUrl(u.toString());
    } catch {
      return setUrlError("That doesn't look like a valid URL.");
    }

    setLoadingSuggest(true);
    try {
      const res = await fetch(`/api/metadata?url=${encodeURIComponent(candidate)}`);
      const data = (await res.json()) as Metadata & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't reach that site.");
      setMeta(data);
      setStep("branding");
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoadingSuggest(false);
    }
  }, [urlInput]);

  const getSuggestions = useCallback(async () => {
    if (!resolvedUrl) return;
    setLoadingSuggest(true);
    setSuggestions([]);
    setSelected(null);
    setClaimError(null);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: resolvedUrl, userDescription: description }),
      });
      const data = (await res.json()) as {
        suggestions?: Suggestion[];
        aiEnabled?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Suggestion engine failed.");
      setSuggestions(data.suggestions ?? []);
      setAiEnabled(data.aiEnabled ?? false);
      const firstAvailable = (data.suggestions ?? []).find((s) => s.available);
      setSelected(firstAvailable?.slug ?? null);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoadingSuggest(false);
    }
  }, [resolvedUrl, description]);

  // Auto-generate suggestions once the user describes their brand.
  useEffect(() => {
    if (step !== "branding") return;
    const t = setTimeout(() => {
      if (description.trim().length >= 12) void getSuggestions();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, step]);

  const activeSlug = customSlug.trim() || selected;

  const claim = useCallback(async () => {
    if (!resolvedUrl || !activeSlug) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: activeSlug, url: resolvedUrl }),
      });
      const data = (await res.json()) as { link?: ClaimedLink; error?: string };
      if (!res.ok || !data.link) {
        throw new Error(data.error ?? "Claim failed.");
      }
      setClaimed(data.link);
      setStep("done");
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Something went wrong.");
      // A taken slug invalidates the suggestion list's availability info.
      if (err instanceof Error && err.message.includes("taken")) {
        setSuggestions((prev) => prev.map((s) => (s.slug === activeSlug ? { ...s, available: false } : s)));
        setSelected(null);
        setCustomSlug("");
      }
    } finally {
      setClaiming(false);
    }
  }, [resolvedUrl, activeSlug]);

  return (
    <main className="flex flex-1 flex-col items-center px-6 pb-20 pt-16 sm:pt-24">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center">
          <p className="font-mono text-sm text-accent">{BRAND_NAME.toLowerCase()}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Your deploy URL is ugly.
            <br />
            <span className="text-neutral-400">Your link shouldn&apos;t be.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-neutral-400">
            Paste your deployed URL, tell us what your brand is about, and get a clean
            branded link like{" "}
            <span className="font-mono text-neutral-200">{brandLink("your-brand")}</span> that
            takes visitors straight to your site.
          </p>
        </div>

        {/* Step 1 — URL input */}
        {step === "input" && (
          <section className="mt-10 animate-fade-up">
            <div className="rounded-2xl border border-border bg-card p-6">
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Your deployed URL
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void analyze()}
                  placeholder="my-app-8f3k2.vercel.app"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm outline-none transition placeholder:text-neutral-600 focus:border-accent"
                  autoFocus
                />
                <button
                  onClick={() => void analyze()}
                  disabled={loadingSuggest}
                  className="shrink-0 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {loadingSuggest ? "Reading site…" : "Beautify →"}
                </button>
              </div>
              {urlError && <p className="mt-3 text-sm text-red-400">{urlError}</p>}
              <p className="mt-3 text-xs text-neutral-600">
                Works with Vercel, Netlify, Render, Railway, GitHub Pages — any public URL.
              </p>
            </div>
          </section>
        )}

        {/* Step 2 — branding + suggestions */}
        {step === "branding" && meta && (
          <section className="mt-10 animate-fade-up">
            {/* Site card */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Site detected</p>
                  <h2 className="mt-1 truncate text-lg font-semibold">
                    {meta.title ?? meta.hostname ?? resolvedUrl}
                  </h2>
                  {meta.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{meta.description}</p>
                  )}
                </div>
                <button
                  onClick={() => { setStep("input"); setMeta(null); setDescription(""); setSuggestions([]); }}
                  className="shrink-0 text-xs text-neutral-500 underline transition hover:text-neutral-300"
                >
                  change
                </button>
              </div>
            </div>

            {/* Brand description */}
            <div className="mt-4 rounded-2xl border border-border bg-card p-5">
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                What is your brand about?
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={400}
                placeholder="e.g. A coffee subscription startup delivering single-origin beans from Ethiopian roasters every month"
                className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-accent"
                autoFocus
              />
              <p className="mt-1 text-right text-xs text-neutral-600">{description.length}/400</p>
            </div>

            {/* Suggestions */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Suggested links
                </p>
                {!aiEnabled && !loadingSuggest && (
                  <span className="text-xs text-neutral-600">smart suggestions · add NVIDIA_API_KEY for AI</span>
                )}
              </div>

              {loadingSuggest && (
                <div className="mt-3 space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-12 animate-shimmer rounded-xl" />
                  ))}
                </div>
              )}

              {!loadingSuggest && suggestions.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {suggestions.map((s) => {
                    const isSel = customSlug ? false : selected === s.slug;
                    return (
                      <button
                        key={s.slug}
                        disabled={!s.available}
                        onClick={() => { setSelected(s.slug); setCustomSlug(""); }}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          isSel
                            ? "border-accent bg-accent/10"
                            : s.available
                              ? "border-border bg-card hover:border-neutral-600"
                              : "border-border/50 bg-card/40 opacity-50"
                        }`}
                      >
                        <span className="min-w-0 truncate font-mono text-sm">
                          {host}/<span className="font-semibold">{s.slug}</span>
                        </span>
                        <span className="ml-3 flex shrink-0 items-center gap-2">
                          {s.source === "ai" && (
                            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                              AI
                            </span>
                          )}
                          <span className={`text-xs ${s.available ? "text-neutral-500" : "text-red-400/80"}`}>
                            {s.available ? (isSel ? "selected" : "available") : "taken"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Custom slug */}
              <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3">
                <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Or type your own
                </label>
                <div className="mt-1 flex items-center gap-1 font-mono text-sm">
                  <span className="text-neutral-500">{host}/</span>
                  <input
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="your-brand"
                    className="w-full bg-transparent font-semibold outline-none placeholder:text-neutral-600"
                    maxLength={50}
                  />
                  {customSlug.length > 0 && (
                    <span className={`shrink-0 text-xs ${SLUG_RE.test(customSlug) ? "text-emerald-400" : "text-red-400"}`}>
                      {SLUG_RE.test(customSlug) ? "ok" : "invalid"}
                    </span>
                  )}
                </div>
              </div>

              {claimError && <p className="mt-3 text-sm text-red-400">{claimError}</p>}

              <button
                onClick={() => void claim()}
                disabled={claiming || !activeSlug || (!!customSlug && !SLUG_RE.test(customSlug))}
                className="mt-5 w-full rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {claiming
                  ? "Claiming…"
                  : activeSlug
                    ? `Claim ${host}/${activeSlug} →`
                    : "Pick or type a link first"}
              </button>
            </div>
          </section>
        )}

        {/* Step 3 — success */}
        {step === "done" && claimed && (
          <section className="mt-10 animate-fade-up">
            <div className="rounded-2xl border border-emerald-500/30 bg-card p-6 text-center">
              <p className="text-3xl">🎉</p>
              <h2 className="mt-2 text-2xl font-semibold">Your branded link is live</h2>

              <div className="mx-auto mt-5 flex max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
                <span className="truncate font-mono text-sm font-semibold">
                  {host}/{claimed.slug}
                </span>
                <CopyButton text={fullLink(claimed.slug)} />
              </div>

              {/* Mock link-preview card — what people see when the link is shared */}
              <div className="mx-auto mt-5 max-w-md overflow-hidden rounded-xl border border-border bg-background text-left">
                <div className="flex h-24 items-center justify-center bg-gradient-to-br from-accent/30 to-background">
                  <span className="font-mono text-xs text-neutral-400">link preview</span>
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-semibold">
                    {claimed.title ?? brandLink(claimed.slug)}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-neutral-400">
                    {claimed.description ?? claimed.targetUrl}
                  </p>
                  <p className="mt-2 font-mono text-[10px] uppercase text-neutral-600">
                    {host}/{claimed.slug}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-1 text-sm text-neutral-400">
                <p>
                  Point people at <span className="font-mono text-neutral-200">{host}/{claimed.slug}</span> —
                  they&apos;ll land on your real site.
                </p>
                <p className="text-xs text-neutral-600">
                  Perfect for resumes, bios, pitch decks and DMs where{" "}
                  <span className="font-mono">{claimed.targetUrl.replace(/^https?:\/\//, "")}</span> would look messy.
                </p>
              </div>

              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <a
                  href={fullLink(claimed.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Test it live ↗
                </a>
                <button
                  onClick={() => {
                    setStep("input");
                    setUrlInput("");
                    setMeta(null);
                    setDescription("");
                    setSuggestions([]);
                    setSelected(null);
                    setCustomSlug("");
                    setClaimed(null);
                  }}
                  className="rounded-xl border border-border px-6 py-2.5 text-sm font-medium transition hover:border-neutral-500"
                >
                  Make another
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-16 border-t border-border pt-6 text-center text-xs text-neutral-600">
          <p>
            Links redirect visitors to your real deployment ·{" "}
            <Link href="/" className="underline hover:text-neutral-400">
              {BRAND_NAME.toLowerCase()}
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
