import { NextResponse } from "next/server";
import { normalizeUrl, scrapeMetadata } from "@/lib/scrape";
import { aiSlugs, isAiConfigured } from "@/lib/ai";
import { heuristicSlugs, isValidSlug, slugify } from "@/lib/slug";
import { getAdminClient, isDbConfigured, type LinkRow } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

type SuggestBody = {
  url?: string;
  userDescription?: string;
};

export type Suggestion = {
  slug: string;
  available: boolean;
  source: "ai" | "smart";
};

/**
 * POST /api/suggest — { url, userDescription }
 * Scrapes the deployed site, generates AI slugs (heuristic fallback), checks
 * availability in Supabase and returns the annotated list.
 */
export async function POST(req: Request) {
  const gate = rateLimit(`suggest:${clientIp(req)}`, 10, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many suggestions requested. Try again in a minute." },
      { status: 429 },
    );
  }

  let body: SuggestBody;
  try {
    body = (await req.json()) as SuggestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const target = normalizeUrl(body.url ?? "");
  if (!target) {
    return NextResponse.json({ error: "Provide a valid deployed URL." }, { status: 400 });
  }

  const userDescription = (body.userDescription ?? "").trim().slice(0, 400);

  // 1. Learn about the site.
  const meta = await scrapeMetadata(target);

  // 2. Generate candidate slugs — AI first, heuristics always (both ranked).
  const ai = isAiConfigured()
    ? await aiSlugs(
        {
          title: meta.title,
          siteName: meta.siteName,
          description: meta.description,
          userDescription,
        },
        8,
      )
    : [];

  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (slug: string, source: Suggestion["source"]) => {
    if (!isValidSlug(slug) || seen.has(slug) || seen.has(slugify(slug))) return;
    const normalized = slugify(slug) || slug;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    suggestions.push({ slug: normalized, available: false, source });
  };

  ai.forEach((s) => add(s, "ai"));
  heuristicSlugs(
    {
      title: meta.title,
      siteName: meta.siteName,
      description: meta.description,
      userDescription,
      hostname: meta.hostname,
    },
    8,
  ).forEach((s) => add(s, "smart"));

  if (suggestions.length === 0) {
    return NextResponse.json(
      { error: "Could not generate suggestions — add a short brand description." },
      { status: 422 },
    );
  }

  // 3. Check availability in one round-trip.
  if (isDbConfigured()) {
    const { data } = await getAdminClient()
      .from("links")
      .select("slug")
      .in("slug", suggestions.map((s) => s.slug));
    const takenRows = (data as Pick<LinkRow, "slug">[] | null) ?? [];
    const takenSet = new Set(takenRows.map((r) => r.slug));
    for (const s of suggestions) s.available = !takenSet.has(s.slug);
  } else {
    // No DB configured yet — show everything as available so the UI is testable.
    for (const s of suggestions) s.available = true;
  }

  return NextResponse.json({
    url: target,
    metadata: meta,
    aiEnabled: isAiConfigured(),
    suggestions,
  });
}
