'use client';

import { Card, Title, BarChart, Subtitle } from '@tremor/react';
import type { BillsByCongressData } from '@/app/actions/analytics-actions';

interface CongressionalBillsChartProps {
  data: BillsByCongressData[];
}

export default function CongressionalBillsChart({ data }: CongressionalBillsChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Format numbers with commas
  const valueFormatter = (value: number) => 
    new Intl.NumberFormat('en-US').format(value);

  return (
    <Card className="mx-auto bg-[#19223C] border-0 shadow-lg">
      <Title className="text-center text-gray-100">Bills Introduced by Congress</Title>
      <Subtitle className="text-center text-gray-300 mt-2">
        Compare the number of bills introduced in the last 5 Congresses
      </Subtitle>
      <BarChart
        className="mt-6 h-72 text-gray-300"
        data={data}
        index="congress"
        categories={["bill_count"]}
        colors={["blue"]}
        valueFormatter={valueFormatter}
        yAxisWidth={60}
        showLegend={false}
        showGridLines={false}
        showAnimation={true}
        animationDuration={1000}
        customTooltip={customTooltip}
      />
    </Card>
  );
}

// Custom tooltip to show more detailed information
const customTooltip = ({ payload, active }: any) => {
  if (!active || !payload) return null;
  
  const data = payload[0]?.payload;
  if (!data) return null;
  
  return (
    <div className="border border-tremor-border bg-[#19223C] p-2 shadow-tremor-dropdown rounded-tremor-default text-white">
      <div className="flex flex-col">
        <span className="text-white font-medium">
          {`Congress ${data.congress}`}
        </span>
        <span className="flex mt-2 items-center justify-between gap-2">
          <span className="text-gray-300">Total Bills:</span>
          <span className="font-medium text-white">{new Intl.NumberFormat('en-US').format(data.bill_count)}</span>
        </span>
        <span className="flex mt-1 items-center justify-between gap-2">
          <span className="text-gray-300">House Bills:</span>
          <span className="font-medium text-white">{new Intl.NumberFormat('en-US').format(data.house_bill_count)}</span>
        </span>
        <span className="flex mt-1 items-center justify-between gap-2">
          <span className="text-gray-300">Senate Bills:</span>
          <span className="font-medium text-white">{new Intl.NumberFormat('en-US').format(data.senate_bill_count)}</span>
        </span>
      </div>
    </div>
  );
}; 