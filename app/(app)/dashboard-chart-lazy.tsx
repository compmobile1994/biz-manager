'use client';

import dynamic from 'next/dynamic';

// Client-side wrapper that lazy-loads the actual Recharts chart.
// next/dynamic with ssr:false can only live inside a Client Component
// in Next.js 15 — that's why this wrapper exists, separate from the
// chart implementation. The Server Component dashboard imports this
// file, which can hold the dynamic() call legally.
const DashboardChart = dynamic(
  () => import('./dashboard-chart').then((m) => m.DashboardChart),
  {
    ssr: false,
    loading: () => <div className="h-72 w-full animate-pulse bg-muted/40 rounded-md" />,
  },
);

type Point = { label: string; income: number; expenses: number };

export function DashboardChartLazy({ data }: { data: Point[] }) {
  return <DashboardChart data={data} />;
}
