import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://feather-123.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/login", "/signup", "/terms", "/privacy"];
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
  }));
}
