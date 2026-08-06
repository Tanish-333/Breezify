import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: "hsl(var(--success))",
        error: "hsl(var(--error))",
        warning: "hsl(var(--warning))",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        lg: "10px",
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        // A restrained, layered elevation scale — real shadows rather than
        // the flat border-only look everything used before, but still soft
        // and low-contrast enough to fit a mostly-monochrome UI.
        soft: "0 1px 2px hsl(var(--foreground) / 0.04), 0 8px 24px -12px hsl(var(--foreground) / 0.12)",
        elevated: "0 4px 12px hsl(var(--foreground) / 0.06), 0 16px 40px -16px hsl(var(--foreground) / 0.18)",
        glow: "0 0 0 1px hsl(var(--border)), 0 20px 60px -20px hsl(var(--foreground) / 0.25)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
