import { NextResponse } from "next/server";
import { getLinkByToken } from "@/lib/links";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/manage/check — { tokens: [...] } → which links still exist.
 * Tokens travel in the request body (never in URLs, which end up in logs).
 */
export async function POST(req: Request) {
  const gate = rateLimit(`check:${clientIp(req)}`, 30, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Slow down." }, { status: 429 });

  let body: { tokens?: unknown };
  try {
    body = (await req.json()) as { tokens?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const tokens = Array.isArray(body.tokens)
    ? body.tokens.filter((t): t is string => typeof t === "string" && TOKEN_RE.test(t)).slice(0, 50)
    : [];

  const results = await Promise.all(
    tokens.map(async (token) => {
      const link = await getLinkByToken(token);
      return link ? { token, slug: link.slug, clicks: link.clicks } : { token, slug: null };
    }),
  );

  return NextResponse.json({ results });
}
