"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
  // Starts "dark" to match the server-rendered markup, then syncs to the
  // stored preference once mounted (the inline script in layout.tsx already
  // set the class itself, so there's no flash either way).
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
