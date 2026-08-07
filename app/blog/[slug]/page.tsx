import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Reveal } from "@/components/reveal";
import { BLOG_POSTS, getBlogPost } from "@/lib/blog";
import { formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getBlogPost(params.slug);
  if (!post) return { title: "Blog: Breezify" };
  return { title: `${post.title}: Breezify`, description: post.excerpt };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getBlogPost(params.slug);
  if (!post) notFound();

  return (
    <div>
      <SiteHeader />
      <section className="py-24">
        <div className="container max-w-2xl">
          <Reveal>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Blog
            </Link>
            <p className="mt-6 text-xs text-muted-foreground">{formatDate(post.date)}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{post.title}</h1>
          </Reveal>
          <Reveal delay={80} className="mt-8 space-y-5">
            {post.content.map((paragraph, i) => (
              <p key={i} className="leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </Reveal>
        </div>
      </section>
    </div>
  );
}
