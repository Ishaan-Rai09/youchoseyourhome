"use client";

import { useEffect } from "react";

/** Sends the visitor to the target after a short delay (bio pages with no links). */
export default function DelayedRedirect({
  target,
  delay = 2200,
}: {
  target: string;
  delay?: number;
}) {
  useEffect(() => {
    const t = setTimeout(() => window.location.replace(target), delay);
    return () => clearTimeout(t);
  }, [target, delay]);
  return null;
}
