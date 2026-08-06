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
  // Every icon here except favicon.ico itself is named with a "-v2" suffix,
  // not just a query string: browsers cache a favicon by its exact URL,
  // essentially forever, largely ignoring cache-control headers for it —
  // and some browsers additionally auto-probe the literal /favicon.ico path
  // directly regardless of <link> tags, a request they'd already cached
  // from before this logo existed, unaffected by a query-string change on
  // the <link> entry. A genuinely new filename is the one thing guaranteed
  // to be a cache miss everywhere. favicon.ico itself is left unrenamed on
  // purpose — something has to keep answering that literal legacy path for
  // browsers/crawlers that check it with no <link> tag involved at all, so
  // its *contents* were updated in place instead. Bump "-v2" to "-v3" (and
  // rename the files) if these icons ever need to change again.
  icons: {
    icon: [
      { url: "/favicon-v2.svg", type: "image/svg+xml" },
      { url: "/favicon-v2-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-v2-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon-v2.png",
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
