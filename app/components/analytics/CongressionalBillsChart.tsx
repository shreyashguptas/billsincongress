'use client';

import type { BillsByCongressData } from '@/app/actions/analytics-actions';

interface CongressionalBillsChartProps {
  data: BillsByCongressData[];
}

export default function CongressionalBillsChart({ data }: CongressionalBillsChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  const valueFormatter = (value: number) =>
    new Intl.NumberFormat('en-US').format(value);

  const sortedData = [...data].sort((a, b) => b.congress - a.congress);
  const maxValue = Math.max(...sortedData.map(item => item.bill_count));

  return (
    <div className="mx-auto bg-[#19223C] rounded-lg shadow-lg h-full p-6">
      <h3 className="text-center text-lg font-semibold text-gray-100">Bills Introduced by Congress</h3>
      <p className="text-center text-sm text-gray-300 mt-2 mb-8">
        Compare the number of bills introduced in the last 5 Congresses
      </p>

      <div className="px-4 py-2">
        <div className="space-y-6">
          {sortedData.map((item) => (
            <div key={item.congress}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-white font-medium">Congress {item.congress}</span>
                <span className="text-white font-medium">{valueFormatter(item.bill_count)}</span>
              </div>
              <div className="w-full bg-[#EEF6FF] bg-opacity-10 rounded-sm h-8 overflow-hidden">
                <div
                  className="bg-[#3B82F6] h-full transition-all duration-500"
                  style={{ width: `${(item.bill_count / maxValue) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
