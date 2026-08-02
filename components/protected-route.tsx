"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isUnverifiedEmailUser } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/login");
    else if (isUnverifiedEmailUser(user)) router.push("/verify-email");
  }, [loading, user, router]);

  if (loading || !user || isUnverifiedEmailUser(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
