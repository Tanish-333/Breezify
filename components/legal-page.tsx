import { SiteHeader } from "@/components/site-header";
import Link from "next/link";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <SiteHeader />
      <div className="container max-w-3xl py-16">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
        <div className="prose-legal mt-10 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </div>
        <p className="mt-12 text-sm text-muted-foreground">
          Questions? Visit{" "}
          <Link href="/help" className="text-foreground hover:underline">
            Help
          </Link>
          , or see our other policies:{" "}
          <Link href="/terms" className="text-foreground hover:underline">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="text-foreground hover:underline">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
