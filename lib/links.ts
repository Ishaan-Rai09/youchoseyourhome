import { getAdminClient, isDbConfigured, type LinkRow } from "./supabase";
import {
  encrypt,
  decryptWithMeta,
  maybeDecrypt,
  generateManageToken,
  hashToken,
  hmacAll,
} from "./crypto";
import { normalizeUrl } from "./scrape";

export type BioLink = { label: string; url: string };

export type ClaimResult =
  | { ok: true; link: LinkRow; manageToken: string }
  | { ok: false; error: "taken" | "db" | "not_configured" };

const LINK_COLUMNS =
  "slug, target_url, title, description, clicks, created_at, manage_token, bio_enabled, bio_name, bio_tagline, bio_avatar, bio_links";

/** Plaintext→ciphertext shape used across this module. */
type LinkRecord = {
  slug: string;
  target_url: string;
  title: string | null;
  description: string | null;
  clicks: number;
  created_at: string;
  manage_token: string | null;
  bio_enabled: boolean;
  bio_name: string | null;
  bio_tagline: string | null;
  bio_avatar: string | null;
  bio_links: BioLink[] | null;
};

/** Decrypt one field; plaintext (pre-migration) passes through as key 0. */
function decryptField(value: string | null | undefined): {
  value: string | null;
  keyIndex: number;
} {
  if (!value) return { value: null, keyIndex: -1 };
  if (!value.startsWith("v1:")) return { value, keyIndex: 0 };
  return decryptWithMeta(value);
}

/** Re-encrypt a field under the current primary key after a key transition. */
async function reencryptField(slug: string, column: string, plaintext: string): Promise<void> {
  try {
    await getAdminClient()
      .from("links")
      .update({ [column]: encrypt(plaintext) })
      .eq("slug", slug);
  } catch (err) {
    console.error("[crypto] re-encryption failed:", slug, column, err);
  }
}

/** DB row → app row: decrypt every sensitive field. */
function decryptRow(row: LinkRecord): LinkRow {
  const target = decryptField(row.target_url);
  if (target.value !== null && target.keyIndex > 0) {
    // Written under a fallback key — silently upgrade to the primary key.
    void reencryptField(row.slug, "target_url", target.value);
  }
  return {
    slug: row.slug,
    target_url: target.value ?? "",
    title: decryptField(row.title).value,
    description: decryptField(row.description).value,
    clicks: row.clicks,
    created_at: row.created_at,
    manage_token: row.manage_token, // HMAC of the user's token
    bio_enabled: row.bio_enabled,
    bio_name: decryptField(row.bio_name).value,
    bio_tagline: decryptField(row.bio_tagline).value,
    bio_avatar: decryptField(row.bio_avatar).value,
    bio_links: decryptBioLinks(row.bio_links),
  };
}

function encryptBioLinks(links: BioLink[] | null | undefined): string | null {
  if (!links || links.length === 0) return null;
  return encrypt(JSON.stringify(links.slice(0, 8)));
}

function decryptBioLinks(raw: BioLink[] | string | null): BioLink[] | null {
  if (!raw) return null;
  try {
    if (typeof raw === "string") {
      const plain = maybeDecrypt(raw);
      if (!plain) return null;
      const parsed = JSON.parse(plain) as unknown;
      return Array.isArray(parsed) ? (parsed as BioLink[]) : null;
    }
    // Pre-encryption jsonb rows.
    return raw;
  } catch {
    return null;
  }
}

export async function getLinkBySlug(slug: string): Promise<LinkRow | null> {
  if (!isDbConfigured()) return null;
  const { data } = await getAdminClient()
    .from("links")
    .select(LINK_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  const row = data as LinkRecord;

  // One-time lazy migration: re-encrypt any plaintext left from before.
  if (!row.target_url.startsWith("v1:")) {
    void migrateRowToEncrypted(row);
  }
  return decryptRow(row);
}

async function migrateRowToEncrypted(row: LinkRecord): Promise<void> {
  try {
    const patch: Record<string, unknown> = {
      target_url: encrypt(row.target_url),
      title: row.title ? encrypt(row.title) : null,
      description: row.description ? encrypt(row.description) : null,
      bio_name: row.bio_name && !row.bio_name.startsWith("v1:") ? encrypt(row.bio_name) : row.bio_name,
      bio_tagline:
        row.bio_tagline && !row.bio_tagline.startsWith("v1:") ? encrypt(row.bio_tagline) : row.bio_tagline,
      bio_avatar:
        row.bio_avatar && !row.bio_avatar.startsWith("v1:") ? encrypt(row.bio_avatar) : row.bio_avatar,
      bio_links:
        row.bio_links && !Array.isArray(row.bio_links)
          ? row.bio_links
          : encryptBioLinks(Array.isArray(row.bio_links) ? row.bio_links : null),
    };
    await getAdminClient().from("links").update(patch).eq("slug", row.slug);
  } catch (err) {
    console.error("[crypto] lazy migration failed for", row.slug, err);
  }
}

export async function getLinkByToken(token: string): Promise<LinkRow | null> {
  if (!isDbConfigured()) return null;
  const db = getAdminClient();
  const normalized = token.trim().toLowerCase();

  // Try the HMAC under every configured key (covers key transitions).
  const { data } = await db
    .from("links")
    .select(LINK_COLUMNS)
    .in("manage_token", hmacAll(`token:${normalized}`))
    .maybeSingle();
  if (data) return decryptRow(data as LinkRecord);

  // Legacy rows stored the raw token; match, then upgrade to hashed storage.
  const legacy = await db
    .from("links")
    .select(LINK_COLUMNS)
    .eq("manage_token", token.trim().toLowerCase())
    .maybeSingle();
  if (legacy.data) {
    const row = legacy.data as LinkRecord;
    void db.from("links").update({ manage_token: hashToken(normalized) }).eq("slug", row.slug);
    return decryptRow(row);
  }
  return null;
}

/** Claim a slug. The plaintext manage token is returned exactly once. */
export async function claimSlug(
  slug: string,
  targetUrl: string,
  meta: { title: string | null; description: string | null },
): Promise<ClaimResult> {
  if (!isDbConfigured()) return { ok: false, error: "not_configured" };
  const db = getAdminClient();

  const existing = await db.from("links").select("slug").eq("slug", slug).maybeSingle();
  if (existing.data) return { ok: false, error: "taken" };

  const manageToken = generateManageToken();
  const { data, error } = await db
    .from("links")
    .insert({
      slug,
      target_url: encrypt(targetUrl),
      title: meta.title ? encrypt(meta.title) : null,
      description: meta.description ? encrypt(meta.description) : null,
      manage_token: hashToken(manageToken),
      bio_enabled: false,
    })
    .select(LINK_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "taken" };
    console.error("[links] insert failed:", error);
    return { ok: false, error: "db" };
  }
  return { ok: true, link: decryptRow(data as LinkRecord), manageToken };
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

export async function updateLink(
  slug: string,
  update: LinkUpdate,
): Promise<{ ok: boolean; error?: string }> {
  if (!isDbConfigured()) return { ok: false, error: "not_configured" };

  const patch: Record<string, unknown> = {};
  if (update.target_url !== undefined) {
    const clean = normalizeUrl(update.target_url);
    if (!clean) return { ok: false, error: "invalid_url" };
    patch.target_url = encrypt(clean);
  }
  if (update.bio_enabled !== undefined) patch.bio_enabled = Boolean(update.bio_enabled);
  if (update.bio_name !== undefined)
    patch.bio_name = update.bio_name ? encrypt(update.bio_name.slice(0, 80)) : null;
  if (update.bio_tagline !== undefined)
    patch.bio_tagline = update.bio_tagline ? encrypt(update.bio_tagline.slice(0, 140)) : null;
  if (update.bio_avatar !== undefined) {
    const v = extractImageUrl((update.bio_avatar ?? "").trim());
    patch.bio_avatar = /^https?:\/\//i.test(v) ? encrypt(v.slice(0, 400)) : null;
  }
  if (update.bio_links !== undefined) {
    const links = cleanBioLinks(update.bio_links);
    patch.bio_links = links.length ? encrypt(JSON.stringify(links)) : null;
  }

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

function topReferrerDisplay(host: string | null): string | null {
  // Referrer hostnames are stored encrypted; decrypt and bucket.
  return maybeDecrypt(host);
}

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

    const refHost = topReferrerDisplay(row.referrer_host);
    if (refHost) {
      refCounts.set(refHost, (refCounts.get(refHost) ?? 0) + 1);
    } else {
      direct += 1;
    }

    const country = maybeDecrypt(row.country);
    if (country) countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);

    const device = maybeDecrypt(row.device);
    if (device) deviceCounts.set(device, (deviceCounts.get(device) ?? 0) + 1);

    const day = row.ts.slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }

  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const daily: Array<{ day: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    daily.push({ day: d, count: dayCounts.get(d) ?? 0 });
  }

  return {
    total: data.length,
    last7Days,
    direct,
    referrers: top(refCounts).map(([host, count]) => ({ host, count })),
    countries: top(countryCounts).map(([country, count]) => ({ country, count })),
    devices: top(deviceCounts).map(([device, count]) => ({ device, count })),
    daily,
  };
}
