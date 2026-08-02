"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { OAuthButtons } from "@/components/oauth-buttons";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useAuth, isUnverifiedEmailUser } from "@/lib/auth-context";
import { friendlyAuthError } from "@/lib/auth-errors";
import { AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { user, signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (isUnverifiedEmailUser(user)) {
      router.push("/verify-email");
      return;
    }
    const hasPendingPrompt = sessionStorage.getItem("feather:pending-prompt");
    router.push(hasPendingPrompt ? "/build" : "/dashboard");
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const signedInUser = await signInWithEmail(email, password);
      router.push(isUnverifiedEmailUser(signedInUser) ? "/verify-email" : "/dashboard");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue building."
      footer={
        <span>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Sign up
          </Link>
        </span>
      }
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <OAuthButtons onError={setError} />
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        OR
        <div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="mb-1.5 text-xs text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
