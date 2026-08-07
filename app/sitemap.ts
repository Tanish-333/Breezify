import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { BLOG_POSTS } from "@/lib/blog";

const SITE_URL = getAppBaseUrl();

// A fixed date rather than `new Date()` — the latter reports every route as
// "just changed" on every crawl, which is misleading to crawlers and can
// waste crawl budget rather than help it.
const LAST_MODIFIED = new Date("2026-08-06");

const ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/login", priority: 0.3, changeFrequency: "yearly" },
  { path: "/signup", priority: 0.5, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/blog", priority: 0.4, changeFrequency: "weekly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency,
    priority,
  }));
  const postEntries = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.3,
  }));
  return [...staticEntries, ...postEntries];
}
