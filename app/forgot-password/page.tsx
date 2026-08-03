"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { friendlyAuthError } from "@/lib/auth-errors";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to reset it."
      footer={
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded border border-success/30 bg-success/5 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Check {email} for a link to reset your password.</span>
          </div>
          <div className="flex items-start gap-2 rounded border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Don&apos;t see it? <strong>Check your spam or junk folder</strong> (and Trash).
            </span>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
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
            <Button type="submit" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
