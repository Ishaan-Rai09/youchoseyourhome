"use client";

import { useState } from "react";

/**
 * Avatar that falls back to a monogram when the image URL is broken,
 * blocked by the host, or simply not an image.
 */
export default function AvatarImage({
  src,
  alt,
  monogram,
}: {
  src: string;
  alt: string;
  monogram: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="font-mono text-2xl font-semibold text-muted">{monogram}</span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      className="h-full w-full object-cover"
    />
  );
}
