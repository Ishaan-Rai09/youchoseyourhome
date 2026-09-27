import * as cheerio from "cheerio";

export type SiteMetadata = {
  title: string | null;
  description: string | null;
  siteName: string | null;
  hostname: string | null;
};

/** Accept messy user input ("myapp.vercel.app") and return a clean absolute URL. */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes(".") || /\s/.test(u.hostname)) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function cut(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

function fallback(url: string): SiteMetadata {
  let hostname: string | null = null;
  try {
    hostname = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  return {
    title: hostname ? hostname.replace(/^www\./, "") : null,
    description: null,
    siteName: null,
    hostname,
  };
}

/** Best-effort scrape of og:title / title / og:description / og:site_name. */
export async function scrapeMetadata(url: string): Promise<SiteMetadata> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; PurlBot/1.0) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return fallback(url);

    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      cut($('meta[property="og:title"]').attr("content"), 120) ??
      cut($("title").first().text(), 120) ??
      cut($('meta[name="twitter:title"]').attr("content"), 120);

    const description =
      cut($('meta[property="og:description"]').attr("content"), 300) ??
      cut($('meta[name="description"]').attr("content"), 300) ??
      cut($('meta[name="twitter:description"]').attr("content"), 300);

    const siteName =
      cut($('meta[property="og:site_name"]').attr("content"), 60) ??
      cut($('meta[name="application-name"]').attr("content"), 60);

    let hostname: string | null = null;
    try {
      hostname = new URL(res.url || url).hostname;
    } catch {
      /* ignore */
    }

    return { title, description, siteName, hostname };
  } catch {
    return fallback(url);
  }
}
