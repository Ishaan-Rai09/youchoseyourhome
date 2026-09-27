import { NextResponse } from "next/server";
import { normalizeUrl, scrapeMetadata } from "@/lib/scrape";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** GET /api/metadata?url=... — fetch title/description/siteName for a deployed URL. */
export async function GET(req: Request) {
  const gate = rateLimit(`meta:${clientIp(req)}`, 20, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  const url = normalizeUrl(new URL(req.url).searchParams.get("url") ?? "");
  if (!url) {
    return NextResponse.json({ error: "Provide a valid url, e.g. my-app.vercel.app" }, { status: 400 });
  }

  const metadata = await scrapeMetadata(url);
  return NextResponse.json({ url, ...metadata });
}
