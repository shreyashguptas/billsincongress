import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FeaturedBills } from '@/components/featured-bills';

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <section className="bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container px-4 py-12 md:py-24">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl">
              Track Congressional Bills
              <br className="hidden sm:inline" />
              with AI-Powered Insights
            </h1>
            <p className="mt-4 max-w-[700px] text-base text-gray-600 dark:text-gray-400 sm:text-lg md:text-xl">
              Stay informed about legislation that matters. Get real-time updates,
              AI-generated summaries, and comprehensive analysis of bills in Congress.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:gap-4">
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
      <section className="container px-4 py-8">
        <h2 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">Featured Bills</h2>
        <FeaturedBills />
      </section>
    </div>
  );
}