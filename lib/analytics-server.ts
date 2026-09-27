import { headers } from "next/headers";
import { getAdminClient, isDbConfigured } from "./supabase";
import { parseCountry, parseDevice, parseReferrer } from "./analytics";

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

    void getAdminClient()
      .rpc("record_click", {
        p_slug: slug,
        p_referrer: parseReferrer(h.get("referer")),
        p_country: parseCountry(h as Headers),
        p_device: parseDevice(h.get("user-agent")),
      })
      .then(undefined, () => {
        /* analytics must never break a redirect */
      });
  } catch {
    /* ditto */
  }
}
