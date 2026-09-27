export const BRAND_NAME = "Purl";

/**
 * Host shown for branded links, e.g. "localhost:3000" in dev or your deployed
 * domain in production. Set NEXT_PUBLIC_BRAND_HOST after deploying so
 * server-rendered text (API errors, metadata) matches reality.
 */
export const BRAND_HOST = process.env.NEXT_PUBLIC_BRAND_HOST || "localhost:3000";

/** Display form of a branded link: "host/slug" (no scheme, like bit.ly displays). */
export function brandLink(slug: string): string {
  return `${BRAND_HOST}/${slug}`;
}
