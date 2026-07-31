import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="dot-grid relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <ThemeToggle className="absolute right-4 top-4" />
      <Link href="/" className="mb-8">
        <Logo className="text-lg" />
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-8 animate-in">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
