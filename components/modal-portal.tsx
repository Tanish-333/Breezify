"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Mounts children directly on document.body instead of wherever the calling
 * component happens to sit in the tree. Every modal in this app is a `fixed
 * inset-0` overlay, which normally still respects z-index — but `position:
 * sticky` (the app-shell sidebar) or `position: fixed` ancestors ALWAYS
 * establish their own stacking context regardless of z-index value, per the
 * CSS spec. A modal rendered from a component nested inside one of those
 * (e.g. the feedback dialog, opened from the account menu at the bottom of
 * the sticky sidebar) gets trapped inside that ancestor's local stacking
 * context: it can end up painted, and clickable through, BEHIND a later
 * DOM sibling like the main content area, even at z-50 — the backdrop looks
 * like it's covering the page, but isn't actually capturing clicks there.
 * Portaling to document.body sidesteps the whole class of bug: the modal is
 * no longer a descendant of anything that could trap it.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
