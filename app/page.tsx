import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import QuoteCarousel from '@/components/QuoteCarousel';
import CongressionalBillsChart from './components/analytics/CongressionalBillsChart';
import { getBillsByCongressData } from './actions/analytics-actions';

export default async function Home() {
  // Fetch the analytics data
  const billsByCongressData = await getBillsByCongressData();

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

      {/* Analytics Section */}
      <section className="w-full bg-[#121825] text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-[1000px]">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
              Congressional Bills Trends
            </h2>
            <p className="text-center text-gray-300 mb-10 max-w-[700px] mx-auto">
              How has legislative activity changed over time? Explore the trends in bill introductions
              across recent Congresses.
            </p>
            <div className="mt-8">
              <CongressionalBillsChart data={billsByCongressData} />
            </div>
          </div>
        </div>
      </section>

      <QuoteCarousel />
    </div>
  );
}