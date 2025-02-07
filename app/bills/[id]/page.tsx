import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import BillDetails from '../../../components/bills/bill-details';
import { billsService } from '@/lib/services/bills-service';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

// Enable ISR with 1-hour revalidation
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

// Generate metadata for the page
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const { id } = await params;
    const bill = await billsService.fetchBillById(id);
    
    return {
      title: `${bill.bill_type_label} ${bill.bill_number} - ${bill.congress}th Congress`,
      description: bill.title,
    };
  } catch (error: unknown) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Bill Not Found',
    };
  }
}

// Pre-generate the most recent 100 bills at build time
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  try {
    const { data } = await billsService.fetchBills({
      page: 1,
      itemsPerPage: 100,
    });

    return data.map((bill) => ({
      id: bill.id,
    }));
  } catch (error: unknown) {
    console.error('Error generating static params:', error);
    return [];
  }
}

export default async function BillPage({ params }: PageProps): Promise<ReactElement> {
  try {
    const { id } = await params;
    const bill = await billsService.fetchBillById(id);

    if (!bill) {
      notFound();
    }

    return (
      <Suspense fallback={<div>Loading...</div>}>
        <BillDetails bill={bill} />
      </Suspense>
    );
  } catch (error: unknown) {
    console.error('Error loading bill:', error);
    notFound();
  }
}