import type { Metadata } from "next";
import Link from "next/link";
import AutoRedirect from "@/components/auto-redirect";
import BioPage from "@/components/bio-page";
import { getLinkBySlug } from "@/lib/links";
import { recordVisit } from "@/lib/analytics-server";
import { brandLink } from "@/lib/brand";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/**
 * The branded URL. Server-rendered so link unfurlers (WhatsApp, Slack, X,
 * iMessage) see the site's real title/description under the pretty address,
 * while human visitors are redirected to the actual deployment.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const link = await getLinkBySlug(slug);

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
      images: [`/${slug}/opengraph-image`],
    },
  };
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params;

  // Fire-and-forget analytics: referrer, country, device class.
  void recordVisit(slug);

  const link = await getLinkBySlug(slug);

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

  if (link.bio_enabled) {
    return <BioPage link={link} />;
  }

  const displayTitle = link.title ?? link.slug;
  return <AutoRedirect target={link.target_url} title={displayTitle} />;
}
