import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://feather-123.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/build/", "/dashboard", "/settings", "/billing"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
