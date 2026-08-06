"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades + slides a section's content in once it scrolls into view (see the
 * .reveal / .reveal-visible pair in globals.css). Flips once and stays —
 * scrolling back up and down again doesn't re-hide it, which would feel
 * like the page is fighting the user rather than welcoming them down it.
 * Respects prefers-reduced-motion by skipping straight to visible (also
 * handled in CSS as a fallback for the split second before this effect
 * runs).
 */
export function Reveal({
  children,
  className,
  /** Stagger multiple Reveals in the same group (e.g. cards in a grid) by giving each an increasing delay, in ms. */
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", visible && "reveal-visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
