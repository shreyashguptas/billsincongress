'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useConvexEnabled } from '../../ConvexClientProvider';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shape of the SSR-loaded data passed through from app/page.tsx.
// Each field mirrors the return type of its Convex query.
export type InitialDashboardData = {
  allCongress: FunctionReturnType<typeof api.bills.getAllCongressOverview>;
  dashboard: FunctionReturnType<typeof api.bills.getCongressDashboard>;
  house: FunctionReturnType<typeof api.bills.getChamberDeepBreakdown>;
  senate: FunctionReturnType<typeof api.bills.getChamberDeepBreakdown>;
};

// The fully-loaded report for a single Congress. We keep the last loaded view
// on screen (dimmed) while a newly-selected Congress loads, then cross-fade to
// the new numbers — so switching Congress never blanks the page to a skeleton.
type DashboardView = {
  congress: number;
  dashboard: NonNullable<InitialDashboardData['dashboard']>;
  house: InitialDashboardData['house'];
  senate: InitialDashboardData['senate'];
};

interface DashboardProps {
  initialCongress?: number;
  initialData?: InitialDashboardData | null;
}

export default function Dashboard({
  initialCongress = 119,
  initialData = null,
}: DashboardProps) {
  const convexEnabled = useConvexEnabled();
  if (!convexEnabled) {
    return <ConvexNotConfigured />;
  }
  return (
    <DashboardInner
      initialCongress={initialCongress}
      initialData={initialData}
    />
  );
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

function DashboardInner({
  initialCongress = 119,
  initialData = null,
}: DashboardProps) {
  const router = useRouter();
  const [selectedCongress, setSelectedCongress] = useState(initialCongress);

  // While the user is on the SSR'd Congress, skip the live queries — the
  // initial render has all the data inline. Subscribing only happens when
  // the user clicks a different Congress button, which is rare on cold load.
  const isInitial = selectedCongress === initialCongress;

  const liveAll = useQuery(api.bills.getAllCongressOverview);
  const liveDashboard = useQuery(
    api.bills.getCongressDashboard,
    isInitial ? 'skip' : { congress: selectedCongress },
  );
  const liveHouse = useQuery(
    api.bills.getChamberDeepBreakdown,
    isInitial
      ? 'skip'
      : { congress: selectedCongress, chamber: 'house' as const },
  );
  const liveSenate = useQuery(
    api.bills.getChamberDeepBreakdown,
    isInitial
      ? 'skip'
      : { congress: selectedCongress, chamber: 'senate' as const },
  );

  // The historical chart spans every Congress, so it doesn't depend on
  // selectedCongress — keep it always-live so it picks up new data, falling
  // back to the SSR snapshot until the websocket replies.
  const allCongressData = liveAll ?? initialData?.allCongress;

  // Data for whichever Congress the user has currently selected. Each is
  // `undefined` while a freshly-selected Congress is still loading over the wire.
  const resolvedDashboard = isInitial ? initialData?.dashboard : liveDashboard;
  const resolvedHouse = isInitial ? initialData?.house : liveHouse;
  const resolvedSenate = isInitial ? initialData?.senate : liveSenate;

  // The last Congress whose data fully loaded. We keep showing it (dimmed)
  // while a newly-selected Congress loads, then cross-fade to the new numbers
  // once all of them have arrived — so switching never blanks to a skeleton.
  const [view, setView] = useState<DashboardView | null>(() =>
    initialData?.dashboard
      ? {
          congress: initialCongress,
          dashboard: initialData.dashboard,
          house: initialData.house,
          senate: initialData.senate,
        }
      : null,
  );

  useEffect(() => {
    if (resolvedDashboard && resolvedHouse !== undefined && resolvedSenate !== undefined) {
      setView({
        congress: selectedCongress,
        dashboard: resolvedDashboard,
        house: resolvedHouse,
        senate: resolvedSenate,
      });
    }
  }, [selectedCongress, resolvedDashboard, resolvedHouse, resolvedSenate]);

  // True while the user has picked a Congress whose data hasn't arrived yet —
  // we keep the previous report visible but dimmed until it does.
  const isSwitching = view !== null && view.congress !== selectedCongress;

  const congressNumbers =
    allCongressData?.filter((d) => d.totalCount > 0).map((d) => d.congress) || [];

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

  // Cold start only — nothing has ever loaded. Once we have a view, switching
  // Congress keeps the previous report on screen instead of dropping to this.
  if (!allCongressData || !view) {
    return <DashboardSkeleton />;
  }

  if (allCongressData.length === 0) {
    return (
      <div className="container-editorial py-24 text-center text-muted-foreground">
        No data available.
      </div>
    );
  }

  // Everything on screen is driven by the loaded `view`, not the just-clicked
  // selection, so every number belongs to the same Congress while switching.
  const viewCongress = view.congress;
  const congressDashboard = view.dashboard;
  const houseBreakdown = view.house;
  const senateBreakdown = view.senate;
  const currentStats = allCongressData.find((d) => d.congress === viewCongress);
  const currentTerm = getCongressTermYears(viewCongress);

  return (
    <div>
      {/* ── HERO / Editorial masthead ─────────────────────────────── */}
      <section className="border-b border-border">
        <div className="container-editorial py-10 sm:py-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <p className="label-eyebrow mb-3">
                The {viewCongress}
                {getOrdinalSuffix(viewCongress)} Congress
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

      {/* Data region — dims while a newly-picked Congress loads, then
          cross-fades to the new numbers (re-keyed on the loaded Congress). */}
      <div
        className={cn(
          'transition-opacity duration-300',
          isSwitching && 'opacity-50 pointer-events-none',
        )}
      >
        <div key={viewCongress} className="animate-fade-in">
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

      {/* ── Party & chamber breakdown ─────────────────────────────── */}
      <section className="border-b border-border">
        <div className="container-editorial py-12">
          <SectionHeader
            eyebrow="Across the aisle"
            title="Who's writing the bills"
            description="How sponsorship and passage split by party and chamber this Congress. The left column shows who introduces; the right shows whose bills actually become law."
          />
          <PartyChamberChart
            house={houseBreakdown}
            senate={senateBreakdown}
            onStateClick={(state) => handleDrillDown('state', state)}
          />
        </div>
      </section>

      {/* ── Monthly introduction cadence ─────────────────────────── */}
      <section className="border-b border-border">
        <div className="container-editorial py-12">
          <SectionHeader
            eyebrow="Session rhythm"
            title="Introductions, month by month"
            description="The pulse of the legislative calendar — when bills are actually filed, and how many of them eventually became law."
          />
          <MonthlyCadenceChart
            house={houseBreakdown}
            senate={senateBreakdown}
          />
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
            selectedCongress={viewCongress}
            onCongressClick={setSelectedCongress}
          />
        </div>
      </section>
        </div>
      </div>
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

  // "House bills" / "Senate bills" count ALL house-originated (hr, hjres,
  // hconres, hres) and senate-originated types. There is no single `billType`
  // filter value that matches that union, so we omit drill-downs on those two
  // cards rather than mislead the user with a narrower filter.
  const items: Array<{
    label: string;
    value: number;
    onClick?: () => void;
  }> = [
    { label: 'Bills introduced', value: stats.totalCount, onClick: () => onDrillDown('congress', stats.congress) },
    { label: 'House bills', value: stats.houseCount },
    { label: 'Senate bills', value: stats.senateCount },
    { label: 'Became law', value: dashboardData.statusBreakdown.becameLaw, onClick: () => onDrillDown('status', 100) },
  ];

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-x border-border">
      {items.map((item) => {
        const isClickable = !!item.onClick;
        const Tag = isClickable ? 'button' : 'div';
        return (
          <Tag
            key={item.label}
            onClick={item.onClick}
            className={cn(
              'group text-left px-5 py-4 transition-colors',
              isClickable ? 'hover:bg-secondary/60 cursor-pointer' : 'cursor-default'
            )}
          >
            <dt className="label-eyebrow mb-2">{item.label}</dt>
            <dd className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight tabular text-foreground">
              {item.value.toLocaleString()}
            </dd>
          </Tag>
        );
      })}
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
  // Drop empty congresses — they carry no signal and render as zero-height bars.
  const filtered = data.filter((d) => d.totalCount > 0);
  if (filtered.length === 0) {
    return <p className="text-sm text-muted-foreground">No historical data available.</p>;
  }
  const sorted = [...filtered].sort((a, b) => a.congress - b.congress);
  const max = Math.max(...sorted.map((d) => d.totalCount), 1);
  const MAX_BAR_HEIGHT_PX = 140;

  return (
    <div className="border-y border-border py-6">
      <div className="flex items-end justify-between gap-2 sm:gap-4">
        {sorted.map((item) => {
          const heightPx = Math.max(
            Math.round((item.totalCount / max) * MAX_BAR_HEIGHT_PX),
            2,
          );
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
                style={{ height: `${heightPx}px` }}
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

/* ─────────────────────────────────────────────────────────────────────
 * Party & chamber — stacked bars + laws-passed sidebar
 *
 * Two narratives in one view:
 *  1. Sponsorship share — how many bills each party introduces per chamber
 *  2. Passage gap       — the same breakdown, but filtered to laws that
 *                         actually made it onto the books
 * ───────────────────────────────────────────────────────────────────── */

type ChamberBreakdown = {
  chamber: 'house' | 'senate';
  total: number;
  partyCounts: { D: number; R: number; I: number; U: number };
  partyLawCounts: { D: number; R: number; I: number; U: number };
  stateCounts: Record<string, number>;
  monthly: Array<{ month: string; count: number; becameLaw: number }>;
};

interface PartyChamberChartProps {
  house: ChamberBreakdown | undefined;
  senate: ChamberBreakdown | undefined;
  onStateClick: (state: string) => void;
}

function PartyChamberChart({ house, senate, onStateClick }: PartyChamberChartProps) {
  if (!house || !senate) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
        <div className="lg:col-span-7 h-40 bg-secondary/60 rounded-sm animate-pulse" />
        <div className="lg:col-span-5 h-40 bg-secondary/60 rounded-sm animate-pulse" />
      </div>
    );
  }

  const totalBills = house.total + senate.total;
  const totalLaws =
    house.partyLawCounts.D + house.partyLawCounts.R + house.partyLawCounts.I + house.partyLawCounts.U +
    senate.partyLawCounts.D + senate.partyLawCounts.R + senate.partyLawCounts.I + senate.partyLawCounts.U;

  // Combine top states from both chambers
  const combinedStates = new Map<string, number>();
  for (const [state, count] of Object.entries(house.stateCounts)) {
    combinedStates.set(state, (combinedStates.get(state) || 0) + count);
  }
  for (const [state, count] of Object.entries(senate.stateCounts)) {
    combinedStates.set(state, (combinedStates.get(state) || 0) + count);
  }
  const topStates = Array.from(combinedStates.entries())
    .filter(([s]) => s && s !== '—')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const stateMax = topStates.length > 0 ? topStates[0][1] : 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
      {/* LEFT — chamber × party stacked bars */}
      <div className="lg:col-span-7 space-y-8">
        <ChamberPartyRow
          label="House"
          total={house.total}
          parties={house.partyCounts}
          laws={house.partyLawCounts}
        />
        <ChamberPartyRow
          label="Senate"
          total={senate.total}
          parties={senate.partyCounts}
          laws={senate.partyLawCounts}
        />

        {/* Footnote: totals & passage rate */}
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
          <span className="tabular">{totalBills.toLocaleString()}</span> bills
          introduced in total;{' '}
          <span className="tabular font-medium text-foreground">
            {totalLaws.toLocaleString()}
          </span>{' '}
          became law
          {totalBills > 0 && (
            <>
              {' '}— a passage rate of{' '}
              <span className="tabular">
                {((totalLaws / totalBills) * 100).toFixed(1)}%
              </span>
            </>
          )}
          .
        </p>
      </div>

      {/* RIGHT — top sponsoring states */}
      <div className="lg:col-span-5">
        <p className="label-eyebrow mb-4">Top sponsoring states</p>
        {topStates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No state data available.</p>
        ) : (
          <ol className="space-y-2.5">
            {topStates.map(([state, count]) => {
              const w = (count / stateMax) * 100;
              return (
                <li key={state}>
                  <button
                    onClick={() => onStateClick(state)}
                    className="w-full text-left group"
                    aria-label={`${state}: ${count} bills`}
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="font-mono text-xs tabular text-foreground group-hover:underline underline-offset-2 decoration-border">
                        {state}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground tabular shrink-0">
                        {count.toLocaleString()}
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
        )}
      </div>
    </div>
  );
}

/**
 * One chamber row: name · total, a stacked party bar, a compact data grid
 * below it covering introduced + became-law counts per party.
 */
function ChamberPartyRow({
  label,
  total,
  parties,
  laws,
}: {
  label: string;
  total: number;
  parties: { D: number; R: number; I: number; U: number };
  laws: { D: number; R: number; I: number; U: number };
}) {
  const lawsTotal = laws.D + laws.R + laws.I + laws.U;
  const order: Array<keyof typeof parties> = ['D', 'R', 'I', 'U'];
  const partyLabel: Record<keyof typeof parties, string> = {
    D: 'Democratic',
    R: 'Republican',
    I: 'Independent',
    U: 'Unaffiliated',
  };
  const partyColor: Record<keyof typeof parties, string> = {
    D: 'hsl(var(--party-d))',
    R: 'hsl(var(--party-r))',
    I: 'hsl(var(--party-i))',
    U: 'hsl(var(--party-u))',
  };

  // Only show parties that actually have data
  const presentParties = order.filter((p) => parties[p] > 0);

  return (
    <div>
      {/* Title row */}
      <div className="flex items-baseline justify-between mb-2.5">
        <h3 className="font-serif text-lg font-semibold tracking-tight">{label}</h3>
        <p className="font-mono text-xs text-muted-foreground tabular">
          {total.toLocaleString()} introduced · {lawsTotal.toLocaleString()} became law
        </p>
      </div>

      {/* Stacked bar for introductions */}
      <div className="flex h-3 w-full overflow-hidden rounded-sm border border-border">
        {presentParties.map((p) => {
          const w = total > 0 ? (parties[p] / total) * 100 : 0;
          if (w <= 0) return null;
          return (
            <div
              key={p}
              aria-label={`${partyLabel[p]}: ${parties[p].toLocaleString()} bills`}
              className="block h-full"
              style={{ width: `${w}%`, backgroundColor: partyColor[p] }}
            />
          );
        })}
      </div>

      {/* Table: party rows with introduced count, law count, passage rate */}
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {presentParties.map((p) => {
          const pct = total > 0 ? (parties[p] / total) * 100 : 0;
          const lawPct = parties[p] > 0 ? (laws[p] / parties[p]) * 100 : 0;
          return (
            <li key={p}>
              <div className="grid grid-cols-12 items-center gap-3 w-full py-2 px-1">
                <span
                  className="col-span-1 inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: partyColor[p] }}
                  aria-hidden="true"
                />
                <span className="col-span-4 sm:col-span-3 text-sm text-foreground">
                  {partyLabel[p]}
                </span>
                <span className="col-span-3 sm:col-span-2 text-right font-mono text-xs text-muted-foreground tabular">
                  {pct.toFixed(1)}%
                </span>
                <span className="col-span-4 sm:col-span-3 text-right font-mono text-sm font-medium text-foreground tabular">
                  {parties[p].toLocaleString()}
                </span>
                <span className="hidden sm:block col-span-3 text-right font-mono text-xs text-muted-foreground tabular">
                  {laws[p]} law{laws[p] === 1 ? '' : 's'}{' '}
                  <span className="text-muted-foreground/60">
                    ({lawPct.toFixed(1)}%)
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Monthly cadence — vertical bars for bills introduced each month, with
 * a thin inline marker showing how many of those eventually became law.
 * ───────────────────────────────────────────────────────────────────── */

interface MonthlyCadenceChartProps {
  house: ChamberBreakdown | undefined;
  senate: ChamberBreakdown | undefined;
}

function MonthlyCadenceChart({ house, senate }: MonthlyCadenceChartProps) {
  if (!house || !senate) {
    return (
      <div className="border-y border-border py-6">
        <div className="h-52 bg-secondary/40 rounded-sm animate-pulse" />
      </div>
    );
  }

  // Merge monthly counts from both chambers.
  const merged = new Map<string, { count: number; becameLaw: number }>();
  for (const m of [...house.monthly, ...senate.monthly]) {
    const e = merged.get(m.month) || { count: 0, becameLaw: 0 };
    e.count += m.count;
    e.becameLaw += m.becameLaw;
    merged.set(m.month, e);
  }

  const months = Array.from(merged.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));

  if (months.length === 0) {
    return <p className="text-sm text-muted-foreground">No timeline data available.</p>;
  }

  const introMax = Math.max(...months.map((m) => m.count), 1);
  const lawMax = Math.max(...months.map((m) => m.becameLaw), 1);
  const totalLaws = months.reduce((s, m) => s + m.becameLaw, 0);

  // Pick peaks for inline narration
  const sortedByCount = [...months].sort((a, b) => b.count - a.count);
  const peak = sortedByCount[0];
  const quietest = sortedByCount[sortedByCount.length - 1];
  const lawPeak = [...months]
    .filter((m) => m.becameLaw > 0)
    .sort((a, b) => b.becameLaw - a.becameLaw)[0];

  // With >18 bars we label only the January of each year + the latest month.
  // With fewer, label each.
  const labelEvery = months.length > 18 ? 3 : 1;

  return (
    <div className="space-y-5">
      <div className="border-y border-border py-6 space-y-0">
        {/* Top track — bills introduced (own scale, grows up) */}
        <div className="flex items-end justify-between gap-[3px] sm:gap-1 h-36">
          {months.map((m) => {
            const introHeightPct = (m.count / introMax) * 100;
            return (
              <div
                key={`intro-${m.month}`}
                className="group flex-1 flex flex-col items-center gap-2 min-w-0 h-full"
                aria-label={`${m.month}: ${m.count.toLocaleString()} bills introduced, ${m.becameLaw} became law`}
                title={`${m.month} · ${m.count.toLocaleString()} introduced · ${m.becameLaw} became law`}
              >
                <span className="font-mono text-[10px] tabular text-muted-foreground group-hover:text-foreground transition-colors">
                  {m.count.toLocaleString()}
                </span>
                <div className="flex-1 w-full flex justify-center items-end min-h-0">
                  <div
                    className="w-full max-w-[40px] bg-foreground/25 group-hover:bg-foreground/45 transition-colors"
                    style={{ height: `${Math.max(introHeightPct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Baseline + month labels */}
        <div className="flex items-stretch justify-between gap-[3px] sm:gap-1 border-y border-border/60 py-2 mt-1">
          {months.map((m, i) => {
            const showLabel = i % labelEvery === 0 || i === months.length - 1;
            const [year, month] = m.month.split('-');
            const monthLabel = MONTH_SHORT[parseInt(month, 10) - 1] ?? month;
            return (
              <div
                key={`label-${m.month}`}
                className="flex-1 min-w-0 flex flex-col items-center gap-0.5"
              >
                {showLabel ? (
                  <>
                    <span className="font-mono text-[10px] tabular text-muted-foreground">
                      {monthLabel}
                    </span>
                    {(monthLabel === 'Jan' || i === 0) && (
                      <span className="font-mono text-[9px] tabular text-muted-foreground/70">
                        '{year.slice(2)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-mono text-[10px] tabular text-transparent">·</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom track — bills that became law (own scale, grows down).
            Independent y-scale so single-digit counts are readable next to
            1000+ introductions. */}
        <div className="flex items-start justify-between gap-[3px] sm:gap-1 h-20 mt-1">
          {months.map((m) => {
            const lawHeightPct = (m.becameLaw / lawMax) * 100;
            return (
              <div
                key={`law-${m.month}`}
                className="group flex-1 flex flex-col items-center gap-2 min-w-0 h-full"
                aria-label={`${m.month}: ${m.becameLaw} became law`}
                title={`${m.month} · ${m.becameLaw} became law`}
              >
                <div className="flex-1 w-full flex justify-center items-start min-h-0">
                  {m.becameLaw > 0 && (
                    <div
                      className="w-full max-w-[40px] bg-foreground"
                      style={{ height: `${Math.max(lawHeightPct, 8)}%` }}
                    />
                  )}
                </div>
                <span className="font-mono text-[10px] tabular text-muted-foreground group-hover:text-foreground transition-colors h-3">
                  {m.becameLaw > 0 ? m.becameLaw : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend + narrative */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-4 bg-foreground/25" aria-hidden="true" />
            Introduced
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-4 bg-foreground" aria-hidden="true" />
            Became law
          </span>
          <span className="text-muted-foreground/60 hidden sm:inline">
            · each track scaled independently
          </span>
        </div>
        {peak && quietest && (
          <p className="max-w-md text-right leading-relaxed">
            Busiest:{' '}
            <span className="font-mono tabular text-foreground">
              {formatMonth(peak.month)}
            </span>{' '}
            ({peak.count.toLocaleString()}). Quietest:{' '}
            <span className="font-mono tabular text-foreground">
              {formatMonth(quietest.month)}
            </span>{' '}
            ({quietest.count.toLocaleString()}).{' '}
            <span className="tabular text-foreground">
              {totalLaws.toLocaleString()}
            </span>{' '}
            bills became law
            {lawPeak && (
              <>
                , with the most signed in{' '}
                <span className="font-mono tabular text-foreground">
                  {formatMonth(lawPeak.month)}
                </span>{' '}
                ({lawPeak.becameLaw})
              </>
            )}
            .
          </p>
        )}
      </div>
    </div>
  );
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatMonth(m: string): string {
  const [year, month] = m.split('-');
  const name = MONTH_SHORT[parseInt(month, 10) - 1] ?? month;
  return `${name} ${year ? `’${year.slice(2)}` : ''}`.trim();
}
