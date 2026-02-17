'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const STAGE_COLORS: Record<number, string> = {
  20: '#64748b',  // Introduced - slate
  40: '#6366f1',  // In Committee - indigo
  60: '#8b5cf6',  // Passed One Chamber - violet
  70: '#a855f7',  // Passed Both Chambers - purple
  80: '#d946ef',  // To President - fuchsia
  90: '#ec4899',  // Signed by President - pink
  100: '#f43f5e', // Became Law - rose
};

export default function LatestCongressStatusChart() {
  // Single lightweight query — reads 1 tiny precomputed row, not 1,373 bill documents
  const result = useQuery(api.bills.latestCongressStatus);

  const congress = result?.congress ?? 119;
  const stages = result?.stages ?? [];

  const validData = useMemo(() => {
    return stages.filter(item => item.progress_stage !== null && item.progress_description !== null);
  }, [stages]);

  if (result === undefined) {
    return (
      <div className="mx-auto bg-[#19223C] rounded-lg shadow-lg h-full p-6 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-3/4 mx-auto mb-4" />
        <div className="h-4 bg-gray-700 rounded w-1/2 mx-auto mb-8" />
        <div className="h-52 bg-gray-700 rounded-full w-52 mx-auto mb-4" />
      </div>
    );
  }

  if (validData.length === 0) {
    return null;
  }

  const totalBills = validData.reduce((sum, item) => sum + item.bill_count, 0);

  const valueFormatter = (value: number) =>
    new Intl.NumberFormat('en-US').format(value);

  const sortedData = [...validData].sort((a, b) => a.progress_stage - b.progress_stage);

  return (
    <div className="mx-auto bg-[#19223C] rounded-lg shadow-lg h-full flex flex-col p-6">
      <h3 className="text-center text-lg font-semibold text-gray-100">
        {`${congress}${getOrdinalSuffix(congress)} Congress Bills by Status`}
      </h3>
      <p className="text-center text-sm text-gray-300 mt-2 mb-4">
        Distribution of bills across different legislative stages
      </p>

      <div className="flex flex-col flex-grow">
        {/* Donut chart with total in the middle */}
        <div className="mx-auto w-full max-w-md">
          <div className="relative">
            <ResponsiveContainer width="100%" height={208}>
              <PieChart>
                <Pie
                  data={sortedData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="bill_count"
                  nameKey="progress_description"
                  animationDuration={1000}
                >
                  {sortedData.map((entry) => (
                    <Cell
                      key={`cell-${entry.progress_stage}`}
                      fill={STAGE_COLORS[entry.progress_stage] || '#6b7280'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                  }}
                  formatter={(value: number) => [valueFormatter(value), 'Bills']}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center text overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
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

          <div>
            {sortedData.map((item) => {
              const percentage = ((item.bill_count / totalBills) * 100).toFixed(1);
              return (
                <div key={item.progress_stage} className="grid grid-cols-12 py-1.5 border-b border-gray-700/50 hover:bg-gray-800/30 transition-colors">
                  <div className="col-span-6 flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: STAGE_COLORS[item.progress_stage] || '#6b7280' }}
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
    </div>
  );
}

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;

  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}
