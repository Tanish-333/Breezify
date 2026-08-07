"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Ties a section's entrance directly to scroll position rather than a
 * one-shot "is it visible yet" toggle: as the element travels up through
 * the bottom third of the viewport, it continuously tilts/scales/rises
 * into its resting state in lockstep with the scroll — not a fixed-
 * duration animation that starts once IntersectionObserver fires, an
 * actual function of how far you've scrolled it into view. Once it
 * reaches its resting state it holds there; only the entrance is
 * animated, so scrolling back up past something you've already seen
 * doesn't un-reveal it and fight you on the way back down.
 *
 * `delay` staggers siblings that sit at the same scroll position (cards
 * in the same grid row all have the same rect.top, so without this
 * they'd animate in perfect unison) by shifting how much additional
 * scroll that item needs before it starts catching up — not a CSS
 * transition-delay, since the driving value here is a per-frame scroll
 * position, not a CSS class flip.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      doneRef.current = true;
      return;
    }

    let raf = 0;
    function update() {
      raf = 0;
      if (!el || doneRef.current) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // delay (ms) is repurposed as extra scroll distance an item needs
      // before it starts catching up to its siblings — purely a stagger
      // knob, not a real time unit.
      const effectiveTop = rect.top + delay * 0.5;
      // Starts animating once the element's top crosses 92% down the
      // viewport, finishes once it reaches 62% up — wide enough to read
      // as real motion instead of popping in right at the trigger edge.
      const start = vh * 0.92;
      const end = vh * 0.62;
      const raw = (start - effectiveTop) / (start - end);
      let clamped = Math.min(1, Math.max(0, raw));

      // An element sitting close enough to the true bottom of the page
      // (the footer, or whatever the last section happens to be) may
      // never satisfy the band above at all — the page simply can't be
      // scrolled far enough past it for rect.top to cross `end`, since
      // scrolling is clamped at the document's actual max. Without this,
      // it would sit stuck at partial opacity forever once you've hit the
      // bottom of the page. Once at max scroll, anything already at least
      // partly visible counts as fully arrived.
      const doc = document.documentElement;
      const atPageBottom = window.scrollY + vh >= doc.scrollHeight - 2;
      if (atPageBottom && rect.top < vh) clamped = 1;

      setProgress(clamped);
      if (clamped >= 1) doneRef.current = true;
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [delay]);

  return (
    <div
      ref={ref}
      className={cn("reveal-3d", className)}
      style={{
        opacity: progress,
        transform: `perspective(1200px) translateY(${(1 - progress) * 48}px) scale(${0.92 + progress * 0.08}) rotateX(${(1 - progress) * 10}deg)`,
      }}
    >
      {children}
    </div>
  );
}
