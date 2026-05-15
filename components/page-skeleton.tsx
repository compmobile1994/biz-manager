// Reusable skeleton blocks for instant-loading states shown by Next.js
// loading.tsx files. They render synchronously so the user sees a page
// shape the moment they tap a link, instead of a blank screen while the
// server renders.

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted/60 rounded-md ${className}`} />;
}

export function SkeletonHeader() {
  return (
    <div className="space-y-2">
      <SkeletonBlock className="h-8 w-48" />
      <SkeletonBlock className="h-4 w-72" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <SkeletonBlock className="h-5 w-32" />
      <SkeletonBlock className="h-4 w-full" />
      <SkeletonBlock className="h-4 w-3/4" />
    </div>
  );
}

export function SkeletonListPage({ rows = 6 }: { rows?: number }) {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SkeletonHeader />
      <div className="border rounded-lg divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-3">
            <SkeletonBlock className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-3 w-48" />
            </div>
            <SkeletonBlock className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonFormPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <SkeletonHeader />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
