import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Firebase Auth initializes client-side per request; skip static
// prerendering so builds don't require Firebase env vars to be present.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feather — Build and ship apps with AI",
  description:
    "Feather turns a plain-English prompt into a production-ready app, deployed in seconds. No code required.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
