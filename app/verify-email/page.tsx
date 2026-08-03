"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmailVerification } from "firebase/auth";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { AlertTriangle, MailCheck } from "lucide-react";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user?.emailVerified) router.push("/dashboard");
  }, [loading, user, router]);

  async function resend() {
    if (!user) return;
    setSending(true);
    try {
      await sendEmailVerification(user);
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  async function checkVerified() {
    if (!user) return;
    setChecking(true);
    try {
      await user.reload();
      if (user.emailVerified) router.push("/dashboard");
    } finally {
      setChecking(false);
    }
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={`We sent a verification link to ${user?.email ?? "your email"}.`}
    >
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <MailCheck className="h-10 w-10 text-muted-foreground" strokeWidth={1.25} />
        <p className="text-sm text-muted-foreground">
          Click the link in that email, then continue below.
        </p>
        <div className="flex w-full items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-left text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Don&apos;t see it? <strong>Check your spam or junk folder</strong> (and Trash) — it
            sometimes lands there instead of your inbox.
          </span>
        </div>
        <div className="flex w-full flex-col gap-2.5">
          <Button className="w-full" onClick={checkVerified} loading={checking}>
            I&apos;ve verified, continue
          </Button>
          <Button className="w-full" variant="secondary" onClick={resend} loading={sending} disabled={sent}>
            {sent ? "Email sent" : "Resend email"}
          </Button>
          <Button className="w-full" variant="ghost" onClick={() => signOut().then(() => router.push("/"))}>
            Sign out
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
