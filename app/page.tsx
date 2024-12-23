import { Suspense } from 'react';
import { billsService } from '@/lib/services/bills-service';
import BillCard from '@/components/bills/bill-card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { sharedViewport } from './shared-metadata';
import type { Viewport } from 'next';

export const viewport: Viewport = sharedViewport;

// Enable ISR with 1-hour revalidation
export const revalidate = 3600;

function LoadingBills() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-[200px] bg-accent/10 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

async function FeaturedBillsContent() {
  const featuredBills = await billsService.fetchFeaturedBills();

  if (featuredBills.length === 0) {
    return <p className="text-muted-foreground">No featured bills at this time.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {featuredBills.map((bill) => (
        <BillCard key={bill.id} bill={bill} />
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <section className="w-full bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-12 md:py-24">
          <div className="mx-auto max-w-[800px] text-center">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl">
              Track Congressional Bills
              <br className="hidden sm:inline" />
              with AI-Powered Insights
            </h1>
            <p className="mx-auto mt-4 max-w-[700px] text-base text-gray-600 dark:text-gray-400 sm:text-lg md:text-xl">
              Stay informed about legislation that matters. Get real-time updates,
              AI-generated summaries, and comprehensive analysis of bills in Congress.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-4">
              <Link href="/bills">
                <Button size="lg" className="w-full sm:w-auto">
                  Browse Bills
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/about">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-background">
        <div className="container mx-auto px-4 py-12">
          <div className="mx-auto max-w-[1200px] space-y-8">
            <h2 className="text-3xl font-bold">Featured Bills</h2>
            <Suspense fallback={<LoadingBills />}>
              <FeaturedBillsContent />
            </Suspense>
            <div className="mt-12 flex justify-center">
              <Link href="/bills">
                <Button size="lg" className="w-full sm:w-auto">
                  Browse All Bills
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}