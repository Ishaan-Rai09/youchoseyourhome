export const BRAND_NAME = "Glowup";

/**
 * Host shown for branded links, e.g. "localhost:3000" in dev or the production
 * domain. Defaults to the live deployment so server-rendered text (API errors,
 * metadata, bot-facing pages) matches reality. The browser auto-detects the
 * host at runtime anyway; set NEXT_PUBLIC_BRAND_HOST to override.
 */
export const BRAND_HOST =
  process.env.NEXT_PUBLIC_BRAND_HOST || "glowup-theta-eight.vercel.app";

/** Display form of a branded link: "host/slug" (no scheme, like bit.ly displays). */
export function brandLink(slug: string): string {
  return `${BRAND_HOST}/${slug}`;
}
