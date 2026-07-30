"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { PLANS } from "@/lib/types";
import { CreditCard, LayoutGrid, LogOut, Settings, Sparkles } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "My Apps", icon: LayoutGrid },
  { href: "/build", label: "New App", icon: Sparkles },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();

  const lowCredits = profile !== null && profile.credits < 0.5;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link href="/dashboard" className="shrink-0">
            <Logo />
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {profile && (
              <Link
                href="/billing"
                className={cn(
                  "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors sm:flex",
                  lowCredits
                    ? "border-warning/40 text-warning hover:bg-warning/10"
                    : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                )}
                title={`${PLANS[profile.plan]?.name ?? "Free"} plan`}
              >
                <span className="font-medium">{profile.credits.toFixed(2)}</span>
                <span>credits</span>
              </Link>
            )}
            <button
              onClick={async () => {
                await signOut();
                router.push("/");
              }}
              className="flex h-9 w-9 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="container py-10">{children}</main>
    </div>
  );
}
