import { ImageResponse } from "next/og";
import { getLinkBySlug } from "@/lib/links";
import { brandLink } from "@/lib/brand";

export const alt = "Link preview card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Designed preview card shown when a branded link is shared in chats/X. */
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const link = await getLinkBySlug(slug);

  const title = link?.title ?? link?.bio_name ?? brandLink(slug);
  const host = link ? safeHost(link.target_url) : null;
  const display = title.length > 64 ? `${title.slice(0, 61)}…` : title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#08090a",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Top row: brand + slug chip */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#6b6e76",
            }}
          >
            GLOWUP
          </div>
          <div
            style={{
              display: "flex",
              padding: "14px 28px",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 12,
              fontSize: 30,
              color: "#ededf0",
            }}
          >
            {brandLink(slug)}
          </div>
        </div>

        {/* Title block */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 88,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              maxWidth: 1000,
            }}
          >
            {display}
          </div>
        </div>

        {/* Footer: destination */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 32,
            color: "#6b6e76",
          }}
        >
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#46a758" }} />
          <div style={{ display: "flex" }}>{host ? `opens ${host}` : "live link"}</div>
        </div>
      </div>
    ),
    size,
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
