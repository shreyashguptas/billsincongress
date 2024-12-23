import { Suspense } from 'react';
import { billsService } from '@/lib/services/bills-service';
import { AnimatedBillCard } from '@/components/bills/animated-bill-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const revalidate = 3600; // Revalidate every hour

async function FeaturedBills() {
  const bills = await billsService.fetchFeaturedBills();

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold tracking-tight">Featured Bills</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {bills.map((bill, index) => (
          <AnimatedBillCard key={bill.id} bill={bill} index={index} />
        ))}
      </div>
    </div>
  );
}

function FeaturedBillsSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-[300px]" />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
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
            <Suspense fallback={<FeaturedBillsSkeleton />}>
              <FeaturedBills />
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