import { NextResponse } from "next/server";
import { normalizeUrl, scrapeMetadata } from "@/lib/scrape";
import { isValidSlug } from "@/lib/slug";
import { getAdminClient, isDbConfigured, type LinkRow } from "@/lib/supabase";
import { brandLink } from "@/lib/brand";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

type CreateBody = {
  slug?: string;
  url?: string;
};

/** POST /api/links — claim a slug: { slug, url } → creates the mapping. */
export async function POST(req: Request) {
  const gate = rateLimit(`claim:${clientIp(req)}`, 6, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Slow down — too many claims from this IP." },
      { status: 429 },
    );
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = (body.slug ?? "").trim().toLowerCase();
  const target = normalizeUrl(body.url ?? "");

  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: "Slug must be 1-50 chars: lowercase letters, numbers, hyphens." },
      { status: 400 },
    );
  }
  if (!target) {
    return NextResponse.json({ error: "Provide a valid deployed URL." }, { status: 400 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Database not configured. Set Supabase env vars first." },
      { status: 503 },
    );
  }

  const db = getAdminClient();

  // Re-check availability right before insert (race-safe enough for MVP).
  const existing = await db.from("links").select("slug").eq("slug", slug).maybeSingle();
  if (existing.data) {
    return NextResponse.json({ error: `${brandLink(slug)} is already taken.` }, { status: 409 });
  }

  // Scrape once more so we can show a preview card on the shareable page.
  const meta = await scrapeMetadata(target);

  const { data, error } = await db
    .from("links")
    .insert({
      slug,
      target_url: target,
      title: meta.title,
      description: meta.description,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `${brandLink(slug)} is already taken.` }, { status: 409 });
    }
    console.error("[links] insert failed:", error);
    return NextResponse.json({ error: "Could not save the mapping." }, { status: 500 });
  }

  const row = data as LinkRow;
  return NextResponse.json(
    { link: { slug: row.slug, targetUrl: row.target_url, title: row.title, description: row.description } },
    { status: 201 },
  );
}

/** GET /api/links?url=... — list claimed slugs for a given target URL. */
export async function GET(req: Request) {
  const target = normalizeUrl(new URL(req.url).searchParams.get("url") ?? "");
  if (!target) {
    return NextResponse.json({ error: "Provide a valid url param." }, { status: 400 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ links: [] });
  }

  // Compare hostnames so "https://x.com" and "https://x.com/foo" both match.
  let host = "";
  try {
    host = new URL(target).hostname;
  } catch {
    return NextResponse.json({ error: "Invalid url." }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("links")
    .select("slug, target_url, title, clicks, created_at")
    .filter("target_url", "ilike", `https://${host}%`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[links] query failed:", error);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }

  const rows = (data as Pick<LinkRow, "slug" | "target_url" | "title" | "clicks" | "created_at">[] | null) ?? [];
  return NextResponse.json({ links: rows });
}
