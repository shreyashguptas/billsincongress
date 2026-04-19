'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useConvexEnabled } from '../../ConvexClientProvider';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardProps {
  initialCongress?: number;
}

export default function Dashboard({ initialCongress = 119 }: DashboardProps) {
  const convexEnabled = useConvexEnabled();
  if (!convexEnabled) {
    return <ConvexNotConfigured />;
  }
  return <DashboardInner initialCongress={initialCongress} />;
}

function ConvexNotConfigured() {
  return (
    <div className="container-editorial py-24">
      <div className="max-w-md">
        <p className="label-eyebrow mb-3">Configuration required</p>
        <h2 className="font-serif text-3xl font-semibold mb-3 tracking-tight">
          Backend not connected
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-2">
          The live dashboard requires a Convex backend. Set the{' '}
          <code className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[12px]">
            NEXT_PUBLIC_CONVEX_URL
          </code>{' '}
          environment variable and restart the dev server.
        </p>
        <p className="text-sm text-muted-foreground">
          See the project README for setup instructions.
        </p>
      </div>
    </div>
  );
}

function DashboardInner({ initialCongress = 119 }: DashboardProps) {
  const router = useRouter();
  const [selectedCongress, setSelectedCongress] = useState(initialCongress);

  const allCongressData = useQuery(api.bills.getAllCongressOverview);
  const congressDashboard = useQuery(api.bills.getCongressDashboard, {
    congress: selectedCongress,
  });

  const congressNumbers = allCongressData?.map((d) => d.congress) || [];

  useEffect(() => {
    if (congressNumbers.length > 0 && !congressNumbers.includes(selectedCongress)) {
      setSelectedCongress(congressNumbers[congressNumbers.length - 1]);
    }
  }, [congressNumbers, selectedCongress]);

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
      <div className="container-editorial py-24 text-center text-muted-foreground">
        No data available.
      </div>
    );
  }

  const currentStats = allCongressData.find((d) => d.congress === selectedCongress);
  const currentTerm = getCongressTermYears(selectedCongress);

  return (
    <div className="animate-fade-in">
      {/* ── HERO / Editorial masthead ─────────────────────────────── */}
      <section className="border-b border-border">
        <div className="container-editorial py-10 sm:py-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <p className="label-eyebrow mb-3">
                The {selectedCongress}
                {getOrdinalSuffix(selectedCongress)} Congress
                {currentTerm && (
                  <span className="ml-2 text-muted-foreground/80 normal-case tracking-normal">
                    · {currentTerm}
                  </span>
                )}
              </p>
              <h1 className="font-serif text-display-md sm:text-display-lg lg:text-display-xl font-semibold leading-[1.05] tracking-tight">
                Every bill, every step,
                <br className="hidden sm:inline" /> in plain view.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
                A continuous record of legislation moving through the United
                States Congress — sourced live from Congress.gov, made readable
                for citizens, journalists and researchers.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/bills"
                  className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/85 transition-colors"
                >
                  Browse all bills
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/learn"
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  How a bill becomes law
                </Link>
              </div>
            </div>

            {/* Congress selector — quiet sidebar */}
            <div className="min-w-[180px]">
              <p className="label-eyebrow mb-2">Congress</p>
              <div className="flex flex-wrap gap-1">
                {congressNumbers
                  .sort((a, b) => b - a)
                  .map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedCongress(c)}
                      className={cn(
                        'rounded-sm border px-2.5 py-1 font-mono text-xs transition-colors tabular',
                        selectedCongress === c
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                      )}
                    >
                      {c}
                      {getOrdinalSuffix(c)}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── KEY METRICS row ───────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="container-editorial py-8">
          <StatsOverview
            stats={currentStats}
            dashboardData={congressDashboard}
            onDrillDown={handleDrillDown}
          />
        </div>
      </section>

      {/* ── Status distribution + Policy areas ────────────────────── */}
      <section className="border-b border-border">
        <div className="container-editorial py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          <div className="lg:col-span-7">
            <SectionHeader
              eyebrow="Where bills stand"
              title="Status distribution"
              description="Most introduced bills never leave committee. The bar shows how this Congress's introduced bills are distributed across the legislative pipeline."
            />
            {congressDashboard && (
              <StatusBar
                data={congressDashboard.statusBreakdown}
                totalBills={congressDashboard.totalBills}
                onSegmentClick={handleDrillDown}
              />
            )}
          </div>
          <div className="lg:col-span-5">
            <SectionHeader
              eyebrow="By subject"
              title="Top policy areas"
              description="The most common policy areas tagged on bills introduced this Congress."
            />
            {congressDashboard && (
              <PolicyAreaList
                data={congressDashboard.topPolicyAreas}
                onItemClick={(area) => handleDrillDown('policyArea', area)}
              />
            )}
          </div>
        </div>
      </section>

      {/* ── Sponsors ──────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="container-editorial py-12">
          <SectionHeader
            eyebrow="The most prolific"
            title="Leading sponsors"
            description="Members who have introduced the most bills this Congress."
          />
          {congressDashboard && (
            <SponsorTable
              data={congressDashboard.topSponsors}
              onSponsorClick={(name) => handleDrillDown('sponsor', name)}
            />
          )}
        </div>
      </section>

      {/* ── Historical comparison ─────────────────────────────────── */}
      <section>
        <div className="container-editorial py-12">
          <SectionHeader
            eyebrow="In context"
            title="Volume across recent Congresses"
            description="Total bills introduced in each two-year session of Congress on record. Click a bar to switch the view."
          />
          <HistoricalChart
            data={allCongressData}
            selectedCongress={selectedCongress}
            onCongressClick={setSelectedCongress}
          />
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Section header — used throughout
 * ───────────────────────────────────────────────────────────────────── */

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-6">
      <p className="label-eyebrow mb-2">{eyebrow}</p>
      <h2 className="font-serif text-display-sm font-semibold tracking-tight leading-tight">
        {title}
      </h2>
      {description && (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────────────── */

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

function getCongressTermYears(congress: number): string | null {
  // 1st Congress began March 4, 1789. Each Congress is two years.
  const startYear = 1789 + (congress - 1) * 2;
  if (startYear < 1789 || startYear > 2200) return null;
  return `${startYear}–${startYear + 2}`;
}

function DashboardSkeleton() {
  return (
    <div className="container-editorial py-12 space-y-8">
      <div className="space-y-3">
        <div className="h-3 w-32 bg-secondary rounded-sm animate-pulse" />
        <div className="h-12 w-3/4 bg-secondary rounded-sm animate-pulse" />
        <div className="h-4 w-2/3 bg-secondary rounded-sm animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border border-border bg-border">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-background animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {[1, 2].map((i) => (
          <div key={i} className="h-64 bg-secondary rounded-sm animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Stats overview — borderless metric grid
 * ───────────────────────────────────────────────────────────────────── */

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

  const items = [
    { label: 'Bills introduced', value: stats.totalCount, onClick: () => onDrillDown('status', 'all') },
    { label: 'House bills', value: stats.houseCount, onClick: () => onDrillDown('billType', 'hr') },
    { label: 'Senate bills', value: stats.senateCount, onClick: () => onDrillDown('billType', 's') },
    { label: 'Became law', value: dashboardData.statusBreakdown.becameLaw, onClick: () => onDrillDown('status', 100) },
  ];

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-x border-border">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.onClick}
          className="group text-left px-5 py-4 hover:bg-secondary/60 transition-colors"
        >
          <dt className="label-eyebrow mb-2">{item.label}</dt>
          <dd className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight tabular text-foreground">
            {item.value.toLocaleString()}
          </dd>
        </button>
      ))}
    </dl>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Status distribution — horizontal stacked bar (Tufte-style)
 * ───────────────────────────────────────────────────────────────────── */

interface StatusBarProps {
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

function StatusBar({ data, totalBills, onSegmentClick }: StatusBarProps) {
  const stages = [
    { key: 'introduced',          label: 'Introduced',           color: 'hsl(var(--status-introduced))', value: data.introduced,          stage: 20 },
    { key: 'inCommittee',         label: 'In committee',         color: 'hsl(var(--status-committee))',  value: data.inCommittee,         stage: 40 },
    { key: 'passedOneChamber',    label: 'Passed one chamber',   color: 'hsl(var(--status-passed-one))', value: data.passedOneChamber,    stage: 60 },
    { key: 'passedBothChambers',  label: 'Passed both chambers', color: 'hsl(var(--status-passed-both))', value: data.passedBothChambers, stage: 80 },
    { key: 'toPresident',         label: 'To the President',     color: 'hsl(var(--status-president))',  value: data.toPresident,         stage: 90 },
    { key: 'signed',              label: 'Signed',               color: 'hsl(var(--status-signed))',     value: data.signed,              stage: 95 },
    { key: 'becameLaw',           label: 'Became law',           color: 'hsl(var(--status-law))',        value: data.becameLaw,           stage: 100 },
  ].filter((s) => s.value > 0);

  if (totalBills === 0) {
    return <p className="text-sm text-muted-foreground">No bill status data available.</p>;
  }

  return (
    <div className="space-y-5">
      {/* Stacked horizontal bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-sm border border-border">
        {stages.map((s) => {
          const w = (s.value / totalBills) * 100;
          if (w <= 0) return null;
          return (
            <button
              key={s.key}
              onClick={() => onSegmentClick('status', s.stage)}
              aria-label={`${s.label}: ${s.value} bills`}
              className="block h-full hover:opacity-80 transition-opacity"
              style={{ width: `${w}%`, backgroundColor: s.color }}
            />
          );
        })}
      </div>

      {/* Legend / data table */}
      <ul className="divide-y divide-border border-y border-border">
        {stages.map((s) => {
          const pct = ((s.value / totalBills) * 100).toFixed(1);
          return (
            <li key={s.key}>
              <button
                onClick={() => onSegmentClick('status', s.stage)}
                className="grid grid-cols-12 items-center gap-3 w-full py-2.5 px-1 text-left hover:bg-secondary/60 transition-colors group"
              >
                <span
                  className="col-span-1 inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="col-span-7 sm:col-span-7 text-sm text-foreground">
                  {s.label}
                </span>
                <span className="col-span-2 text-right font-mono text-xs text-muted-foreground tabular">
                  {pct}%
                </span>
                <span className="col-span-2 text-right font-mono text-sm font-medium text-foreground tabular">
                  {s.value.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Top policy areas — minimal horizontal bar list
 * ───────────────────────────────────────────────────────────────────── */

interface PolicyAreaListProps {
  data: Array<{ name: string; count: number }>;
  onItemClick: (area: string) => void;
}

function PolicyAreaList({ data, onItemClick }: PolicyAreaListProps) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No policy area data available.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <ol className="space-y-2.5">
      {data.slice(0, 8).map((item) => {
        const w = (item.count / max) * 100;
        return (
          <li key={item.name}>
            <button
              onClick={() => onItemClick(item.name)}
              className="w-full text-left group"
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-sm text-foreground group-hover:underline underline-offset-2 decoration-border truncate">
                  {item.name}
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular shrink-0">
                  {item.count.toLocaleString()}
                </span>
              </div>
              <div className="h-[3px] w-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-foreground/80 group-hover:bg-foreground transition-colors"
                  style={{ width: `${w}%` }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Sponsor leaderboard — proper editorial table
 * ───────────────────────────────────────────────────────────────────── */

interface SponsorTableProps {
  data: Array<{ name: string; count: number; party?: string; state?: string }>;
  onSponsorClick: (name: string) => void;
}

function SponsorTable({ data, onSponsorClick }: SponsorTableProps) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No sponsor data available.</p>;
  }

  return (
    <div className="border-y border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="label-eyebrow text-left py-2 pr-3 w-8">#</th>
            <th className="label-eyebrow text-left py-2 pr-3">Member</th>
            <th className="label-eyebrow text-left py-2 px-3 hidden sm:table-cell">Party</th>
            <th className="label-eyebrow text-left py-2 px-3 hidden sm:table-cell">State</th>
            <th className="label-eyebrow text-right py-2 pl-3">Bills</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.slice(0, 10).map((s, i) => (
            <tr
              key={s.name}
              className="hover:bg-secondary/50 transition-colors cursor-pointer"
              onClick={() => onSponsorClick(s.name)}
            >
              <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground tabular">
                {i + 1}
              </td>
              <td className="py-2.5 pr-3 text-sm font-medium text-foreground">
                {s.name}
                <span className="ml-2 sm:hidden font-mono text-xs text-muted-foreground">
                  {[s.party, s.state].filter(Boolean).join(' · ')}
                </span>
              </td>
              <td className="py-2.5 px-3 text-sm text-muted-foreground hidden sm:table-cell">
                {s.party || '—'}
              </td>
              <td className="py-2.5 px-3 text-sm text-muted-foreground hidden sm:table-cell">
                {s.state || '—'}
              </td>
              <td className="py-2.5 pl-3 text-right font-mono text-sm font-medium text-foreground tabular">
                {s.count.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Historical comparison — quiet bar chart
 * ───────────────────────────────────────────────────────────────────── */

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
    return <p className="text-sm text-muted-foreground">No historical data available.</p>;
  }
  const sorted = [...data].sort((a, b) => a.congress - b.congress);
  const max = Math.max(...sorted.map((d) => d.totalCount), 1);

  return (
    <div className="border-y border-border py-6">
      <div className="flex items-end justify-between gap-2 sm:gap-4 h-44">
        {sorted.map((item) => {
          const heightPct = (item.totalCount / max) * 100;
          const isSelected = item.congress === selectedCongress;
          return (
            <button
              key={item.congress}
              onClick={() => onCongressClick(item.congress)}
              className="group flex-1 flex flex-col items-center gap-2 min-w-0"
              aria-label={`${item.congress}th Congress: ${item.totalCount.toLocaleString()} bills`}
            >
              <span
                className={cn(
                  'font-mono text-[11px] tabular',
                  isSelected ? 'text-foreground font-semibold' : 'text-muted-foreground'
                )}
              >
                {item.totalCount.toLocaleString()}
              </span>
              <div
                className={cn(
                  'w-full max-w-[44px] transition-colors',
                  isSelected
                    ? 'bg-foreground'
                    : 'bg-foreground/30 group-hover:bg-foreground/60'
                )}
                style={{ height: `${Math.max(heightPct, 4)}%` }}
              />
              <span
                className={cn(
                  'font-mono text-[11px] tabular',
                  isSelected ? 'text-foreground font-semibold' : 'text-muted-foreground'
                )}
              >
                {item.congress}
                {getOrdinalSuffix(item.congress)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
