import type { LinkRow } from "@/lib/supabase";
import { brandLink } from "@/lib/brand";
import CopyChip from "@/components/copy-chip";

/**
 * Optional mini landing page shown at /<slug> instead of the instant redirect:
 * avatar, name, tagline and a curated list of the owner's links.
 */
export default function BioPage({ link }: { link: LinkRow }) {
  const name = link.bio_name ?? link.title ?? link.slug;
  const tagline = link.bio_tagline ?? link.description ?? "";
  const avatar = link.bio_avatar;
  const links = (link.bio_links ?? []).slice(0, 8);
  const monogram = name.trim().slice(0, 1).toUpperCase() || "#";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        {/* Card with subtle dot texture */}
        <div
          className="animate-fade-up rounded-2xl border border-line bg-card px-6 py-10 text-center sm:px-10"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          {/* Avatar */}
          <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full border border-line-strong bg-background">
            {avatar ? (
              <div
                className="h-full w-full"
                style={{
                  backgroundImage: `url(${avatar})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                role="img"
                aria-label={`${name} avatar`}
              />
            ) : (
              <span className="font-mono text-2xl font-semibold text-muted">
                {monogram}
              </span>
            )}
          </div>

          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
            {brandLink(link.slug)}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{name}</h1>
          {tagline && (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
              {tagline}
            </p>
          )}

          {/* Links — first as primary CTA, rest as rows */}
          <div className="mt-8 space-y-2.5 text-left">
            {links.map((l, i) =>
              i === 0 ? (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="animate-fade-up flex items-center justify-between gap-3 rounded-lg bg-foreground px-5 py-3.5 transition hover:opacity-85"
                  style={{ animationDelay: "120ms" }}
                >
                  <span className="truncate text-sm font-semibold text-background">
                    {l.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-background/70">
                    open ↗
                  </span>
                </a>
              ) : (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="animate-fade-up group flex items-center justify-between gap-3 rounded-lg border border-line bg-background px-4 py-3.5 transition hover:border-line-strong"
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 font-mono text-[10px] text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate text-sm font-medium">{l.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-faint transition group-hover:text-foreground">
                    open ↗
                  </span>
                </a>
              ),
            )}
          </div>

          {links.length === 0 && (
            <p className="mt-8 text-sm text-faint">
              No links yet — the owner is still setting this up.
            </p>
          )}
        </div>

        {/* Footer: escape hatch + copy + brand */}
        <div className="animate-fade-up mt-6 flex flex-col items-center gap-3" style={{ animationDelay: "300ms" }}>
          <a
            href={link.target_url}
            className="max-w-full truncate font-mono text-[11px] text-faint underline underline-offset-4 transition hover:text-muted"
          >
            skip → {link.target_url.replace(/^https?:\/\//, "")}
          </a>
          <div className="flex items-center gap-4">
            <CopyChip text={`https://${brandLink(link.slug)}`} />
            <span className="font-mono text-[10px] text-faint">
              made with <span className="text-muted">glowup</span>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
