import { BillStorageService } from '@/lib/services/bill-storage';
import { BillInfo } from '@/lib/types/BillInfo';
import { BillHeader } from '@/components/bills/bill-header';
import { BillSponsors } from '@/components/bills/bill-sponsors';
import { BillInfo as BillInfoComponent } from '@/components/bills/bill-info';
import { BillContentTabs } from '@/components/bills/bill-content-tabs';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const storage = new BillStorageService();
  try {
    const resolvedParams = await params;
    const bills = await storage.getBillById(resolvedParams.id);
    const bill = bills[0];
    if (!bill) {
      return {
        title: 'Bill Not Found',
      };
    }
    return {
      title: `${bill.bill_type} ${bill.bill_number} - ${bill.title}`,
      description: bill.title_without_number || bill.title,
    };
  } catch (error) {
    console.error('Error fetching bill metadata:', error);
    return {
      title: 'Bill Details',
    };
  }
}

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const storage = new BillStorageService();
  let bill: BillInfo | null = null;

  try {
    const resolvedParams = await params;
    const bills = await storage.getBillById(resolvedParams.id);
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <BillHeader bill={bill} />
        <div className="grid gap-8 py-8 lg:grid-cols-3">
          <div className="order-2 lg:order-1 lg:col-span-2">
            <BillContentTabs bill={bill} />
          </div>
          <div className="order-1 lg:order-2 lg:col-span-1">
            <div className="sticky top-8 space-y-8">
              <BillSponsors bill={bill} />
              <BillInfoComponent bill={bill} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}