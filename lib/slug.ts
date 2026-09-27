export const SLUG_FORMAT_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

/** Slugs we never hand out because they collide with app routes / infra paths. */
export const RESERVED_SLUGS = new Set([
  "www", "api", "app", "p", "admin", "about", "blog", "help", "docs", "status",
  "pricing", "login", "signup", "signin", "register", "settings", "dashboard",
  "account", "profile", "privacy", "terms", "contact", "support", "faq",
  "careers", "team", "mail", "email", "webmail", "ftp", "ns1", "ns2", "cdn",
  "assets", "static", "images", "media", "security", "legal", "new", "latest",
  "explore", "search", "redirect", "go", "r", "s", "link", "links", "url",
  "urls", "short", "to", "at", "now", "home", "index", "main", "root", "demo",
  "test", "staging", "dev", "beta", "alpha", "null", "undefined", "_next",
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return SLUG_FORMAT_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "are", "our", "this", "that",
  "from", "into", "onto", "have", "has", "was", "were", "will", "can", "get",
  "got", "just", "about", "more", "most", "best", "top", "how", "why", "what",
  "who", "when", "where", "all", "any", "but", "not", "out", "use", "using",
  "used", "make", "makes", "made", "here", "there", "their", "them", "they",
  "its", "one", "two", "also", "very", "app", "apps", "website", "websites",
  "site", "sites", "page", "pages", "web", "online", "welcome", "home",
  "homepage", "official", "com", "www", "http", "https", "based", "build",
  "built", "helps", "helping", "let", "lets", "like",
]);

/** Extract the most meaningful lowercase keyword tokens from free text. */
export function keywordsFrom(text: string, max = 4): string[] {
  const words = slugify(text).split("-").filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w) || w.length < 3 || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

export type SlugSource = {
  title?: string | null;
  siteName?: string | null;
  description?: string | null;
  userDescription?: string | null;
  hostname?: string | null;
};

/**
 * No-AI fallback: derive brandable slugs from the site title, hostname and
 * the user's own description of the brand.
 */
export function heuristicSlugs(src: SlugSource, limit = 8): string[] {
  const out: string[] = [];
  const push = (raw: string | undefined) => {
    if (!raw) return;
    const slug = raw.slice(0, 50).replace(/-+$/g, "");
    if (isValidSlug(slug) && !out.includes(slug)) out.push(slug);
  };

  const brand =
    slugify(src.siteName ?? "") ||
    slugify(src.title ?? "") ||
    slugify((src.hostname ?? "").replace(/^www\./, "").split(".")[0] ?? "");

  if (brand) {
    push(brand);
    push(`${brand}-app`);
    push(`${brand}-hq`);
    push(`${brand}-site`);
    push(`get-${brand}`);
    push(`${brand}-live`);
  }

  // The user's own description wins — it's what they say the brand is about.
  for (const text of [src.userDescription, src.description]) {
    if (!text) continue;
    const kw = keywordsFrom(text, 4);
    if (kw.length >= 3) push(kw.slice(0, 3).join("-"));
    if (kw.length >= 2) push(kw.slice(0, 2).join("-"));
    if (kw.length >= 1 && brand) push(`${brand}-${kw[0]}`);
    if (out.length >= limit) break;
  }

  return out.slice(0, limit);
}
