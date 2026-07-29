"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth-context";
import { cn, formatCredits } from "@/lib/utils";
import { LayoutGrid, Sparkles, Settings, LogOut } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "My Apps", icon: LayoutGrid },
  { href: "/build", label: "New App", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/dashboard">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-4">
            {profile && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {formatCredits(profile.credits)} credit
              </span>
            )}
            <button
              onClick={async () => {
                await signOut();
                router.push("/");
              }}
              className="flex h-9 w-9 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
