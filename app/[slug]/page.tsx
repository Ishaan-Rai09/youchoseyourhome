import type { Metadata } from "next";
import Link from "next/link";
import AutoRedirect from "@/components/auto-redirect";
import { getAdminClient, isDbConfigured } from "@/lib/supabase";
import { brandLink } from "@/lib/brand";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function fetchLink(slug: string) {
  if (!isDbConfigured()) return null;
  const { data } = await getAdminClient()
    .from("links")
    .select("slug, target_url, title, description")
    .eq("slug", slug)
    .maybeSingle();
  return data as
    | { slug: string; target_url: string; title: string | null; description: string | null }
    | null;
}

/**
 * The branded URL. Server-rendered so link unfurlers (WhatsApp, Slack, X,
 * iMessage) see the site's real title/description under the pretty address,
 * while human visitors are redirected to the actual deployment.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const link = await fetchLink(slug);

  if (!link) {
    return { title: `${brandLink(slug)} — not claimed yet`, robots: { index: false } };
  }

  const title = link.title ?? brandLink(link.slug);
  return {
    title,
    description: link.description ?? `Visit ${title}`,
    robots: { index: false }, // the destination site owns the SEO
    openGraph: {
      title,
      description: link.description ?? undefined,
      url: link.target_url,
    },
  };
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params;
  const link = await fetchLink(slug);

  // Fire-and-forget click tracking.
  if (link && isDbConfigured()) {
    void getAdminClient()
      .rpc("increment_clicks", { p_slug: link.slug })
      .then(undefined, (err: unknown) => console.error("[click]", err));
  }

  if (!link) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-md animate-fade-up rounded-lg border border-line bg-card p-8">
          <p className="font-mono text-[13px] text-muted">{brandLink(slug)}</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            This link is still open
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Nobody has claimed it yet. Grab it before someone else does.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-md bg-foreground px-6 py-2.5 text-[13px] font-semibold text-background transition hover:opacity-85"
          >
            Claim it →
          </Link>
        </div>
      </main>
    );
  }

  const displayTitle = link.title ?? link.slug;
  return <AutoRedirect target={link.target_url} title={displayTitle} />;
}
