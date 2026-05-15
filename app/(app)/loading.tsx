import { SkeletonHeader, SkeletonCard } from '@/components/page-skeleton';
// Dashboard / home skeleton — shown while the server fetches stats.
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SkeletonHeader />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard />
    </div>
  );
}
