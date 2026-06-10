import { Suspense, cache } from 'react';
import { notFound } from 'next/navigation';
import BillDetails from '../../../components/bills/bill-details';
import { billsService } from '@/lib/services/bills-service';
import type { Bill } from '@/lib/types/bill';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Bill IDs look like "1hr119" / "4199s118": number + type + congress. Anything
// else can 404 without a Convex round-trip.
const BILL_ID_PATTERN = /^\d{1,5}[a-z]{1,7}\d{2,3}$/;

// Fetch the bill once per request. React's `cache()` dedupes the call shared
// between generateMetadata and the page render (request-scoped only — no
// persistent cache). The page renders dynamically on each request; returns
// null on any failure so the caller can route to notFound() cleanly.
const getBill = cache(async (id: string): Promise<Bill | null> => {
  if (!BILL_ID_PATTERN.test(id)) {
    return null;
  }
  try {
    return await billsService.fetchBillById(id);
  } catch (error) {
    console.error(`getBill(${id}) failed:`, error);
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const bill = await getBill(id);

  if (!bill) {
    return { title: 'Bill Not Found' };
  }

  return {
    title: `${bill.bill_type_label} ${bill.bill_number} - ${bill.congress}th Congress`,
    description: bill.title,
  };
}

export default async function BillPage({ params }: PageProps): Promise<ReactElement> {
  const { id } = await params;
  const bill = await getBill(id);

  if (!bill) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <div className="container-editorial py-16">
          <div className="space-y-3">
            <div className="h-3 w-24 bg-secondary rounded-sm animate-pulse" />
            <div className="h-10 w-2/3 bg-secondary rounded-sm animate-pulse" />
            <div className="h-4 w-1/2 bg-secondary rounded-sm animate-pulse" />
          </div>
        </div>
      }
    >
      <BillDetails bill={bill} />
    </Suspense>
  );
}
