import { headers } from "next/headers";
import { getAdminClient, isDbConfigured } from "./supabase";
import { parseCountry, parseDevice, parseReferrer } from "./analytics";
import { encrypt } from "./crypto";

type HeaderLike = { get(name: string): string | null };

/**
 * Fire-and-forget click recording for the redirect page. Only counts real
 * document navigations (skips RSC prefetches), best-effort on any error.
 */
export async function recordVisit(slug: string): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    const h: HeaderLike = await headers();

    // Skip Next.js prefetch requests — those aren't real visits.
    const mode = h.get("sec-fetch-mode");
    if (mode && mode !== "navigate") return;

    // Analytics are stored encrypted: the DB never sees who sent whom.
    const referrer = parseReferrer(h.get("referer"));
    const country = parseCountry(h as Headers);
    const device = parseDevice(h.get("user-agent"));

    void getAdminClient()
      .rpc("record_click", {
        p_slug: slug,
        p_referrer: referrer ? encrypt(referrer) : null,
        p_country: country ? encrypt(country) : null,
        p_device: device ? encrypt(device) : null,
      })
      .then(undefined, () => {
        /* analytics must never break a redirect */
      });
  } catch {
    /* ditto */
  }
}
