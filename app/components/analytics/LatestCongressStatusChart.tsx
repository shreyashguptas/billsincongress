'use client';

import { Card, Title, DonutChart, Subtitle, Text } from '@tremor/react';
import type { LatestCongressStatusData } from '@/app/actions/analytics-actions';
import { useMemo } from 'react';

interface LatestCongressStatusChartProps {
  data: LatestCongressStatusData[];
  latestCongress?: number;
}

export default function LatestCongressStatusChart({ 
  data, 
  latestCongress = 119 
}: LatestCongressStatusChartProps) {
  const validData = useMemo(() => {
    return data.filter(item => item.progress_stage !== null && item.progress_description !== null);
  }, [data]);

  if (!validData || validData.length === 0) {
    return null;
  }

  // Calculate the total number of bills for percentage calculation
  const totalBills = validData.reduce((sum, item) => sum + item.bill_count, 0);

  // Format numbers with commas
  const valueFormatter = (value: number) => 
    new Intl.NumberFormat('en-US').format(value);

  // Custom colors based on progress stage
  const getColor = (stage: number) => {
    switch (stage) {
      case 20: return 'slate'; // Introduced
      case 40: return 'indigo'; // In Committee
      case 60: return 'violet'; // Passed One Chamber
      case 70: return 'purple'; // Passed Both Chambers
      case 80: return 'fuchsia'; // To President
      case 90: return 'pink'; // Signed by President
      case 100: return 'rose'; // Became Law
      default: return 'gray';
    }
  };

  // Sort the data by progress stage to ensure consistent order
  const sortedData = [...validData].sort((a, b) => a.progress_stage - b.progress_stage);
  
  // Create colors array for the donut chart based on sorted data
  const colors = sortedData.map(item => getColor(item.progress_stage));

  return (
    <Card className="mx-auto bg-[#19223C] border-0 shadow-lg h-full flex flex-col">
      <Title className="text-center text-gray-100">
        {`${latestCongress}${getOrdinalSuffix(latestCongress)} Congress Bills by Status`}
      </Title>
      <Subtitle className="text-center text-gray-300 mt-2 mb-4">
        Distribution of bills across different legislative stages
      </Subtitle>
      
      <div className="flex flex-col flex-grow">
        {/* Donut chart with total in the middle */}
        <div className="mx-auto w-full max-w-md">
          <div className="relative">
            <DonutChart
              className="text-gray-300 h-52"
              data={sortedData}
              index="progress_description"
              category="bill_count"
              colors={colors}
              valueFormatter={valueFormatter}
              showLabel={false}
              showAnimation={true}
              animationDuration={1000}
            />
            
            {/* Center text overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-4xl font-bold text-white">{valueFormatter(totalBills)}</p>
              <p className="text-sm text-gray-400">Total Bills</p>
            </div>
          </div>
        </div>
        
        {/* Table-like display below the chart */}
        <div className="mt-4 border-t border-gray-600 pt-4 flex-grow">
          <div className="grid grid-cols-12 mb-2 text-gray-300 text-sm font-semibold">
            <div className="col-span-6">Status</div>
            <div className="col-span-3 text-right">Amount</div>
            <div className="col-span-3 text-right">Share</div>
          </div>
          
          {/* Show all statuses without scrolling */}
          <div>
            {sortedData.map((item) => {
              const percentage = ((item.bill_count / totalBills) * 100).toFixed(1);
              return (
                <div key={item.progress_stage} className="grid grid-cols-12 py-1.5 border-b border-gray-700/50 hover:bg-gray-800/30 transition-colors">
                  <div className="col-span-6 flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: `var(--tremor-${getColor(item.progress_stage)}-500)` }} 
                    />
                    <p className="text-gray-100 font-medium text-sm md:text-base truncate">{item.progress_description}</p>
                  </div>
                  <div className="col-span-3 text-right">
                    <p className="text-gray-100 font-semibold text-sm md:text-base">{valueFormatter(item.bill_count)}</p>
                  </div>
                  <div className="col-span-3 text-right">
                    <p className="text-gray-300 font-medium text-sm md:text-base">{percentage}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

// Helper function to get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  
  if (j === 1 && k !== 11) {
    return 'st';
  }
  if (j === 2 && k !== 12) {
    return 'nd';
  }
  if (j === 3 && k !== 13) {
    return 'rd';
  }
  return 'th';
} 