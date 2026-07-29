const KEY = "feather:pending-prompt";

export function setPendingPrompt(prompt: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, prompt);
}

export function takePendingPrompt(): string | null {
  if (typeof window === "undefined") return null;
  const val = sessionStorage.getItem(KEY);
  if (val) sessionStorage.removeItem(KEY);
  return val;
}
