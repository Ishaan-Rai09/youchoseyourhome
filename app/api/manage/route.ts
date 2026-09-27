import { NextResponse } from "next/server";
import {
  deleteLink,
  getLinkByToken,
  getLinkStats,
  updateLink,
  type LinkUpdate,
} from "@/lib/links";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitize(link: {
  slug: string;
  target_url: string;
  title: string | null;
  description: string | null;
  clicks: number;
  created_at: string;
  bio_enabled: boolean;
  bio_name: string | null;
  bio_tagline: string | null;
  bio_avatar: string | null;
  bio_links: Array<{ label: string; url: string }> | null;
}) {
  return {
    slug: link.slug,
    targetUrl: link.target_url,
    title: link.title,
    description: link.description,
    clicks: link.clicks,
    createdAt: link.created_at,
    bio: {
      enabled: link.bio_enabled,
      name: link.bio_name,
      tagline: link.bio_tagline,
      avatar: link.bio_avatar,
      links: link.bio_links ?? [],
    },
  };
}

function tokenFrom(body: unknown): string | null {
  const t = (body as { token?: unknown } | null)?.token;
  return typeof t === "string" && TOKEN_RE.test(t) ? t : null;
}

/** GET /api/manage?token=... — link + aggregated stats for the control room. */
export async function GET(req: Request) {
  const token = tokenFrom({ token: new URL(req.url).searchParams.get("token") });
  if (!token) return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });

  const link = await getLinkByToken(token);
  if (!link) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const stats = await getLinkStats(link.slug);
  return NextResponse.json({ link: sanitize(link), stats });
}

/** PATCH /api/manage — { token, update: { targetUrl?, bio? } } */
export async function PATCH(req: Request) {
  const gate = rateLimit(`manage:${clientIp(req)}`, 30, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Slow down." }, { status: 429 });

  let body: { token?: string; update?: Record<string, unknown> };
  try {
    body = (await req.json()) as { token?: string; update?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const token = tokenFrom(body);
  if (!token) return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });

  const link = await getLinkByToken(token);
  if (!link) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const u = body.update ?? {};
  const update: LinkUpdate = {};
  if (typeof u.targetUrl === "string") update.target_url = u.targetUrl;
  if (typeof u.bioEnabled === "string" || typeof u.bioEnabled === "boolean")
    update.bio_enabled = u.bioEnabled === true || u.bioEnabled === "true";
  if (u.bioName !== undefined) update.bio_name = (u.bioName as string) || null;
  if (u.bioTagline !== undefined) update.bio_tagline = (u.bioTagline as string) || null;
  if (typeof u.bioAvatar === "string") update.bio_avatar = u.bioAvatar;
  if (Array.isArray(u.bioLinks)) update.bio_links = u.bioLinks as Array<{ label: string; url: string }>;

  const result = await updateLink(link.slug, update);
  if (!result.ok) {
    const status = result.error === "invalid_url" ? 400 : 500;
    const message =
      result.error === "invalid_url" ? "That destination URL doesn't look valid." : "Update failed.";
    return NextResponse.json({ error: message }, { status });
  }

  const fresh = await getLinkByToken(token);
  return NextResponse.json({ link: fresh ? sanitize(fresh) : null });
}

/** DELETE /api/manage — { token } removes the link (slug becomes claimable again). */
export async function DELETE(req: Request) {
  const gate = rateLimit(`delete:${clientIp(req)}`, 5, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Slow down." }, { status: 429 });

  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const token = tokenFrom(body);
  if (!token) return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });

  const link = await getLinkByToken(token);
  if (!link) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const result = await deleteLink(link.slug);
  if (!result.ok) return NextResponse.json({ error: "Delete failed." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
