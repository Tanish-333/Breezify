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
  // Google Search and most non-Chromium browsers/crawlers still don't
  // resolve an SVG-only favicon — /favicon.ico and a PNG are what actually
  // show up in search results and browser tabs; the SVG stays first for
  // browsers that do support it (sharper on high-DPI displays).
  //
  // The ?v= query string on every URL below matters more than it looks:
  // browsers cache a favicon by its exact URL, essentially forever, and
  // largely ignore normal cache-control headers for it — replacing the
  // FILE at the same path (which is what happened here, swapping in the
  // current black-badge/white-wave logo) doesn't reliably make already-
  // visited browsers pick up the change. Bumping this version string forces
  // every browser to treat it as a new resource. Bump it again any time
  // these icon files themselves change in the future.
  icons: {
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/favicon-32.png?v=2", type: "image/png", sizes: "32x32" },
      { url: "/favicon-192.png?v=2", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico?v=2",
    apple: "/apple-touch-icon.png?v=2",
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
