import { notFound } from 'next/navigation';
import { mockBills } from '@/lib/mock-data';
import { BillHeader } from '@/components/bills/bill-header';
import { BillProgressCard } from '@/components/bills/bill-progress-card';
import { BillContentTabs } from '@/components/bills/bill-content-tabs';
import { BillSponsors } from '@/components/bills/bill-sponsors';
import { BillCommittees } from '@/components/bills/bill-committees';
import { BillRelated } from '@/components/bills/bill-related';

interface BillPageProps {
  params: {
    id: string;
  };
}

export function generateStaticParams() {
  return mockBills.map((bill) => ({
    id: bill.id,
  }));
}

export default function BillPage({ params }: BillPageProps) {
  const bill = mockBills.find((b) => b.id === params.id);

  if (!bill) {
    notFound();
  }

  return (
    <div className="container px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <BillHeader bill={bill} />
          <BillProgressCard bill={bill} />
          <BillContentTabs bill={bill} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <BillSponsors bill={bill} />
          <BillCommittees />
          <BillRelated />
        </div>
      </div>
    </div>
  );
}