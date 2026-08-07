import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Reveal } from "@/components/reveal";
import { BLOG_POSTS } from "@/lib/blog";
import { formatDate } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog: Breezify",
  description: "Notes on building and shipping apps with Breezify.",
};

export default function BlogIndexPage() {
  return (
    <div>
      <SiteHeader />
      <section className="border-b border-border py-24">
        <div className="container max-w-3xl">
          <Reveal className="mb-14">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Blog</h1>
            <p className="mt-3 text-muted-foreground">Notes on building and shipping apps with Breezify.</p>
          </Reveal>
          <div className="space-y-8">
            {BLOG_POSTS.map((post, i) => (
              <Reveal key={post.slug} delay={i * 80}>
                <Link href={`/blog/${post.slug}`} className="card-hover block rounded-lg border border-border bg-background p-7">
                  <p className="text-xs text-muted-foreground">{formatDate(post.date)}</p>
                  <h2 className="mt-2 text-xl font-medium">{post.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
                    Read more
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
