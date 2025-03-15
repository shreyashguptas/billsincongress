import { getBillsByCongressData, getLatestCongressStatusData } from './actions/analytics-actions';
import CongressionalBillsChart from './components/analytics/CongressionalBillsChart';
import LatestCongressStatusChart from './components/analytics/LatestCongressStatusChart';
import QuoteCarousel from '@/components/QuoteCarousel';

export default async function Home() {
  // Fetch the analytics data
  const billsByCongressData = await getBillsByCongressData();
  const latestCongressStatusData = await getLatestCongressStatusData();
  
  // Get the latest congress number from the bills data
  const latestCongress = billsByCongressData.length > 0 
    ? Math.max(...billsByCongressData.map(item => item.congress))
    : 119; // Fallback to 119 if data is empty

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
                <CongressionalBillsChart data={billsByCongressData} />
              </div>
              
              <div className="w-full h-full">
                <LatestCongressStatusChart 
                  data={latestCongressStatusData} 
                  latestCongress={latestCongress} 
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <QuoteCarousel />
    </div>
  );
}