"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ModalPortal } from "@/components/modal-portal";
import type { FeatherApp } from "@/lib/types";
import {
  CreditCard,
  FolderOpen,
  HelpCircle,
  LayoutGrid,
  LayoutTemplate,
  Plus,
  Search,
  Settings,
} from "lucide-react";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  apps,
}: {
  open: boolean;
  onClose: () => void;
  apps: FeatherApp[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      onClose();
      router.push(href);
    };
    const nav: Item[] = [
      { id: "nav-dashboard", label: "Dashboard", icon: LayoutGrid, run: go("/dashboard") },
      { id: "nav-templates", label: "Templates", icon: LayoutTemplate, run: go("/templates") },
      { id: "nav-build", label: "New app", icon: Plus, run: go("/build") },
      { id: "nav-billing", label: "Billing", icon: CreditCard, run: go("/billing") },
      { id: "nav-settings", label: "Settings", icon: Settings, run: go("/settings") },
      { id: "nav-help", label: "Help", icon: HelpCircle, run: go("/help") },
    ];
    const appItems: Item[] = apps.map((a) => ({
      id: `app-${a.id}`,
      label: a.name,
      hint: "App",
      icon: FolderOpen,
      run: go(`/build/${a.id}`),
    }));
    return [...nav, ...appItems];
  }, [apps, router, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      // Focus after the dialog paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  // Keep the highlighted row in view when navigating with the keyboard.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[index]?.run();
    }
  }

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-2xl animate-in"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps and pages"
            className="h-12 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                data-idx={i}
                onMouseEnter={() => setIndex(i)}
                onClick={item.run}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  i === index ? "bg-muted text-foreground" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {item.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
