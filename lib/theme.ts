"use client";

export type Theme = "dark" | "light";

const STORAGE_KEY = "feather:theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new Event("feather:theme-changed"));
}

/** Inlined into a <script> tag in the root layout so the class is set before
 * first paint, avoiding a flash of the wrong theme. Kept as a string (rather
 * than referencing the functions above) since it runs outside the bundle. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light")document.documentElement.classList.add("light");}catch(e){}})();`;
