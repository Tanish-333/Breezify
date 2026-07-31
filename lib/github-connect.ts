"use client";

/**
 * Stores the GitHub OAuth access token obtained by connecting a GitHub
 * account (see connectGithub() in auth-context.tsx), the same way BYOK
 * provider keys are handled: kept in the browser only, sent with individual
 * push requests, never written to Firestore or any server-side store.
 */

const STORAGE_KEY = "feather:github-token";

export function getGithubToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setGithubToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, token);
  window.dispatchEvent(new Event("feather:github-connected"));
}

export function hasGithubToken(): boolean {
  return getGithubToken().length > 0;
}

export function clearGithubToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("feather:github-connected"));
}
