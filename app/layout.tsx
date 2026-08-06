import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/lib/auth-context";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { MonitoringInit } from "@/components/monitoring-init";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Firebase Auth initializes client-side per request; skip static
// prerendering so builds don't require Firebase env vars to be present.
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://breezify.vercel.app";
const TITLE = "Breezify: Build and ship apps with AI";
const DESCRIPTION =
  "Breezify turns a plain-English prompt into a production-ready app, deployed in seconds. No code required.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    // SVG first (crisp at any size in browsers that support it), .ico as
    // the universal fallback — a lot of tooling outside the browser itself
    // (link-preview crawlers, Vercel's own dashboard, bookmark managers)
    // only ever requests /favicon.ico by convention and ignores <link>
    // icon tags entirely, so without a real one at that exact path they'd
    // keep showing whatever they last cached before the Breezify rebrand.
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Breezify",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
        <MonitoringInit />
        <Analytics />
      </body>
    </html>
  );
}
