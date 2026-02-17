import CongressionalBillsChart from './components/analytics/CongressionalBillsChart';
import LatestCongressStatusChart from './components/analytics/LatestCongressStatusChart';
import QuoteCarousel from '@/components/QuoteCarousel';

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Analytics Section - Now the primary section */}
      <section className="w-full bg-[#121825] text-white py-16 md:py-20 min-h-[calc(100vh-64px)]">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-[1200px]">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-4">
              Hold your Representatives Accountable
            </h1>
            <p className="text-center text-gray-300 mb-12 max-w-[700px] mx-auto">
            See how your elected representatives are doing in Congress.
            And track the bills that they're introducing to help you live a better life.
            </p>

            {/* Dashboard layout - side by side on large screens, stacked on smaller screens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="w-full h-full">
                <CongressionalBillsChart />
              </div>

              <div className="w-full h-full">
                <LatestCongressStatusChart />
              </div>
            </div>
          </div>
        </div>
      </section>

      <QuoteCarousel />
    </div>
  );
}
