"use client";

import { useEffect, useRef } from "react";

/** Client-rendered QR code (dark modules on a white chip for scannability). */
export default function QrCode({
  text,
  size = 150,
}: {
  text: string;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QR = (await import("qrcode")).default;
      if (!ref.current || cancelled) return;
      await QR.toCanvas(ref.current, text, {
        width: size * 2, // render 2x, display at size for crisp retina
        margin: 1,
        color: { dark: "#0a0a0a", light: "#ffffff" },
      });
      ref.current.style.width = `${size}px`;
      ref.current.style.height = `${size}px`;
    })().catch(() => {
      /* QR rendering is best-effort */
    });
    return () => {
      cancelled = true;
    };
  }, [text, size]);

  return (
    <span className="inline-flex rounded-lg bg-white p-2.5">
      <canvas ref={ref} aria-label={`QR code for ${text}`} />
    </span>
  );
}
