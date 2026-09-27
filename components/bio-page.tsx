import type { LinkRow } from "@/lib/supabase";
import { brandLink } from "@/lib/brand";

/**
 * Optional mini landing page shown at /<slug> instead of the instant redirect:
 * name, tagline and a curated list of the owner's links.
 */
export default function BioPage({ link }: { link: LinkRow }) {
  const name = link.bio_name ?? link.title ?? link.slug;
  const tagline = link.bio_tagline ?? link.description ?? "";
  const links = link.bio_links ?? [];

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-16 text-center">
      <div className="w-full max-w-md animate-fade-up">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
          {brandLink(link.slug)}
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{name}</h1>
        {tagline && (
          <p className="mt-3 text-sm leading-relaxed text-muted">{tagline}</p>
        )}

        <div className="mt-10 grid gap-2.5 text-left">
          {links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-3 rounded-lg border border-line bg-card px-4 py-3.5 transition hover:border-line-strong"
            >
              <span className="truncate text-sm font-medium">{l.label}</span>
              <span className="shrink-0 font-mono text-[11px] text-faint transition group-hover:text-foreground">
                open ↗
              </span>
            </a>
          ))}
        </div>

        {links.length === 0 && (
          <p className="mt-10 text-sm text-faint">This page is being set up.</p>
        )}

        {/* Escape hatch: some visitors want the destination immediately. */}
        <a
          href={link.target_url}
          className="mt-12 inline-block font-mono text-[11px] text-faint underline underline-offset-4 transition hover:text-muted"
        >
          skip → {link.target_url.replace(/^https?:\/\//, "")}
        </a>
      </div>
    </main>
  );
}
