import { BillsOverview } from '@/components/bills/bills-overview';
import { BillsHeader } from '@/components/bills/bills-header';

export default function BillsPage() {
  return (
    <div className="w-full bg-background">
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="mx-auto max-w-[1200px] space-y-8">
          <BillsHeader />
          <BillsOverview />
        </div>
      </div>
    </div>
  );
}