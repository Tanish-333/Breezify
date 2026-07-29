"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GoogleIcon, GithubIcon, AppleIcon } from "@/components/oauth-icons";
import { useAuth } from "@/lib/auth-context";
import { friendlyAuthError } from "@/lib/auth-errors";

export function OAuthButtons({ onError }: { onError: (msg: string) => void }) {
  const { signInWithGoogle, signInWithGithub, signInWithApple } = useAuth();
  const [pending, setPending] = useState<string | null>(null);

  async function handle(provider: "google" | "github" | "apple") {
    setPending(provider);
    onError("");
    try {
      if (provider === "google") await signInWithGoogle();
      if (provider === "github") await signInWithGithub();
      if (provider === "apple") await signInWithApple();
    } catch (err) {
      onError(friendlyAuthError(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2.5">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={pending === "google"}
        onClick={() => handle("google")}
      >
        {pending !== "google" && <GoogleIcon />}
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={pending === "github"}
        onClick={() => handle("github")}
      >
        {pending !== "github" && <GithubIcon />}
        Continue with GitHub
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={pending === "apple"}
        onClick={() => handle("apple")}
      >
        {pending !== "apple" && <AppleIcon />}
        Continue with Apple
      </Button>
    </div>
  );
}
