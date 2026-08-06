"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Logo, BreezeMark } from "@/components/logo";
import { CommandPalette } from "@/components/command-palette";
import { AccountMenu } from "@/components/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { useUserApps } from "@/lib/use-apps";
import { cn } from "@/lib/utils";
import { PLANS } from "@/lib/types";
import {
  BarChart3,
  Clock,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  Plug,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Star,
  User,
  Users,
} from "lucide-react";

/** The dashboard's own app grid reads this from the URL (see app/dashboard/page.tsx) to decide which slice of the user's apps to show — one page, no route duplication. */
const PROJECTS_NAV = [
  { view: "all", label: "All projects", icon: FolderKanban },
  { view: "starred", label: "Starred", icon: Star },
  { view: "owned", label: "Owned by me", icon: User },
  { view: "shared", label: "Shared with me", icon: Users },
] as const;

const TOP_NAV = [
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/connectors", label: "Connectors", icon: Plug },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const ACCOUNT_NAV = [
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-all duration-200 ease-smooth",
        active
          ? "bg-muted font-medium text-foreground shadow-soft"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Deliberately NOT defaulting a missing param to "all" here — Dashboard
  // (the bare /dashboard, no view param) and "All projects" (?view=all)
  // render the exact same content, but need distinct active-highlight
  // states rather than both lighting up together.
  const activeView = pathname === "/dashboard" ? searchParams.get("view") : null;
  const isDashboardHome = pathname === "/dashboard" && activeView === null;
  const { user, profile } = useAuth();
  const { apps } = useUserApps(user?.uid);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Restore the collapsed preference so the layout doesn't reset every visit.
  useEffect(() => {
    setCollapsed(localStorage.getItem("feather:sidebar-collapsed") === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem("feather:sidebar-collapsed", prev ? "0" : "1");
      return !prev;
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Closing an already-open palette should always work (e.g. from its
        // own search input), but OPENING it while the user is mid-keystroke
        // in a text field (composing a prompt, typing in any input/textarea)
        // must not hijack that keystroke — it both swallows the character
        // and throws a full-screen modal over whatever they were typing,
        // which reads as "the prompt box stopped working."
        const target = e.target as HTMLElement | null;
        const isEditable =
          target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
        setPaletteOpen((o) => {
          if (!o && isEditable) return o;
          e.preventDefault();
          return !o;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lowCredits = profile !== null && profile.credits < 0.5;

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-muted/20 transition-[width] duration-200 md:flex",
          collapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center gap-2 px-3",
            collapsed && "justify-center px-0"
          )}
        >
          <Link href="/dashboard" className="flex items-center">
            {collapsed ? <BreezeMark className="h-5 w-5" /> : <Logo />}
          </Link>
          {!collapsed && (
            <div className="ml-auto flex items-center gap-0.5">
              <ThemeToggle className="h-7 w-7" />
              <button
                onClick={toggleCollapsed}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Collapse sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className={cn("px-2.5 pb-3", collapsed && "px-1.5")}>
          <AccountMenu collapsed={collapsed} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 pb-4">
          {collapsed && (
            <button
              onClick={toggleCollapsed}
              className="mb-1 flex w-full items-center justify-center rounded-md py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Expand sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}

          <NavLink
            href="/dashboard"
            label="Dashboard"
            icon={LayoutDashboard}
            collapsed={collapsed}
            active={isDashboardHome}
          />

          {TOP_NAV.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              collapsed={collapsed}
              active={pathname === item.href}
            />
          ))}

          <div className="pt-5">
            {!collapsed && (
              <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Projects
              </p>
            )}
            {PROJECTS_NAV.map((item) => (
              <NavLink
                key={item.view}
                href={`/dashboard?view=${item.view}`}
                label={item.label}
                icon={item.icon}
                collapsed={collapsed}
                active={activeView === item.view}
              />
            ))}
          </div>

          <NavLink
            href="/dashboard?view=recent"
            label="Recent"
            icon={Clock}
            collapsed={collapsed}
            active={activeView === "recent"}
          />

          <button
            onClick={() => setPaletteOpen(true)}
            title={collapsed ? "Search" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
              collapsed && "justify-center px-0"
            )}
          >
            <Search className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span>Search</span>
                <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
                  ⌘K
                </kbd>
              </>
            )}
          </button>

          <div className="pt-5">
            {!collapsed && (
              <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Account
              </p>
            )}
            {ACCOUNT_NAV.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                collapsed={collapsed}
                active={pathname === item.href}
              />
            ))}
          </div>
        </nav>

        <div className={cn("border-t border-border p-2.5 pb-4", collapsed && "px-1.5")}>
          {profile && !collapsed && (
            <Link
              href="/billing"
              className={cn(
                "mb-2 flex items-center justify-between rounded-md border px-2.5 py-2.5 text-xs transition-all duration-200 ease-smooth hover:shadow-soft",
                lowCredits
                  ? "border-warning/40 text-warning hover:bg-warning/10"
                  : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
              )}
            >
              <span>{PLANS[profile.plan]?.name ?? "Free"}</span>
              <span className="font-medium tabular-nums">
                {profile.credits.toFixed(2)}
              </span>
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile bar: the sidebar is hidden below md. */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
          <Link href="/dashboard">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {profile && (
              <Link
                href="/billing"
                className={cn(
                  "mr-1 flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium tabular-nums transition-colors",
                  lowCredits
                    ? "border-warning/40 text-warning hover:bg-warning/10"
                    : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                )}
                title={`${PLANS[profile.plan]?.name ?? "Free"} plan`}
              >
                {profile.credits.toFixed(2)}
              </Link>
            )}
            <ThemeToggle />
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Search"
            >
              <Search className="h-4 w-4" />
            </button>
            <Link
              href="/build"
              className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              title="New app"
            >
              <Plus className="h-4 w-4" />
            </Link>
            <div className="w-9">
              <AccountMenu collapsed />
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-8 md:px-10 md:py-10">{children}</main>

        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-5 py-4 text-xs text-muted-foreground md:px-10">
          <span>© {new Date().getFullYear()} Breezify. All rights reserved.</span>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
        </footer>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        apps={apps}
      />
    </div>
  );
}
