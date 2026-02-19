'use client';

import dynamic from 'next/dynamic';

const DashboardClient = dynamic(
  () => import('./components/dashboard/DashboardClient'),
  { ssr: false, loading: () => <LoadingState /> }
);

function LoadingState() {
  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[#c9a227] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-[#94a3b8] font-serif text-xl">Loading Congressional Intelligence...</p>
      </div>
    </div>
  );
}

export default function Home() {
  return <DashboardClient />;
}
