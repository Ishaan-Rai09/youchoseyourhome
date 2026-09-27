/** Lightweight visitor context parsing for click analytics. */

/** Host of the referring page, or null for direct/unknown. */
export function parseReferrer(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Coarse device class from the user-agent — no heavy UA parsing needed. */
export function parseDevice(ua: string | null): string | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobi|android|iphone/.test(s)) return "mobile";
  if (/bot|crawl|spider|slurp|preview|unfurl|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|discordbot|slackbot|embedly/.test(s))
    return "bot";
  return "desktop";
}

/**
 * Country from the x-vercel-ip-countryheader (present on Vercel), falling back
 * to Cloudflare's header. Null when absent (local dev).
 */
export function parseCountry(headers: Headers): string | null {
  return (
    headers.get("x-vercel-ip-country") ??
    headers.get("cf-ipcountry") ??
    null
  );
}
