"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { PLANS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SupportDialog } from "@/components/support-dialog";
import { CreditCard, LogIn, LogOut, MessageSquare, Settings, ChevronsUpDown } from "lucide-react";

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Signed out (or still resolving the session): offer the way in rather
  // than rendering nothing.
  if (!user) {
    if (collapsed) {
      return (
        <Link
          href="/login"
          title="Log in"
          className="flex h-8 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogIn className="h-4 w-4" />
        </Link>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <Link href="/login" className="flex-1">
          <Button variant="secondary" size="sm" className="w-full">
            Log in
          </Button>
        </Link>
        <Link href="/signup" className="flex-1">
          <Button size="sm" className="w-full">
            Sign up
          </Button>
        </Link>
      </div>
    );
  }

  const label = user.displayName || user.email?.split("@")[0] || "Account";
  const planName = profile ? PLANS[profile.plan]?.name ?? "Free" : "";

  const avatar = (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-[10px] font-semibold text-background">
      {user.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(user.displayName, user.email)
      )}
    </span>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={collapsed ? label : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
          collapsed && "justify-center px-0"
        )}
      >
        {avatar}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{label}</span>
              {planName && (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {planName} plan
                </span>
              )}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-border bg-background p-1 shadow-xl">
          <div className="border-b border-border px-2.5 py-2">
            <p className="truncate text-sm font-medium">{label}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
            {profile && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {profile.credits.toFixed(2)}
                </span>{" "}
                credits on {planName}
              </p>
            )}
          </div>

          <Link
            href="/billing"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <CreditCard className="h-4 w-4" />
            Billing
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              setSupportOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MessageSquare className="h-4 w-4" />
            Send feedback
          </button>
          <button
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.push("/");
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}

      {supportOpen && <SupportDialog onClose={() => setSupportOpen(false)} />}
    </div>
  );
}
