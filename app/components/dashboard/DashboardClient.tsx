'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useRouter } from 'next/navigation';

interface DashboardProps {
  initialCongress?: number;
}

export default function Dashboard({ initialCongress = 119 }: DashboardProps) {
  const router = useRouter();
  const [selectedCongress, setSelectedCongress] = useState(initialCongress);
  
  const allCongressData = useQuery(api.bills.getAllCongressOverview);
  const congressDashboard = useQuery(api.bills.getCongressDashboard, { congress: selectedCongress });

  const congressNumbers = allCongressData?.map(d => d.congress) || [];
  
  useEffect(() => {
    if (congressNumbers.length > 0 && !congressNumbers.includes(selectedCongress)) {
      setSelectedCongress(congressNumbers[congressNumbers.length - 1]);
    }
  }, [congressNumbers, selectedCongress]);

  const handleCongressChange = (congress: number) => {
    setSelectedCongress(congress);
  };

  const handleDrillDown = (filterType: string, filterValue: string | number) => {
    const params = new URLSearchParams();
    params.set('congress', selectedCongress.toString());
    params.set(filterType, filterValue.toString());
    router.push(`/bills?${params.toString()}`);
  };

  if (allCongressData === undefined || congressDashboard === undefined) {
    return <DashboardSkeleton />;
  }

  if (!allCongressData || allCongressData.length === 0) {
    return (
      <div className="min-h-screen bg-congress-navy-950 text-white flex items-center justify-center">
        <p className="text-congress-navy-400">No data available</p>
      </div>
    );
  }

  const currentStats = allCongressData.find(d => d.congress === selectedCongress);

  return (
    <div className="min-h-screen bg-congress-navy-950 text-white">
      {/* Header */}
      <header className="border-b border-congress-navy-700 bg-congress-navy-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-white tracking-tight">
                Congressional Intelligence
              </h1>
              <p className="text-congress-navy-300 text-sm mt-1">
                Real-time analytics from the People's Chamber
              </p>
            </div>
            
            {/* Congress Selector */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
              <span className="text-congress-navy-400 text-sm font-medium shrink-0">Congress:</span>
              {congressNumbers.sort((a, b) => b - a).map((congress) => (
                <button
                  key={congress}
                  onClick={() => handleCongressChange(congress)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                    selectedCongress === congress
                      ? 'bg-congress-gold-500 text-congress-navy-900 shadow-lg shadow-congress-gold-500/20'
                      : 'bg-congress-navy-800 text-congress-navy-200 hover:bg-congress-navy-700 hover:text-white'
                  }`}
                >
                  {congress}{getOrdinalSuffix(congress)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Overview */}
        <section className="mb-8">
          <StatsOverview 
            stats={currentStats}
            dashboardData={congressDashboard}
            onDrillDown={handleDrillDown}
          />
        </section>

        {/* Main Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Status Donut Chart */}
          <div className="bg-congress-navy-800/50 rounded-xl border border-congress-navy-700 p-6 backdrop-blur-sm">
            <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-congress-gold-500 rounded-full"></span>
              Bill Status Distribution
            </h2>
            {congressDashboard && (
              <StatusChart 
                data={congressDashboard.statusBreakdown} 
                totalBills={congressDashboard.totalBills}
                onSegmentClick={handleDrillDown}
              />
            )}
          </div>

          {/* Policy Areas */}
          <div className="bg-congress-navy-800/50 rounded-xl border border-congress-navy-700 p-6 backdrop-blur-sm">
            <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-congress-crimson-500 rounded-full"></span>
              Top Policy Areas
            </h2>
            {congressDashboard && (
              <PolicyAreaChart 
                data={congressDashboard.topPolicyAreas}
                onBarClick={(area) => handleDrillDown('policyArea', area)}
              />
            )}
          </div>
        </div>

        {/* Secondary Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Timeline Metrics */}
          <div className="bg-congress-navy-800/50 rounded-xl border border-congress-navy-700 p-6 backdrop-blur-sm">
            <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-blue-400 rounded-full"></span>
              Average Days to Progress
            </h2>
            {congressDashboard && (
              <TimelineChart data={congressDashboard.timelineMetrics} />
            )}
          </div>

          {/* Top Sponsors */}
          <div className="bg-congress-navy-800/50 rounded-xl border border-congress-navy-700 p-6 backdrop-blur-sm">
            <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-emerald-400 rounded-full"></span>
              Top Sponsors
            </h2>
            {congressDashboard && (
              <SponsorLeaderboard 
                data={congressDashboard.topSponsors}
                onSponsorClick={(name) => handleDrillDown('sponsor', name)}
              />
            )}
          </div>
        </div>

        {/* Historical Comparison */}
        <section className="bg-congress-navy-800/50 rounded-xl border border-congress-navy-700 p-6 backdrop-blur-sm">
          <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-purple-400 rounded-full"></span>
            Historical Comparison
          </h2>
          <HistoricalChart 
            data={allCongressData}
            selectedCongress={selectedCongress}
            onCongressClick={handleCongressChange}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-congress-navy-700 mt-12 bg-congress-navy-900/50">
        <div className="container mx-auto px-4 py-6 text-center text-congress-navy-400 text-sm">
          <p>Data refreshed daily from Congress.gov • Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </footer>
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

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-congress-navy-950">
      <div className="container mx-auto px-4 py-8">
        <div className="h-16 bg-congress-navy-800 rounded-lg mb-8 animate-pulse"></div>
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-24 bg-congress-navy-800 rounded-lg animate-pulse"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-80 bg-congress-navy-800 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface StatsOverviewProps {
  stats?: {
    congress: number;
    totalCount: number;
    houseCount: number;
    senateCount: number;
  };
  dashboardData: {
    statusBreakdown: {
      introduced: number;
      inCommittee: number;
      passedOneChamber: number;
      passedBothChambers: number;
      vetoed: number;
      toPresident: number;
      signed: number;
      becameLaw: number;
    };
  } | null;
  onDrillDown: (filterType: string, filterValue: string | number) => void;
}

function StatsOverview({ stats, dashboardData, onDrillDown }: StatsOverviewProps) {
  if (!stats || !dashboardData) return null;

  const statCards = [
    {
      label: 'Total Bills',
      value: stats.totalCount,
      color: 'bg-congress-gold-500',
      textColor: 'text-congress-gold-400',
      onClick: () => onDrillDown('status', 'all'),
    },
    {
      label: 'House Bills',
      value: stats.houseCount,
      color: 'bg-blue-500',
      textColor: 'text-blue-400',
      onClick: () => onDrillDown('billType', 'hr'),
    },
    {
      label: 'Senate Bills',
      value: stats.senateCount,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-400',
      onClick: () => onDrillDown('billType', 's'),
    },
    {
      label: 'Became Law',
      value: dashboardData.statusBreakdown.becameLaw,
      color: 'bg-congress-crimson-500',
      textColor: 'text-congress-crimson-400',
      onClick: () => onDrillDown('status', 100),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statCards.map((stat, index) => (
        <button
          key={stat.label}
          onClick={stat.onClick}
          className="group relative bg-congress-navy-800/80 rounded-xl border border-congress-navy-700 p-5 text-left transition-all duration-300 hover:bg-congress-navy-800 hover:border-congress-gold-500/50 hover:shadow-lg hover:shadow-congress-gold-500/10"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className={`absolute top-0 left-0 w-full h-1 ${stat.color} rounded-t-xl`}></div>
          <p className="text-congress-navy-400 text-sm font-medium mb-1">{stat.label}</p>
          <p className={`font-display text-3xl font-bold ${stat.textColor}`}>
            {stat.value.toLocaleString()}
          </p>
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-4 h-4 text-congress-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}

interface StatusChartProps {
  data: {
    introduced: number;
    inCommittee: number;
    passedOneChamber: number;
    passedBothChambers: number;
    vetoed: number;
    toPresident: number;
    signed: number;
    becameLaw: number;
  };
  totalBills: number;
  onSegmentClick: (filterType: string, filterValue: string | number) => void;
}

function StatusChart({ data, totalBills, onSegmentClick }: StatusChartProps) {
  const stages = [
    { key: 'introduced', label: 'Introduced', color: '#64748b', value: data.introduced },
    { key: 'inCommittee', label: 'In Committee', color: '#6366f1', value: data.inCommittee },
    { key: 'passedOneChamber', label: 'Passed One Chamber', color: '#8b5cf6', value: data.passedOneChamber },
    { key: 'passedBothChambers', label: 'Passed Both Chambers', color: '#a855f7', value: data.passedBothChambers },
    { key: 'toPresident', label: 'To President', color: '#ec4899', value: data.toPresident },
    { key: 'signed', label: 'Signed by President', color: '#f43f5e', value: data.signed },
    { key: 'becameLaw', label: 'Became Law', color: '#22c55e', value: data.becameLaw },
  ].filter(s => s.value > 0);

  const statusMap: Record<string, number> = {
    introduced: 20,
    inCommittee: 40,
    passedOneChamber: 60,
    passedBothChambers: 80,
    toPresident: 90,
    signed: 95,
    becameLaw: 100,
  };

  return (
    <div className="flex flex-col lg:flex-row items-center gap-6">
      {/* Donut Chart */}
      <div className="relative w-48 h-48 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          {stages.reduce((acc, stage, index) => {
            const startAngle = acc;
            const percentage = (stage.value / totalBills) * 100;
            const angle = (percentage / 100) * 360;
            const endAngle = startAngle + angle;
            
            const startRad = (startAngle - 90) * Math.PI / 180;
            const endRad = (endAngle - 90) * Math.PI / 180;
            
            const x1 = 50 + 35 * Math.cos(startRad);
            const y1 = 50 + 35 * Math.sin(startRad);
            const x2 = 50 + 35 * Math.cos(endRad);
            const y2 = 50 + 35 * Math.sin(endRad);
            
            const largeArc = angle > 180 ? 1 : 0;
            
            acc += angle;
            return acc;
          }, 0)}
          
          {stages.reduce((acc, stage, index) => {
            const startAngle = acc;
            const percentage = (stage.value / totalBills) * 100;
            const angle = (percentage / 100) * 360;
            const endAngle = startAngle + angle;
            
            const startRad = (startAngle - 90) * Math.PI / 180;
            const endRad = (endAngle - 90) * Math.PI / 180;
            
            const x1 = 50 + 35 * Math.cos(startRad);
            const y1 = 50 + 35 * Math.sin(startRad);
            const x2 = 50 + 35 * Math.cos(endRad);
            const y2 = 50 + 35 * Math.sin(endRad);
            
            const largeArc = angle > 180 ? 1 : 0;
            
            return acc + angle;
          }, 0)}
          
          {(() => {
            let currentAngle = 0;
            return stages.map((stage, index) => {
              const percentage = (stage.value / totalBills) * 100;
              const angle = (percentage / 100) * 360;
              const startAngle = currentAngle;
              const endAngle = currentAngle + angle;
              
              const startRad = (startAngle - 90) * Math.PI / 180;
              const endRad = (endAngle - 90) * Math.PI / 180;
              
              const x1 = 50 + 35 * Math.cos(startRad);
              const y1 = 50 + 35 * Math.sin(startRad);
              const x2 = 50 + 35 * Math.cos(endRad);
              const y2 = 50 + 35 * Math.sin(endRad);
              
              const largeArc = angle > 180 ? 1 : 0;
              
              currentAngle = endAngle;
              
              return (
                <path
                  key={stage.key}
                  d={`M ${x1} ${y1} A 35 35 0 ${largeArc} 1 ${x2} ${y2}`}
                  fill="none"
                  stroke={stage.color}
                  strokeWidth="18"
                  className="cursor-pointer transition-all duration-200 hover:stroke-width-20"
                  onClick={() => onSegmentClick('status', statusMap[stage.key])}
                />
              );
            });
          })()}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-display font-bold text-white">{totalBills.toLocaleString()}</span>
          <span className="text-xs text-congress-navy-400">Total Bills</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 grid grid-cols-2 gap-2">
        {stages.map((stage) => (
          <button
            key={stage.key}
            onClick={() => onSegmentClick('status', statusMap[stage.key])}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-congress-navy-700/50 transition-colors text-left group"
          >
            <span 
              className="w-3 h-3 rounded-full shrink-0" 
              style={{ backgroundColor: stage.color }}
            />
            <span className="text-sm text-congress-navy-200 group-hover:text-white truncate flex-1">
              {stage.label}
            </span>
            <span className="text-sm font-semibold text-white">
              {stage.value.toLocaleString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface PolicyAreaChartProps {
  data: Array<{ name: string; count: number }>;
  onBarClick: (area: string) => void;
}

function PolicyAreaChart({ data, onBarClick }: PolicyAreaChartProps) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-congress-navy-400">
        No policy area data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <button
          key={item.name}
          onClick={() => onBarClick(item.name)}
          className="w-full group flex items-center gap-3"
        >
          <span className="w-24 text-sm text-congress-navy-300 truncate text-left shrink-0">
            {item.name}
          </span>
          <div className="flex-1 h-6 bg-congress-navy-900 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-congress-crimson-600 to-congress-crimson-400 rounded-full transition-all duration-500 group-hover:shadow-lg group-hover:shadow-congress-crimson-500/20"
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="w-12 text-sm font-semibold text-white text-right shrink-0">
            {item.count}
          </span>
        </button>
      ))}
    </div>
  );
}

interface TimelineChartProps {
  data: Array<{ stage: string; avgDays: number; description: string }>;
}

function TimelineChart({ data }: TimelineChartProps) {
  const maxDays = Math.max(...data.map(d => d.avgDays), 1);

  return (
    <div className="space-y-4">
      {data.slice(1).map((item, index) => (
        <div key={item.stage} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-congress-navy-200">{item.description}</span>
            <span className="text-white font-semibold">
              {item.avgDays > 0 ? `${item.avgDays} days` : '—'}
            </span>
          </div>
          <div className="h-2 bg-congress-navy-900 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-700"
              style={{ width: `${maxDays > 0 ? (item.avgDays / maxDays) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface SponsorLeaderboardProps {
  data: Array<{ name: string; count: number; party?: string; state?: string }>;
  onSponsorClick: (name: string) => void;
}

function SponsorLeaderboard({ data, onSponsorClick }: SponsorLeaderboardProps) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-congress-navy-400">
        No sponsor data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((sponsor, index) => (
        <button
          key={sponsor.name}
          onClick={() => onSponsorClick(sponsor.name)}
          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-congress-navy-700/50 transition-colors group text-left"
        >
          <span className="w-6 h-6 flex items-center justify-center bg-congress-navy-700 rounded-full text-xs font-bold text-congress-gold-400 shrink-0">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate group-hover:text-congress-gold-400 transition-colors">
              {sponsor.name}
            </p>
            <p className="text-xs text-congress-navy-400">
              {[sponsor.party, sponsor.state].filter(Boolean).join(' • ')}
            </p>
          </div>
          <span className="text-sm font-bold text-congress-navy-200">
            {sponsor.count}
          </span>
        </button>
      ))}
    </div>
  );
}

interface HistoricalChartProps {
  data: Array<{
    congress: number;
    totalCount: number;
    houseCount: number;
    senateCount: number;
    stageCounts: Array<{ stage: number; count: number }>;
  }>;
  selectedCongress: number;
  onCongressClick: (congress: number) => void;
}

function HistoricalChart({ data, selectedCongress, onCongressClick }: HistoricalChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-congress-navy-400">
        No historical data available
      </div>
    );
  }

  const sortedData = [...data].sort((a, b) => a.congress - b.congress);
  const maxCount = Math.max(...sortedData.map(d => d.totalCount), 1);

  if (sortedData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-congress-navy-400">
        No historical data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-center gap-4 h-48">
        {sortedData.map((item) => {
          const heightPercent = (item.totalCount / maxCount) * 100;
          const heightPx = Math.max((item.totalCount / maxCount) * 160, 10); // Min 10px, max 160px
          const isSelected = item.congress === selectedCongress;
          
          return (
            <button
              key={item.congress}
              onClick={() => onCongressClick(item.congress)}
              className="flex flex-col items-center gap-2 group"
            >
              <span className={`text-lg font-bold ${isSelected ? 'text-congress-gold-400' : 'text-white'} group-hover:text-congress-gold-400 transition-colors`}>
                {item.totalCount.toLocaleString()}
              </span>
              <div 
                className={`w-12 sm:w-16 rounded-t-lg transition-all duration-300 ${
                  isSelected 
                    ? 'bg-gradient-to-t from-congress-gold-600 to-congress-gold-400 shadow-lg shadow-congress-gold-500/30' 
                    : 'bg-gradient-to-t from-blue-600 to-blue-400 group-hover:from-blue-500 group-hover:to-blue-300'
                }`}
                style={{ height: `${heightPx}px` }}
              />
              <span className={`text-sm font-medium ${isSelected ? 'text-congress-gold-400' : 'text-congress-navy-300'}`}>
                {item.congress}{getOrdinalSuffix(item.congress)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-center gap-6 pt-2 border-t border-congress-navy-700">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-blue-500 rounded"></span>
          <span className="text-sm text-congress-navy-300">House</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-emerald-500 rounded"></span>
          <span className="text-sm text-congress-navy-300">Senate</span>
        </div>
      </div>
    </div>
  );
}
