import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div>
      <SiteHeader />
      <div className="container flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          This page doesn&apos;t exist
        </h1>
        <p className="max-w-md text-muted-foreground">
          The page you&apos;re looking for was moved, renamed, or never existed.
        </p>
        <Link href="/" className="mt-2">
          <Button>
            Back to home
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
