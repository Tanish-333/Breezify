export function BuilderMockup() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-muted/30 shadow-2xl shadow-black/50">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-3 rounded bg-background px-3 py-1 text-xs text-muted-foreground">
          habit-tracker-a4f2.vercel.app
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[280px_1fr]">
        <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Generated with Sonnet 4.5
          </div>
          <div className="space-y-2">
            <div className="h-2.5 w-[90%] rounded-full bg-border" />
            <div className="h-2.5 w-[70%] rounded-full bg-border" />
            <div className="h-2.5 w-[80%] rounded-full bg-border" />
          </div>
          <div className="mt-5 rounded-lg border border-border p-3">
            <div className="mb-2 h-2 w-1/3 rounded-full bg-border" />
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-border/70" />
              <div className="h-1.5 w-5/6 rounded-full bg-border/70" />
              <div className="h-1.5 w-2/3 rounded-full bg-border/70" />
            </div>
          </div>
          <div className="mt-4 flex h-8 w-full items-center justify-center rounded-lg bg-foreground text-xs font-medium text-background">
            Deploy
          </div>
        </div>
        <div className="p-6">
          <div className="mb-6 h-6 w-2/5 rounded bg-border" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="aspect-square rounded-lg border border-border bg-background" />
            ))}
          </div>
          <div className="mt-6 h-24 w-full rounded-lg border border-border bg-background" />
        </div>
      </div>
    </div>
  );
}
