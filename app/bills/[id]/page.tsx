import { BillStorageService } from '@/lib/services/bill-storage';
import { Bill } from '@/lib/types';
import { BillHeader } from '@/components/bills/bill-header';
import { BillSponsors } from '@/components/bills/bill-sponsors';
import { BillContentTabs } from '@/components/bills/bill-content-tabs';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

interface PageProps {
  params: { id: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const storage = new BillStorageService();
  try {
    const bills = await storage.getBillById(params.id);
    const bill = bills[0];
    if (!bill) {
      return {
        title: 'Bill Not Found',
      };
    }
    return {
      title: `${bill.billType} ${bill.billNumber} - ${bill.title}`,
      description: bill.summary,
    };
  } catch (error) {
    console.error('Error fetching bill metadata:', error);
    return {
      title: 'Bill Details',
    };
  }
}

export default async function BillPage({ params }: PageProps) {
  const storage = new BillStorageService();
  let bill: Bill | null = null;

  try {
    const bills = await storage.getBillById(params.id);
    if (bills && bills.length > 0) {
      bill = bills[0];
    }
  } catch (error) {
    console.error('Error fetching bill:', error);
  }

  if (!bill) {
    notFound();
  }

  return (
    <div className="container space-y-8 py-8">
      <BillHeader bill={bill} />
      <div className="grid gap-8 md:grid-cols-6">
        <div className="md:col-span-4">
          <BillContentTabs bill={bill} />
        </div>
        <div className="md:col-span-2">
          <BillSponsors bill={bill} />
        </div>
      </div>
    </div>
  );
}