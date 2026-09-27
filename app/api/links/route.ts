import { NextResponse } from "next/server";
import { normalizeUrl, scrapeMetadata } from "@/lib/scrape";
import { assertSafeUrl } from "@/lib/ssrf";
import { isValidSlug } from "@/lib/slug";
import { claimSlug } from "@/lib/links";
import { brandLink } from "@/lib/brand";
import { isDbConfigured } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

type CreateBody = {
  slug?: string;
  url?: string;
};

/** POST /api/links — claim a slug: { slug, url } → mapping + one-time manage token. */
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

  // SSRF guard: never let a claim point the scraper at internal infrastructure.
  const ssrf = await assertSafeUrl(target);
  if (ssrf) {
    return NextResponse.json(
      { error: `That URL is not allowed (${ssrf}).` },
      { status: 400 },
    );
  }

  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Database not configured. Set Supabase env vars first." },
      { status: 503 },
    );
  }

  const meta = await scrapeMetadata(target);
  const result = await claimSlug(slug, target, meta);

  if (!result.ok) {
    if (result.error === "taken") {
      return NextResponse.json({ error: `${brandLink(slug)} is already taken.` }, { status: 409 });
    }
    if (result.error === "not_configured") {
      return NextResponse.json({ error: "Database not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not save the mapping." }, { status: 500 });
  }

  return NextResponse.json(
    {
      link: {
        slug: result.link.slug,
        targetUrl: result.link.target_url,
        title: result.link.title,
        description: result.link.description,
      },
      manageToken: result.manageToken,
    },
    { status: 201 },
  );
}
