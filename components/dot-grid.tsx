"use client";

import { useEffect, useRef } from "react";

/**
 * Full-viewport dot grid that brightens around the cursor — the Linear-style
 * ambient layer. Monochrome, pointer-transparent, and fully static when the
 * user prefers reduced motion.
 */
export default function DotGrid() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SPACING = 28;
    const RADIUS = 140;

    let raf = 0;
    let w = 0;
    let h = 0;
    const cursor = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (e: PointerEvent) => {
      cursor.tx = e.clientX;
      cursor.ty = e.clientY;
    };
    const onLeave = () => {
      cursor.tx = -9999;
      cursor.ty = -9999;
    };

    const draw = () => {
      // Ease the virtual cursor toward the real one for a smooth trail.
      cursor.x += (cursor.tx - cursor.x) * 0.14;
      cursor.y += (cursor.ty - cursor.y) * 0.14;

      ctx.clearRect(0, 0, w, h);
      for (let x = SPACING / 2; x < w; x += SPACING) {
        for (let y = SPACING / 2; y < h; y += SPACING) {
          const d = Math.hypot(x - cursor.x, y - cursor.y);
          let alpha = 0.05;
          let radius = 1;
          if (d < RADIUS) {
            const t = 1 - d / RADIUS;
            const ease = t * t;
            alpha = 0.05 + ease * 0.32;
            radius = 1 + ease * 0.9;
          }
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    resize();
    draw();

    if (!reduced) {
      window.addEventListener("pointermove", onMove);
      document.documentElement.addEventListener("mouseleave", onLeave);
    }
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
