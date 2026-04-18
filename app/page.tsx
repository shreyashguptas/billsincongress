'use client';

import dynamic from 'next/dynamic';

const DashboardClient = dynamic(
  () => import('./components/dashboard/DashboardClient'),
  { ssr: false, loading: () => <LoadingState /> }
);

function LoadingState() {
  return (
    <div className="container-editorial py-16 sm:py-24">
      <div className="space-y-3">
        <div className="h-3 w-32 bg-secondary rounded-sm animate-pulse" />
        <div className="h-12 w-3/4 bg-secondary rounded-sm animate-pulse" />
        <div className="h-4 w-1/2 bg-secondary rounded-sm animate-pulse" />
      </div>
    </div>
  );
}

export default function Home() {
  return <DashboardClient />;
}
