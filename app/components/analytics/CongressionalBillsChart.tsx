'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function CongressionalBillsChart() {
  const congresses = useQuery(api.bills.getCongressNumbers);

  // Take last 5 congresses
  const last5 = congresses?.sort((a, b) => a - b).slice(-5) ?? [];

  // Query each congress individually
  const c0 = useQuery(api.bills.billCountByCongress, last5[0] !== undefined ? { congress: last5[0] } : 'skip');
  const c1 = useQuery(api.bills.billCountByCongress, last5[1] !== undefined ? { congress: last5[1] } : 'skip');
  const c2 = useQuery(api.bills.billCountByCongress, last5[2] !== undefined ? { congress: last5[2] } : 'skip');
  const c3 = useQuery(api.bills.billCountByCongress, last5[3] !== undefined ? { congress: last5[3] } : 'skip');
  const c4 = useQuery(api.bills.billCountByCongress, last5[4] !== undefined ? { congress: last5[4] } : 'skip');

  const data = [c0, c1, c2, c3, c4].filter(
    (d): d is NonNullable<typeof d> => d !== undefined && d !== null
  );

  if (congresses === undefined) {
    return (
      <div className="mx-auto bg-[#19223C] rounded-lg shadow-lg h-full p-6 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-3/4 mx-auto mb-4" />
        <div className="h-4 bg-gray-700 rounded w-1/2 mx-auto mb-8" />
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-4 bg-gray-700 rounded w-1/3 mb-2" />
              <div className="h-8 bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
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
