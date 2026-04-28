import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { cacheLife, cacheTag } from 'next/cache';
import BillDetails from '../../../components/bills/bill-details';
import { billsService } from '@/lib/services/bills-service';
import type { Bill } from '@/lib/types/bill';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Cache the per-bill fetch at the edge. 1-hour revalidate matches the
// previous `export const revalidate = 3600` ISR window. The bill ID
// argument forms the cache key automatically. Returns `null` on any
// failure (missing Convex env, bill not found, network error) so the
// caller can route to notFound() cleanly — throwing inside `'use cache'`
// fails the prerender for placeholder routes.
async function getCachedBill(id: string): Promise<Bill | null> {
  'use cache';
  cacheLife({ revalidate: 3600 });
  cacheTag('bills', `bill-${id}`);
  try {
    return await billsService.fetchBillById(id);
  } catch (error) {
    console.error(`getCachedBill(${id}) failed:`, error);
    return null;
  }
}

// Cache Components requires `generateStaticParams` to return at least one
// entry so the build can validate the route. We try to fetch the most
// recent 100 bills (matches the previous ISR pre-generation behavior); if
// the build environment lacks Convex env or the fetch fails, we fall back
// to a single placeholder route which renders a 404 at build time via
// notFound() and resolves real bills on demand via getCachedBill.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  try {
    const { data } = await billsService.fetchBills({
      page: 1,
      itemsPerPage: 100,
    });
    if (data.length > 0) {
      return data.map((bill) => ({ id: bill.id }));
    }
  } catch (error: unknown) {
    console.error('Error generating static params:', error);
  }
  return [{ id: '__placeholder__' }];
}

// Generate metadata for the page
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const bill = await getCachedBill(id);

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
  const bill = await getCachedBill(id);

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