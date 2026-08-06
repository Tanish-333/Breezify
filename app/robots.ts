import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/app-base-url";

const SITE_URL = getAppBaseUrl();

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
