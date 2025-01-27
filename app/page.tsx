'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import QuoteCarousel from '@/components/QuoteCarousel';

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

      <QuoteCarousel />
    </div>
  );
}