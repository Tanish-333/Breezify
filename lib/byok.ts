"use client";

import type { Provider } from "@/lib/types";

/**
 * "Bring your own key" storage.
 *
 * Keys are kept in the browser's localStorage and sent with the individual
 * generation request that uses them. Feather never writes a provider key to
 * Firestore or any server-side store, which means we hold no secret at rest.
 * The tradeoff is that keys don't sync across devices, which the settings UI
 * states plainly.
 */

const KEY_PREFIX = "feather:byok:";
const ENABLED_KEY = "feather:byok:enabled";

export function getApiKey(provider: Provider): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY_PREFIX + provider) ?? "";
}

export function setApiKey(provider: Provider, key: string) {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(KEY_PREFIX + provider, trimmed);
  else localStorage.removeItem(KEY_PREFIX + provider);
  window.dispatchEvent(new Event("feather:byok-changed"));
}

export function hasApiKey(provider: Provider): boolean {
  return getApiKey(provider).length > 0;
}

/** Whether the user wants their own keys used when one is available. */
export function isByokEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ENABLED_KEY) === "1";
}

export function setByokEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new Event("feather:byok-changed"));
}

/** The key to send for a provider, or "" to use Feather's own credits. */
export function keyForRequest(provider: Provider): string {
  if (!isByokEnabled()) return "";
  return getApiKey(provider);
}

/** Only shows enough of the key to recognize it. */
export function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(12)}${key.slice(-4)}`;
}
