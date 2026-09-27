"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QrCode from "@/components/qr-code";
import AvatarImage from "@/components/avatar-image";
import { BRAND_NAME, BRAND_HOST, brandLink } from "@/lib/brand";

type BioLink = { label: string; url: string };

type ManagedLink = {
  slug: string;
  targetUrl: string;
  title: string | null;
  description: string | null;
  clicks: number;
  createdAt: string;
  bio: { enabled: boolean; name: string | null; tagline: string | null; avatar: string | null; links: BioLink[] };
};

type Stats = {
  total: number;
  last7Days: number;
  direct: number;
  referrers: Array<{ host: string; count: number }>;
  countries: Array<{ country: string; count: number }>;
  devices: Array<{ device: string; count: number }>;
  daily: Array<{ day: string; count: number }>;
};

type StoredLink = { slug: string; token: string; at: number; clicks?: number };
const STORE_KEY = "glowup_links";
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readStored(): StoredLink[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as StoredLink[];
  } catch {
    return [];
    }
}
function writeStored(list: StoredLink[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
      {children}
    </p>
  );
}

function TopList({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; count: number }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <Label>{title}</Label>
      {items.length === 0 ? (
        <p className="mt-3 text-[13px] text-faint">No data yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((i) => (
            <div key={i.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate font-mono text-[12px] text-muted">
                {i.key}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-foreground/60"
                  style={{ width: `${(i.count / max) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-faint">
                {i.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ManagePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredLink[]>([]);
  const [link, setLink] = useState<ManagedLink | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [targetUrl, setTargetUrl] = useState("");
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioName, setBioName] = useState("");
  const [bioTagline, setBioTagline] = useState("");
  const [bioAvatar, setBioAvatar] = useState("");
  const [bioLinks, setBioLinks] = useState<BioLink[]>([{ label: "", url: "" }]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/manage?token=${encodeURIComponent(t)}`);
      if (res.status === 404) {
        // Link was deleted (here or elsewhere) — purge it from this device
        // and return to the picker instead of a dead end.
        setStored((prev) => {
          const next = prev.filter((l) => l.token !== t);
          writeStored(next);
          return next;
        });
        setToken(null);
        setLink(null);
        setNotice("That link no longer exists — it may have been deleted.");
        return;
      }
      const data = (await res.json()) as {
        link?: ManagedLink;
        stats?: Stats;
        error?: string;
      };
      if (!res.ok || !data.link) throw new Error(data.error ?? "Not found.");
      setLink(data.link);
      setStats(data.stats ?? null);
      setTargetUrl(data.link.targetUrl);
      setBioEnabled(data.link.bio.enabled);
      setBioName(data.link.bio.name ?? "");
      setBioTagline(data.link.bio.tagline ?? "");
      setBioAvatar(data.link.bio.avatar ?? "");
      setBioLinks(data.link.bio.links.length ? data.link.bio.links : [{ label: "", url: "" }]);
      setStored((prev) => {
        const next = [
          { slug: data.link!.slug, token: t, at: Date.now() },
          ...prev.filter((l) => l.slug !== data.link!.slug),
        ];
        writeStored(next);
        return next;
      });
    } catch (err) {
      setLink(null);
      setStats(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("token");
      const list = readStored();

      // Sync the saved list with the database: drop links that no longer
      // exist and refresh their click counts.
      let valid: StoredLink[] = list;
      if (list.length > 0) {
        const checks = await Promise.allSettled(
          list.slice(0, 20).map(async (l) => {
            const res = await fetch(`/api/manage?token=${encodeURIComponent(l.token)}`);
            if (!res.ok) return null;
            const data = (await res.json()) as { link?: { clicks: number } };
            return { ...l, clicks: data.link?.clicks ?? 0 };
          }),
        );
        valid = checks
          .map((c) => (c.status === "fulfilled" ? c.value : null))
          .filter((x): x is StoredLink & { clicks: number } => x !== null);
        writeStored(valid);
      }

      if (cancelled) return;
      setStored(valid);
      if (t) {
        setToken(t);
        await load(t);
      } else {
        setLoading(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const save = async () => {
    if (!token || !link) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          update: {
            targetUrl,
            bioEnabled,
            bioName: bioName || null,
            bioTagline: bioTagline || null,
            bioAvatar: bioAvatar || null,
            bioLinks: bioLinks.filter((l) => l.label && l.url),
          },
        }),
      });
      const data = (await res.json()) as { link?: ManagedLink; error?: string };
      if (!res.ok || !data.link) throw new Error(data.error ?? "Save failed.");
      setLink(data.link);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("Delete failed.");
      setStored((prev) => {
        const next = prev.filter((l) => l.token !== token);
        writeStored(next);
        return next;
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const host = BRAND_HOST; // server-rendered fallback; production URL
  const fullLink = (slug: string) =>
    `${typeof window !== "undefined" && (window.location.host.startsWith("localhost") || window.location.host.startsWith("127.0.0.1"))
      ? `http://${window.location.host}`
      : `https://${host}`}/${slug}`;

  const maxDaily = Math.max(1, ...(stats?.daily.map((d) => d.count) ?? [1]));

  /* ————— Render states ————— */

  if (!token && !loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-md rounded-lg border border-line bg-card p-8">
          <p className="font-mono text-[13px] text-muted">{BRAND_NAME} control room</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {stored.length > 0 ? "Your links" : "No links on this device yet"}
          </h1>
          {notice && (
            <p className="mt-3 text-[12px] leading-relaxed text-err">{notice}</p>
          )}
          {stored.length > 0 ? (
            <div className="mt-5 space-y-2">
              {stored.map((s) => (
                <button
                  key={s.slug}
                  onClick={() => {
                    setToken(s.token);
                    void load(s.token);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-background px-4 py-3 font-mono text-[13px] transition hover:border-line-strong"
                >
                  <span className="min-w-0 truncate">/{s.slug}</span>
                  <span className="flex shrink-0 items-center gap-2.5 text-[11px] text-faint">
                    <span>{s.clicks ?? 0} clicks</span>
                    <span>open →</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Claim a link and the control room opens with full stats and controls.
            </p>
          )}
          <div className="mt-6 border-t border-line pt-5 text-left">
            <Label>Have a manage token?</Label>
            <div className="mt-2 flex gap-2">
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value.trim())}
                placeholder="paste token to open a link"
                className="w-full rounded-md border border-line bg-background px-3.5 py-2.5 font-mono text-[12px] outline-none transition placeholder:text-faint focus:border-line-strong"
              />
              <button
                onClick={() => {
                  if (TOKEN_RE.test(manualToken)) {
                    setToken(manualToken);
                    void load(manualToken);
                  }
                }}
                disabled={!TOKEN_RE.test(manualToken)}
                className="shrink-0 rounded-md border border-line px-4 text-[12px] font-medium text-muted transition hover:border-line-strong hover:text-foreground disabled:opacity-30"
              >
                Open
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              Links claimed on other devices can be opened with their token —
              find it in Supabase → links → manage_token.
            </p>
          </div>
          <Link
            href="/"
            className="mt-6 inline-block font-mono text-[11px] text-faint underline underline-offset-4 transition hover:text-foreground"
          >
            ← claim a new link
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border border-line border-t-foreground" />
      </main>
    );
  }

  if (error || !link) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-md rounded-lg border border-line bg-card p-8">
          <p className="text-[13px] text-err">{error ?? "Link not found."}</p>
          <Link href="/" className="mt-4 inline-block font-mono text-[12px] text-faint underline underline-offset-4">
            ← back to {BRAND_NAME.toLowerCase()}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      {/* Nav */}
      <header className="flex items-center justify-between">
        <p className="font-mono text-[13px] font-medium uppercase tracking-[0.22em]">
          {BRAND_NAME}
        </p>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
          control room
        </p>
      </header>

      {/* Your other links */}
      {stored.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Label>Your links</Label>
          {stored.map((s) => (
            <button
              key={s.slug}
              onClick={() => {
                setToken(s.token);
                void load(s.token);
              }}
              className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition ${
                s.slug === link.slug
                  ? "border-line-strong text-foreground"
                  : "border-line text-faint hover:text-foreground"
              }`}
            >
              /{s.slug}
            </button>
          ))}
        </div>
      )}

      {/* Link header */}
      <section className="mt-8 rounded-lg border border-line bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              <p className="truncate font-mono text-lg font-semibold">{brandLink(link.slug)}</p>
            </div>
            <p className="mt-1 truncate font-mono text-[11px] text-faint">
              ↳ {link.targetUrl.replace(/^https?:\/\//, "")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <QrCode text={fullLink(link.slug)} size={64} />
            <a
              href={fullLink(link.slug)}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-line px-4 py-2 text-[12px] font-medium text-muted transition hover:border-line-strong hover:text-foreground"
            >
              Open ↗
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-px bg-line sm:grid-cols-3">
          <div className="bg-card px-5 py-4">
            <Label>Total clicks</Label>
            <p className="mt-1.5 font-mono text-3xl font-semibold tracking-tight">
              {stats?.total ?? link.clicks}
            </p>
          </div>
          <div className="bg-card px-5 py-4">
            <Label>Last 7 days</Label>
            <p className="mt-1.5 font-mono text-3xl font-semibold tracking-tight">
              {stats?.last7Days ?? 0}
            </p>
          </div>
          <div className="bg-card px-5 py-4">
            <Label>Claimed</Label>
            <p className="mt-1.5 font-mono text-[13px] leading-relaxed text-muted">
              {new Date(link.createdAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* 14-day chart */}
        <div className="border-t border-line px-5 py-4">
          <Label>Clicks — last 14 days</Label>
          <div className="mt-4 flex h-24 items-end gap-1.5">
            {(stats?.daily ?? []).map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.count} clicks`}
                className="group relative flex-1 rounded-t-sm bg-foreground/25 transition hover:bg-foreground/60"
                style={{ height: `${8 + (d.count / maxDaily) * 92}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-faint">
            <span>{stats?.daily[0]?.day.slice(5) ?? ""}</span>
            <span>{stats?.daily[stats.daily.length - 1]?.day.slice(5) ?? ""}</span>
          </div>
        </div>

        {/* Breakdowns */}
        <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-3">
          <TopList
            title="Where they came from"
            items={
              stats && stats.referrers.length === 0 && stats.direct > 0
                ? [{ key: "direct / QR", count: stats.direct }]
                : stats?.referrers.map((r) => ({ key: r.host, count: r.count })) ?? []
            }
          />
          <TopList title="Countries" items={stats?.countries.map((c) => ({ key: c.country, count: c.count })) ?? []} />
          <TopList title="Devices" items={stats?.devices.map((d) => ({ key: d.device, count: d.count })) ?? []} />
        </div>
      </section>

      {/* Editors */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Destination */}
        <div className="min-w-0 rounded-lg border border-line bg-card p-5">
          <Label>Destination</Label>
          <p className="mt-2 text-[12px] leading-relaxed text-faint">
            Where {brandLink(link.slug)} sends people. Update it when you redeploy —
            the pretty link never changes.
          </p>
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className="mt-3 w-full rounded-md border border-line bg-background px-3.5 py-2.5 font-mono text-[13px] outline-none transition placeholder:text-faint focus:border-line-strong"
            placeholder="https://my-new-deploy.onrender.com"
          />

          {/* Bio mode */}
          <div className="mt-5 border-t border-line pt-4">
            <label className="flex cursor-pointer items-center justify-between">
              <span>
                <Label>Bio page mode</Label>
                <span className="mt-1 block text-[12px] text-faint">
                  Show a mini page instead of redirecting instantly.
                </span>
              </span>
              <input
                type="checkbox"
                checked={bioEnabled}
                onChange={(e) => setBioEnabled(e.target.checked)}
                className="h-4 w-4 accent-white"
              />
            </label>

            {bioEnabled && (
              <div className="mt-3 space-y-3">
                <input
                  value={bioName}
                  onChange={(e) => setBioName(e.target.value)}
                  placeholder="Display name"
                  maxLength={80}
                  className="w-full rounded-md border border-line bg-background px-3.5 py-2.5 text-[13px] outline-none transition placeholder:text-faint focus:border-line-strong"
                />
                <input
                  value={bioTagline}
                  onChange={(e) => setBioTagline(e.target.value)}
                  placeholder="One-line tagline"
                  maxLength={140}
                  className="w-full rounded-md border border-line bg-background px-3.5 py-2.5 text-[13px] outline-none transition placeholder:text-faint focus:border-line-strong"
                />
                <input
                  value={bioAvatar}
                  onChange={(e) => setBioAvatar(e.target.value)}
                  placeholder="Avatar image URL (optional)"
                  maxLength={400}
                  className="w-full rounded-md border border-line bg-background px-3.5 py-2.5 font-mono text-[12px] outline-none transition placeholder:text-faint focus:border-line-strong"
                />
                {bioLinks.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={l.label}
                      onChange={(e) =>
                        setBioLinks((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                      placeholder="Label"
                      maxLength={60}
                      className="w-2/5 rounded-md border border-line bg-background px-3 py-2.5 text-[12px] outline-none transition placeholder:text-faint focus:border-line-strong"
                    />
                    <input
                      value={l.url}
                      onChange={(e) =>
                        setBioLinks((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                      }
                      placeholder="https://…"
                      className="flex-1 rounded-md border border-line bg-background px-3 py-2.5 font-mono text-[12px] outline-none transition placeholder:text-faint focus:border-line-strong"
                    />
                    <button
                      onClick={() => setBioLinks((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-md border border-line px-3 font-mono text-[11px] text-faint transition hover:text-err"
                      aria-label="Remove link"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {bioLinks.length < 8 && (
                  <button
                    onClick={() => setBioLinks((prev) => [...prev, { label: "", url: "" }])}
                    className="rounded-md border border-line px-3.5 py-2 font-mono text-[11px] text-muted transition hover:border-line-strong hover:text-foreground"
                  >
                    + add link
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <button
              onClick={() => {
                if (confirmDelete) {
                  void remove();
                  return;
                }
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 4000);
              }}
              className="font-mono text-[11px] text-faint underline underline-offset-4 transition hover:text-err"
            >
              {confirmDelete ? "click again to confirm" : "delete this link"}
            </button>
            <div className="flex items-center gap-3">
              {saved && <span className="font-mono text-[11px] text-ok">saved ✓</span>}
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-md bg-foreground px-5 py-2.5 text-[13px] font-semibold text-background transition hover:opacity-85 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="min-w-0 rounded-lg border border-line bg-card p-5">
          <Label>{bioEnabled ? "Bio page preview" : "Redirect preview"}</Label>
          <div className="mt-3 overflow-hidden rounded-md border border-line bg-background">
            <div className="border-b border-line px-4 py-2.5 font-mono text-[10px] text-faint">
              {brandLink(link.slug)}
            </div>
            {bioEnabled ? (
              <div className="px-5 py-6 text-center">
                {bioAvatar && (
                  <div className="mx-auto mb-3 h-12 w-12 overflow-hidden rounded-full border border-line-strong bg-background">
                    <AvatarImage
                      src={bioAvatar}
                      alt="Avatar preview"
                      monogram={(bioName || link.title || link.slug).trim().slice(0, 1).toUpperCase()}
                    />
                  </div>
                )}
                <p className="text-lg font-semibold tracking-tight">
                  {bioName || link.title || link.slug}
                </p>
                {(bioTagline || link.description) && (
                <p className="mt-1.5 break-words text-[12px] leading-relaxed text-muted">
                  {bioTagline || link.description}
                </p>
                )}
                <div className="mt-5 space-y-2">
                  {bioLinks
                    .filter((l) => l.label && l.url)
                    .slice(0, 4)
                    .map((l, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md border border-line px-3.5 py-2.5"
                      >
                        <span className="truncate text-[12px] font-medium">{l.label}</span>
                        <span className="font-mono text-[10px] text-faint">open ↗</span>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border border-line border-t-foreground" />
                <p className="mt-3 text-[12px] text-muted">
                  Redirecting to{" "}
                  <span className="font-mono">{targetUrl.replace(/^https?:\/\//, "") || "…"}</span>
                </p>
              </div>
            )}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            Shared in chats, the link unfurls with your project&apos;s title and an
            auto-generated preview card.
          </p>
        </div>
      </section>

      <footer className="mt-12 border-t border-line py-8 text-center">
        <Link href="/" className="font-mono text-[11px] text-faint underline underline-offset-4 hover:text-muted">
          ← {BRAND_NAME.toLowerCase()} home
        </Link>
      </footer>
    </main>
  );
}
