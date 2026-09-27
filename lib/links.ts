import { getAdminClient, isDbConfigured, type LinkRow } from "./supabase";

export type BioLink = { label: string; url: string };

export type ClaimResult =
  | { ok: true; link: LinkRow }
  | { ok: false; error: "taken" | "db" | "not_configured" };

const LINK_COLUMNS =
  "slug, target_url, title, description, clicks, created_at, manage_token, bio_enabled, bio_name, bio_tagline, bio_avatar, bio_links";

export async function getLinkBySlug(slug: string): Promise<LinkRow | null> {
  if (!isDbConfigured()) return null;
  const { data } = await getAdminClient()
    .from("links")
    .select(LINK_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  return (data as LinkRow) ?? null;
}

export async function getLinkByToken(token: string): Promise<LinkRow | null> {
  if (!isDbConfigured()) return null;
  const { data } = await getAdminClient()
    .from("links")
    .select(LINK_COLUMNS)
    .eq("manage_token", token)
    .maybeSingle();
  return (data as LinkRow) ?? null;
}

/** Claim a slug. Returns a typed result the API route can translate to HTTP codes. */
export async function claimSlug(
  slug: string,
  targetUrl: string,
  meta: { title: string | null; description: string | null },
): Promise<ClaimResult> {
  if (!isDbConfigured()) return { ok: false, error: "not_configured" };
  const db = getAdminClient();

  const existing = await db.from("links").select("slug").eq("slug", slug).maybeSingle();
  if (existing.data) return { ok: false, error: "taken" };

  const { data, error } = await db
    .from("links")
    .insert({
      slug,
      target_url: targetUrl,
      title: meta.title,
      description: meta.description,
      manage_token: crypto.randomUUID(),
    })
    .select(LINK_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "taken" };
    console.error("[links] insert failed:", error);
    return { ok: false, error: "db" };
  }
  return { ok: true, link: data as LinkRow };
}

/** Fields the owner may edit through /api/manage. */
export type LinkUpdate = {
  target_url?: string;
  bio_enabled?: boolean;
  bio_name?: string | null;
  bio_tagline?: string | null;
  bio_avatar?: string | null;
  bio_links?: BioLink[];
};

function cleanBioLinks(raw: unknown): BioLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 8)
    .map((item) => {
      const l = item as { label?: unknown; url?: unknown };
      return {
        label: String(l.label ?? "").slice(0, 60),
        url: String(l.url ?? "").slice(0, 300),
      };
    })
    .filter((l) => l.label && /^https?:\/\//i.test(l.url));
}

/**
 * Users often paste search-result pages (Google Images etc.) instead of the
 * image itself. Pull the real image URL out when we can spot it.
 */
export function extractImageUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname.includes("google.") && u.pathname.startsWith("/imgres")) {
      const imgurl = u.searchParams.get("imgurl");
      if (imgurl) return imgurl;
    }
    return raw;
  } catch {
    return raw;
  }
}

export async function updateLink(
  slug: string,
  update: LinkUpdate,
): Promise<{ ok: boolean; error?: string }> {
  if (!isDbConfigured()) return { ok: false, error: "not_configured" };

  const patch: Record<string, unknown> = {};
  if (update.target_url !== undefined) {
    const { normalizeUrl } = await import("./scrape");
    const clean = normalizeUrl(update.target_url);
    if (!clean) return { ok: false, error: "invalid_url" };
    patch.target_url = clean;
  }
  if (update.bio_enabled !== undefined) patch.bio_enabled = Boolean(update.bio_enabled);
  if (update.bio_name !== undefined) patch.bio_name = update.bio_name?.slice(0, 80) ?? null;
  if (update.bio_tagline !== undefined)
    patch.bio_tagline = update.bio_tagline?.slice(0, 140) ?? null;
  if (update.bio_avatar !== undefined) {
    const v = extractImageUrl((update.bio_avatar ?? "").trim());
    patch.bio_avatar = /^https?:\/\/.+/i.test(v) ? v.slice(0, 400) : null;
  }
  if (update.bio_links !== undefined) patch.bio_links = cleanBioLinks(update.bio_links);

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await getAdminClient().from("links").update(patch).eq("slug", slug);
  if (error) {
    console.error("[links] update failed:", error);
    return { ok: false, error: "db" };
  }
  return { ok: true };
}

export async function deleteLink(slug: string): Promise<{ ok: boolean; error?: string }> {
  if (!isDbConfigured()) return { ok: false, error: "not_configured" };
  const { error } = await getAdminClient().from("links").delete().eq("slug", slug);
  if (error) {
    console.error("[links] delete failed:", error);
    return { ok: false, error: "db" };
  }
  return { ok: true };
}

/** Aggregated analytics for the control room. */
export type LinkStats = {
  total: number;
  last7Days: number;
  direct: number;
  referrers: Array<{ host: string; count: number }>;
  countries: Array<{ country: string; count: number }>;
  devices: Array<{ device: string; count: number }>;
  daily: Array<{ day: string; count: number }>;
};

export async function getLinkStats(slug: string): Promise<LinkStats> {
  const empty: LinkStats = {
    total: 0,
    last7Days: 0,
    direct: 0,
    referrers: [],
    countries: [],
    devices: [],
    daily: [],
  };
  if (!isDbConfigured()) return empty;

  const db = getAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const { data, error } = await db
    .from("click_events")
    .select("ts, referrer_host, country, device")
    .eq("slug", slug)
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(5000);

  if (error || !data) {
    if (error) console.error("[stats] query failed:", error);
    return empty;
  }

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const refCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  let last7Days = 0;
  let direct = 0;

  for (const row of data as Array<{
    ts: string;
    referrer_host: string | null;
    country: string | null;
    device: string | null;
  }>) {
    const tsMs = new Date(row.ts).getTime();
    if (tsMs >= weekAgo) last7Days += 1;
    if (row.referrer_host) {
      refCounts.set(row.referrer_host, (refCounts.get(row.referrer_host) ?? 0) + 1);
    } else {
      direct += 1;
    }
    if (row.country) countryCounts.set(row.country, (countryCounts.get(row.country) ?? 0) + 1);
    if (row.device) deviceCounts.set(row.device, (deviceCounts.get(row.device) ?? 0) + 1);
    const day = row.ts.slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }

  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, c]) => ({ key: k, count: c }));

  const daily: Array<{ day: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    daily.push({ day: d, count: dayCounts.get(d) ?? 0 });
  }

  return {
    total: data.length,
    last7Days,
    direct,
    referrers: top(refCounts).map((r) => ({ host: r.key, count: r.count })),
    countries: top(countryCounts).map((r) => ({ country: r.key, count: r.count })),
    devices: top(deviceCounts).map((r) => ({ device: r.key, count: r.count })),
    daily,
  };
}
