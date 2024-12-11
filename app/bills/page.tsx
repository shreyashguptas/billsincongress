import { BillsOverview } from '@/components/bills/bills-overview';
import { BillsHeader } from '@/components/bills/bills-header';

export default function BillsPage() {
  return (
    <div className="container space-y-8 px-4 py-8">
      <BillsHeader />
      <BillsOverview />
    </div>
  );
}