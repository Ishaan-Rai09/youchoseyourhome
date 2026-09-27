"use client";

import { useCallback, useEffect, useState } from "react";
import Reveal from "@/components/reveal";
import QrCode from "@/components/qr-code";
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

/** Manage tokens for links claimed on this device (control room access). */
type StoredLink = { slug: string; token: string; at: number };
const STORE_KEY = "glowup_links";

function addToken(slug: string, token: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as StoredLink[]).filter(
      (l) => l.slug !== slug,
    );
    list.unshift({ slug, token, at: Date.now() });
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage unavailable */
  }
}

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
      className="shrink-0 rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-muted transition hover:border-line-strong hover:text-foreground"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
      {children}
    </p>
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
  const [manageToken, setManageToken] = useState<string | null>(null);

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
      const data = (await res.json()) as {
        link?: ClaimedLink;
        manageToken?: string;
        error?: string;
      };
      if (!res.ok || !data.link) {
        throw new Error(data.error ?? "Claim failed.");
      }
      if (data.manageToken) {
        addToken(data.link.slug, data.manageToken);
        setManageToken(data.manageToken);
      }
      setClaimed(data.link);
      setStep("done");
      requestAnimationFrame(() =>
        document.getElementById("tool")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Something went wrong.");
      // A taken slug invalidates the suggestion list's availability info.
      if (err instanceof Error && err.message.includes("taken")) {
        setSuggestions((prev) =>
          prev.map((s) => (s.slug === activeSlug ? { ...s, available: false } : s)),
        );
        setSelected(null);
        setCustomSlug("");
      }
    }
  }, [resolvedUrl, activeSlug]);

  const reset = () => {
    setStep("input");
    setUrlInput("");
    setMeta(null);
    setDescription("");
    setSuggestions([]);
    setSelected(null);
    setCustomSlug("");
    setClaimed(null);
    setManageToken(null);
  };

  const scrollToTool = () =>
    document.getElementById("tool")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 sm:px-10">
      {/* Nav */}
      <header className="flex items-center justify-between py-5">
        <p className="font-mono text-[13px] font-medium uppercase tracking-[0.22em]">
          {BRAND_NAME}
        </p>
        <a
          href="https://github.com/Ishaan-Rai09/youchoseyourhome"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] text-faint transition hover:text-foreground"
        >
          github ↗
        </a>
      </header>

      {/* Hero — two columns on desktop */}
      <section className="grid items-center gap-10 pb-16 pt-12 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <div>
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
              For people who ship
            </p>
          </Reveal>
          <Reveal delay={90}>
            <h1 className="mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[64px]">
              Your project deserves
              <br />
              <span className="text-muted">a better address.</span>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
              You deployed the thing. The URL is a random string of garbage. Paste
              it here, pick a name you&apos;re proud of, and share a link that
              looks like you planned it all along.
            </p>
          </Reveal>
          <Reveal delay={260}>
            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={scrollToTool}
                className="rounded-md bg-foreground px-6 py-2.5 text-[13px] font-semibold text-background transition hover:opacity-85"
              >
                Glow up a link
              </button>
              <a
                href="#how"
                className="rounded-md border border-line px-6 py-2.5 text-[13px] font-medium text-muted transition hover:border-line-strong hover:text-foreground"
              >
                How it works
              </a>
            </div>
          </Reveal>
        </div>

        {/* Hero visual — before/after with a moving dash */}
        <Reveal delay={340} className="hidden lg:block">
          <div className="rounded-lg border border-line bg-card/80 p-5">
            <div className="flex items-center justify-between">
              <Label>Live transform</Label>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-line bg-background px-3.5 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                  Before
                </p>
                <p className="mt-1 truncate font-mono text-[12px] text-muted line-through decoration-err/60">
                  beamdrop-6ym9.onrender.com
                </p>
              </div>
              <div className="flex justify-center" aria-hidden>
                <span className="font-mono text-[13px] text-faint">↓</span>
              </div>
              <div className="rounded-md border border-line-strong bg-background px-3.5 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ok">
                  After
                </p>
                <p className="mt-1 truncate font-mono text-[12px] font-semibold">
                  {brandLink("beamdrop")}
                </p>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-faint">
              Same destination. Different first impression.
            </p>
          </div>
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
            move your cursor — the grid follows
          </p>
        </Reveal>
      </section>

      {/* ————— The tool ————— */}
      <section id="tool" className="scroll-mt-6 border-t border-line pt-10">
        <Reveal>
          {step === "input" && (
            <div className="animate-fade-up">
              <div className="mb-4 flex items-baseline justify-between">
                <Label>Step 1 — Paste your deployed URL</Label>
              </div>
              <div className="mx-auto max-w-3xl rounded-lg border border-line bg-card">
                <div className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void analyze()}
                      placeholder="beamdrop-6ym9.onrender.com"
                      className="w-full rounded-md border border-line bg-background px-3.5 py-2.5 font-mono text-[13px] outline-none transition placeholder:text-faint focus:border-line-strong"
                      autoFocus
                    />
                    <button
                      onClick={() => void analyze()}
                      disabled={loadingSuggest}
                      className="shrink-0 rounded-md bg-foreground px-5 py-2.5 text-[13px] font-semibold text-background transition hover:opacity-85 disabled:opacity-40"
                    >
                      {loadingSuggest ? "Reading…" : "Continue"}
                    </button>
                  </div>
                  {urlError ? (
                    <p className="mt-3 text-[13px] text-err">{urlError}</p>
                  ) : (
                    <p className="mt-3 text-xs text-faint">
                      Works with Render, Vercel, Netlify, GitHub Pages — any public URL.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === "branding" && meta && (
            <div className="animate-fade-up">
              <div className="mb-4 flex items-baseline justify-between">
                <Label>Step 2 — Say what it is, pick a name</Label>
                <button
                  onClick={() => {
                    setStep("input");
                    setMeta(null);
                    setDescription("");
                    setSuggestions([]);
                  }}
                  className="font-mono text-[11px] text-faint transition hover:text-foreground"
                >
                  ← start over
                </button>
              </div>

              <div className="mx-auto max-w-3xl rounded-lg border border-line bg-card">
                {/* Detected site */}
                <div className="border-b border-line px-5 py-3.5">
                  <Label>Detected</Label>
                  <h2 className="mt-1.5 truncate text-[15px] font-medium tracking-tight">
                    {meta.title ?? meta.hostname ?? resolvedUrl}
                  </h2>
                  {meta.description && (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
                      {meta.description}
                    </p>
                  )}
                </div>

                {/* Brand description */}
                <div className="border-b border-line px-5 py-4">
                  <Label>What is it about?</Label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={400}
                    placeholder="A coffee subscription delivering single-origin beans from Ethiopian roasters every month"
                    className="mt-2.5 w-full resize-none rounded-md border border-line bg-background px-3.5 py-2.5 text-[13px] leading-relaxed outline-none transition placeholder:text-faint focus:border-line-strong"
                    autoFocus
                  />
                  <p className="mt-1.5 text-right font-mono text-[10px] text-faint">
                    {description.length}/400
                  </p>
                </div>

                {/* Suggestions */}
                <div className="px-5 py-4">
                  <div className="flex items-baseline justify-between">
                    <Label>Pick a name</Label>
                    {!aiEnabled && !loadingSuggest && (
                      <span className="font-mono text-[10px] text-faint">
                        smart match — add NVIDIA_API_KEY for AI
                      </span>
                    )}
                  </div>

                  {loadingSuggest && (
                    <div className="mt-3 divide-y divide-line rounded-lg border border-line bg-background">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                          <div className="h-3.5 w-2/5 animate-pulse rounded bg-line-strong/60" />
                          <div className="ml-auto h-3 w-14 animate-pulse rounded bg-line-strong/40" />
                        </div>
                      ))}
                    </div>
                  )}

                  {!loadingSuggest && suggestions.length > 0 && (
                    <div className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-background">
                      {suggestions.map((s, i) => {
                        const isSel = !customSlug && selected === s.slug;
                        return (
                          <button
                            key={s.slug}
                            disabled={!s.available}
                            onClick={() => {
                              setSelected(s.slug);
                              setCustomSlug("");
                            }}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition ${
                              isSel
                                ? "bg-foreground/[0.06]"
                                : s.available
                                  ? "hover:bg-foreground/[0.03]"
                                  : "opacity-40"
                            }`}
                            style={{ animation: `fade-up 0.4s cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both` }}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <span
                                className={`grid h-4 w-4 shrink-0 place-items-center rounded-sm border ${
                                  isSel ? "border-foreground bg-foreground" : "border-line-strong"
                                }`}
                              >
                                {isSel && (
                                  <span className="text-[9px] font-bold leading-none text-background">
                                    ✓
                                  </span>
                                )}
                              </span>
                              <span className="truncate font-mono text-[13px]">
                                {host}/
                                <span className="font-semibold text-foreground">{s.slug}</span>
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2.5">
                              {s.source === "ai" && (
                                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-muted">
                                  AI
                                </span>
                              )}
                              <span
                                className={`font-mono text-[11px] ${
                                  s.available ? (isSel ? "text-foreground" : "text-faint") : "text-err"
                                }`}
                              >
                                {s.available ? (isSel ? "selected" : "open") : "taken"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Custom slug */}
                  <div className="mt-4 rounded-lg border border-line bg-background px-4 py-3.5">
                    <Label>Or type your own</Label>
                    <div className="mt-1.5 flex items-center gap-1 font-mono text-[13px]">
                      <span className="text-faint">{host}/</span>
                      <input
                        value={customSlug}
                        onChange={(e) =>
                          setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                        }
                        placeholder="your-name"
                        className="w-full bg-transparent font-semibold outline-none placeholder:text-faint"
                        maxLength={50}
                      />
                      {customSlug.length > 0 && (
                        <span
                          className={`shrink-0 font-mono text-[11px] ${
                            SLUG_RE.test(customSlug) ? "text-ok" : "text-err"
                          }`}
                        >
                          {SLUG_RE.test(customSlug) ? "ok" : "invalid"}
                        </span>
                      )}
                    </div>
                  </div>

                  {claimError && <p className="mt-3 text-[13px] text-err">{claimError}</p>}

                  <button
                    onClick={() => void claim()}
                    disabled={claiming || !activeSlug || (!!customSlug && !SLUG_RE.test(customSlug))}
                    className="mt-5 w-full rounded-md bg-foreground px-6 py-3 text-[13px] font-semibold text-background transition hover:opacity-85 disabled:opacity-30"
                  >
                    {claiming
                      ? "Claiming…"
                      : activeSlug
                        ? `Claim ${host}/${activeSlug}`
                        : "Pick or type a name first"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "done" && claimed && (
            <div className="animate-fade-up">
              <div className="mb-4 flex items-baseline justify-between">
                <Label>Step 3 — Done</Label>
                <button
                  onClick={reset}
                  className="font-mono text-[11px] text-faint transition hover:text-foreground"
                >
                  make another ↺
                </button>
              </div>

              <div className="mx-auto max-w-3xl rounded-lg border border-line bg-card">
                <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                    Live
                  </p>
                </div>

                <div className="grid min-w-0 gap-6 px-5 py-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="min-w-0">
                    <p className="text-sm text-muted">Your link</p>
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-line bg-background px-3.5 py-3">
                      <span className="min-w-0 truncate font-mono text-[15px] font-semibold">
                        {host}/{claimed.slug}
                      </span>
                      <CopyButton text={fullLink(claimed.slug)} />
                    </div>
                    <p className="mt-3 break-words text-[13px] leading-relaxed text-faint">
                      Anyone who opens it lands straight on{" "}
                      <span className="break-all font-mono">
                        {claimed.targetUrl.replace(/^https?:\/\//, "")}
                      </span>
                      .
                    </p>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <button
                        onClick={reset}
                        className="rounded-md border border-line px-5 py-2.5 text-[13px] font-medium text-muted transition hover:border-line-strong hover:text-foreground"
                      >
                        Make another
                      </button>
                      <a
                        href={fullLink(claimed.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md bg-foreground px-5 py-2.5 text-center text-[13px] font-semibold text-background transition hover:opacity-85"
                      >
                        Open link ↗
                      </a>
                    </div>
                  </div>

                  {/* What a shared-link preview shows */}
                  <div>
                    <Label>In a chat or DM</Label>
                    <div className="mt-2.5 min-w-0 overflow-hidden rounded-md border border-line bg-background">
                      <div className="border-b border-line px-4 py-3">
                        <p className="break-words text-[13px] font-medium">
                          {claimed.title ?? brandLink(claimed.slug)}
                        </p>
                        <p className="mt-0.5 line-clamp-2 break-words text-xs leading-relaxed text-muted">
                          {claimed.description ?? claimed.targetUrl}
                        </p>
                        <p className="mt-2 break-all font-mono text-[10px] uppercase tracking-wide text-faint">
                          {host}/{claimed.slug}
                        </p>
                      </div>
                      <p className="break-all px-4 py-2.5 font-mono text-[11px] leading-relaxed text-faint">
                        ↳ opens {claimed.targetUrl.replace(/^https?:\/\//, "")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* QR + control room */}
                <div className="flex flex-col items-center gap-5 border-t border-line px-5 py-5 sm:flex-row sm:justify-between">
                  <div className="flex items-center gap-4">
                    <QrCode text={fullLink(claimed.slug)} size={88} />
                    <div>
                      <Label>Take it offline</Label>
                      <p className="mt-1.5 max-w-[240px] text-[12px] leading-relaxed text-faint">
                        The QR opens {host}/{claimed.slug} — for posters, resumes
                        and slides.
                      </p>
                    </div>
                  </div>
                  {manageToken && (
                    <a
                      href={`/manage?token=${manageToken}`}
                      className="shrink-0 rounded-md bg-foreground px-5 py-2.5 text-[13px] font-semibold text-background transition hover:opacity-85"
                    >
                      Open control room →
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </Reveal>
      </section>

      {/* ————— How it works ————— */}
      <section id="how" className="mt-20 scroll-mt-6 border-t border-line pt-10">
        <Reveal>
          <Label>How it works</Label>
        </Reveal>
        <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          {[
            {
              n: "01",
              title: "Paste",
              body: "Drop in any deployed URL — Render, Vercel, Netlify, GitHub Pages. Glowup reads its title and description.",
            },
            {
              n: "02",
              title: "Name it",
              body: "AI suggests brandable names from what your project is about, or type your own. Taken names are shown honestly.",
            },
            {
              n: "03",
              title: "Share",
              body: "Your link opens the real deployment instantly — and unfurls with your project's title in chats and DMs.",
            },
          ].map((s, i) => (
            <Reveal key={s.n} delay={i * 120} className="h-full">
              <div className="h-full bg-card p-5">
                <p className="font-mono text-[11px] text-faint">{s.n}</p>
                <h3 className="mt-2.5 text-[15px] font-medium tracking-tight">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ————— The whole point ————— */}
      <section className="mt-16 border-t border-line pt-10">
        <Reveal>
          <Label>The whole point</Label>
        </Reveal>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Reveal delay={0}>
            <div className="rounded-lg border border-line bg-card p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                Before
              </p>
              <p className="mt-3 break-all font-mono text-[12px] leading-relaxed text-muted line-through decoration-err/60">
                beamdrop-6ym9.onrender.com
              </p>
            </div>
          </Reveal>
          <Reveal delay={140}>
            <div className="rounded-lg border border-line bg-card p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ok">
                After
              </p>
              <p className="mt-3 break-all font-mono text-[12px] font-semibold leading-relaxed">
                {brandLink("beamdrop")}
              </p>
            </div>
          </Reveal>
        </div>
        <Reveal delay={240}>
          <p className="mt-4 text-[13px] leading-relaxed text-faint">
            Same destination. Different first impression.
          </p>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="mt-20 flex flex-col items-center justify-between gap-2 border-t border-line py-8 sm:flex-row">
        <p className="font-mono text-[11px] text-faint">
          {BRAND_NAME} — give your link a glow up.
        </p>
        <p className="font-mono text-[11px] text-faint">
          every link redirects to the real deployment
        </p>
      </footer>
    </main>
  );
}
