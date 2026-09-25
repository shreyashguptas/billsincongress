'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useConvexEnabled } from '@/components/convex-client-provider';
import { cn, formatCount } from '@/lib/utils';
import { AskPageContext } from '@/components/answers/ask-page-context';
import { SectionHeader } from '@/components/brand/section';
import { Skeleton } from '@/components/ui/skeleton';
import { analytics } from '@/lib/analytics';
import { formatCongressOrdinal, formatCongressProse } from '@/lib/congress';
import PodcastPromo from '@/components/podcast-promo';
import { hubByPath, topicSlug } from '@/lib/hubs';
import { SectionAsk, type HomeProps } from './home/shared';
import { HomeHero } from './home/hero';
import { StatStrip } from './home/stat-strip';
import { StageZoom } from './home/stage-zoom';
import { TopicWheel } from './home/topic-wheel';
import { SponsorsChart } from './home/sponsors-chart';
import { StateMap } from './home/state-map';

export type InitialDashboardData = {
  allCongress: FunctionReturnType<typeof api.bills.getAllCongressOverview>;
  dashboard: FunctionReturnType<typeof api.bills.getCongressDashboard>;
  house: FunctionReturnType<typeof api.bills.getChamberDeepBreakdown>;
  senate: FunctionReturnType<typeof api.bills.getChamberDeepBreakdown>;
};

// The fully-loaded report for a single Congress. The last loaded view stays on
// screen (dimmed) while a newly-selected Congress loads, then cross-fades to the
// new numbers — so switching Congress never blanks the page to a skeleton.
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
        <h2 className="mb-3 text-display-sm text-ink">
          Backend not connected
        </h2>
        <p className="mb-2 leading-relaxed text-ink-2">
          The live dashboard requires a Convex backend. Set the{' '}
          <code className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-[12px]">
            NEXT_PUBLIC_CONVEX_URL
          </code>{' '}
          environment variable and restart the dev server.
        </p>
        <p className="text-sm text-ink-3">
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

  // `undefined` while a freshly-selected Congress is still loading over the wire.
  const resolvedDashboard = isInitial ? initialData?.dashboard : liveDashboard;
  const resolvedHouse = isInitial ? initialData?.house : liveHouse;
  const resolvedSenate = isInitial ? initialData?.senate : liveSenate;

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

  // True while the picked Congress has not arrived yet; see DashboardView.
  const isSwitching = view !== null && view.congress !== selectedCongress;

  const congressNumbers =
    allCongressData?.filter((d) => d.totalCount > 0).map((d) => d.congress) || [];

  // Fall back to the NEWEST Congress when the requested one has no data
  // (e.g. `?congress=999`). Take the max explicitly rather than trusting the
  // array's order: the picker below used to sort this same array in place,
  // which would have silently made this the OLDEST Congress instead.
  useEffect(() => {
    if (congressNumbers.length > 0 && !congressNumbers.includes(selectedCongress)) {
      setSelectedCongress(Math.max(...congressNumbers));
    }
  }, [congressNumbers, selectedCongress]);

  /**
   * Where a topic link points (the topic wheel's legend and pinned topic).
   *
   * For the newest Congress this is the topic hub — a real page with an
   * explanation of what the grouping means. That matters beyond navigation:
   * the homepage is the only page Google currently indexes, and these rows
   * were `<button onClick={router.push}>`, so they passed no link equity to
   * the 33 topic pages at all.
   *
   * For any older Congress it stays a filtered /bills URL, because hub pages
   * always show the latest Congress — sending a reader looking at the 117th to
   * a page of 119th bills would silently answer a different question.
   *
   * The href is also only used if it resolves to a hub we actually build. These
   * names come from live Congress.gov data, and an unknown topic slug is a hard
   * 404 (see app/bills/topic/[slug]/page.tsx). Today the two lists match
   * exactly, but if Congress ever adds a 34th policy area, this falls back to
   * the filtered URL — which still works — instead of putting a dead link on
   * the one page search engines index.
   */
  const newestCongress =
    congressNumbers.length > 0 ? Math.max(...congressNumbers) : null;

  const policyAreaHref = (area: string) => {
    const filtered = `/bills?congress=${selectedCongress}&policyArea=${encodeURIComponent(area)}`;
    if (newestCongress === null || selectedCongress !== newestCongress) return filtered;
    const hubPath = `/bills/topic/${topicSlug(area)}`;
    return hubByPath(hubPath) ? hubPath : filtered;
  };

  const handleDrillDown = (filterType: string, filterValue: string | number) => {
    // Every dashboard stat/chart click that navigates by script goes through
    // here. Policy-area rows do NOT: they are real links, so they report the
    // same event directly and let the href do the navigating. If you are
    // looking for where a drilldown is measured, check both.
    analytics.dashboardDrilldownClicked(filterType, filterValue, selectedCongress);
    const params = new URLSearchParams();
    params.set('congress', selectedCongress.toString());
    params.set(filterType, filterValue.toString());
    router.push(`/bills?${params.toString()}`);
  };

  // Cold start only — nothing has ever loaded.
  if (!allCongressData || !view) {
    return <DashboardSkeleton />;
  }

  if (allCongressData.length === 0) {
    return (
      <div className="container-editorial py-24 text-center text-ink-3">
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

  const homeProps: HomeProps | null = congressDashboard
    ? {
        congress: viewCongress,
        dashboard: congressDashboard,
        house: houseBreakdown,
        senate: senateBreakdown,
        allCongress: allCongressData,
        congressNumbers,
        selectedCongress,
        onSelectCongress: setSelectedCongress,
        onDrillDown: handleDrillDown,
        policyAreaHref,
        starterInput: {
          congress: viewCongress,
          latestCongress: newestCongress,
          totalBills: congressDashboard.totalBills,
          topPolicyAreas: congressDashboard.topPolicyAreas,
          statusBreakdown: congressDashboard.statusBreakdown,
        },
      }
    : null;

  // `getCongressDashboard` returns null when a Congress has no stats row yet.
  // Say so rather than showing a skeleton that never resolves.
  if (!homeProps) {
    return (
      <div className="container-editorial py-24 text-center text-ink-3">
        No data available for the {formatCongressOrdinal(viewCongress)} Congress yet.
      </div>
    );
  }

  return (
    <div>
      {/* Tells the ask panel which Congress is on screen. Every catalog fetch
          otherwise defaults to the 119th, so a reader studying the 117th here
          and then asking a question was answered about a different Congress. */}
      <AskPageContext congress={viewCongress} />

      {/* Outside the keyed cross-fade below, so switching Congress does not
          remount the ask box and throw away a half-typed question. Its numbers
          still come from `view`, so they change with everything else. */}
      <HomeHero {...homeProps} />

      {/* Data region — dims while a newly-picked Congress loads, then
          cross-fades to the new numbers (re-keyed on the loaded Congress). */}
      <div
        className={cn(
          'transition-opacity duration-300',
          isSwitching && 'opacity-50 pointer-events-none',
        )}
      >
        <div key={viewCongress} className="animate-fade-in">
          <StatStrip {...homeProps} />
          <StageZoom {...homeProps} />
          <TopicWheel {...homeProps} />
          <SponsorsChart {...homeProps} />
          <StateMap {...homeProps} />

          {/* Monthly introduction cadence */}
          <section className="border-b border-line">
            <div className="container-editorial py-16 sm:py-24">
              <SectionHeader
                eyebrow="Session rhythm"
                title="Introductions, month by month"
                action={
                  <SectionAsk
                    question={`When during the ${formatCongressOrdinal(viewCongress)} Congress were bills actually introduced?`}
                  />
                }
              />
              <SectionNote>
                The pulse of the legislative calendar — when bills are actually filed, and how many of them eventually
                became law.
              </SectionNote>
              <MonthlyCadenceChart house={houseBreakdown} senate={senateBreakdown} />
            </div>
          </section>

          {/* Historical comparison */}
          <section className="border-b border-line">
            <div className="container-editorial py-16 sm:py-24">
              <SectionHeader
                eyebrow="In context"
                title="Volume across recent Congresses"
                action={
                  <SectionAsk
                    question={`How does the ${formatCongressOrdinal(viewCongress)} Congress compare to recent ones by volume?`}
                  />
                }
              />
              <SectionNote>
                Total bills introduced in each two-year session of Congress on record. Click a bar to switch the view.
              </SectionNote>
              <HistoricalChart
                data={allCongressData}
                selectedCongress={viewCongress}
                onCongressClick={setSelectedCongress}
              />
            </div>
          </section>
        </div>
      </div>

      {/* Podcast cross-promotion */}
      <section>
        <div className="container-editorial py-16 sm:py-24">
          <PodcastPromo placement="home" />
        </div>
      </section>
    </div>
  );
}

/** The line under a section header that says how to read its chart. */
function SectionNote({ children }: { children: React.ReactNode }) {
  return <p className="mb-10 mt-4 max-w-measure text-[15px] leading-relaxed text-ink-2">{children}</p>;
}

// Helpers

function DashboardSkeleton() {
  return (
    <div className="container-editorial space-y-10 py-16">
      <div className="space-y-4">
        <Skeleton className="h-3 w-32 rounded-xs" />
        <Skeleton className="h-14 w-3/4 rounded-sm" />
        <Skeleton className="h-4 w-2/3 rounded-xs" />
      </div>
      <div className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-none border-l border-line bg-sunken/50 first:border-l-0" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}

// Historical comparison — quiet bar chart

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
    return <p className="text-sm text-ink-3">No historical data available.</p>;
  }
  // Drop empty congresses — they carry no signal and render as zero-height bars.
  const filtered = data.filter((d) => d.totalCount > 0);
  if (filtered.length === 0) {
    return <p className="text-sm text-ink-3">No historical data available.</p>;
  }
  const sorted = [...filtered].sort((a, b) => a.congress - b.congress);
  const max = Math.max(...sorted.map((d) => d.totalCount), 1);
  const MAX_BAR_HEIGHT_PX = 140;

  return (
    <div className="border-y border-line py-8">
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
              className="focus-ring group flex min-w-0 flex-1 flex-col items-center gap-2 rounded-sm"
              title={formatCongressProse(item.congress)}
              aria-label={`${formatCongressProse(item.congress)}: ${formatCount(item.totalCount)} bills`}
            >
              <span
                className={cn(
                  'font-mono text-xs tabular',
                  isSelected ? 'font-medium text-ink' : 'text-ink-3'
                )}
              >
                {formatCount(item.totalCount)}
              </span>
              <div
                className={cn(
                  'w-full max-w-[44px] rounded-t-xs transition-colors',
                  isSelected
                    ? 'bg-ink'
                    : 'bg-ink/25 group-hover:bg-ink/50'
                )}
                style={{ height: `${heightPx}px` }}
              />
              <span
                className={cn(
                  'font-mono text-xs tabular',
                  isSelected ? 'font-medium text-ink' : 'text-ink-3'
                )}
              >
                {formatCongressOrdinal(item.congress)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Per-chamber breakdown, as returned by getChamberDeepBreakdown.

type ChamberBreakdown = {
  chamber: 'house' | 'senate';
  total: number;
  partyCounts: { D: number; R: number; I: number; U: number };
  partyLawCounts: { D: number; R: number; I: number; U: number };
  stateCounts: Record<string, number>;
  monthly: Array<{ month: string; count: number; becameLaw: number }>;
};

// Monthly cadence — vertical bars for bills introduced each month, with
// a thin inline marker showing how many of those eventually became law.

interface MonthlyCadenceChartProps {
  house: ChamberBreakdown | undefined;
  senate: ChamberBreakdown | undefined;
}

function MonthlyCadenceChart({ house, senate }: MonthlyCadenceChartProps) {
  if (!house || !senate) {
    return (
      <div className="border-y border-line py-8">
        <Skeleton className="h-52" />
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
    return <p className="text-sm text-ink-3">No timeline data available.</p>;
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
      <div className="border-y border-line py-8">
        {/* Top track — bills introduced (own scale, grows up) */}
        <div className="flex items-end justify-between gap-[3px] sm:gap-1 h-36">
          {months.map((m) => {
            const introHeightPct = (m.count / introMax) * 100;
            return (
              <div
                key={`intro-${m.month}`}
                className="group flex-1 flex flex-col items-center gap-2 min-w-0 h-full"
                aria-label={`${m.month}: ${formatCount(m.count)} bills introduced, ${m.becameLaw} became law`}
                title={`${m.month} · ${formatCount(m.count)} introduced · ${m.becameLaw} became law`}
              >
                {/* Too narrow to label every bar below lg; the title and label still carry it. */}
                <span className="hidden font-mono text-[10px] tabular text-ink-3 transition-colors group-hover:text-ink lg:block">
                  {formatCount(m.count)}
                </span>
                <div className="flex-1 w-full flex justify-center items-end min-h-0">
                  <div
                    className="w-full max-w-[40px] rounded-t-xs bg-ink/25 transition-colors group-hover:bg-ink/50"
                    style={{ height: `${Math.max(introHeightPct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Baseline + month labels */}
        <div className="mt-1 flex items-stretch justify-between gap-[3px] border-y border-line py-2 sm:gap-1">
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
                    <span className="font-mono text-[10px] tabular text-ink-3">
                      {monthLabel}
                    </span>
                    {(monthLabel === 'Jan' || i === 0) && (
                      <span className="font-mono text-[10px] tabular text-ink-3">
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
                      className="w-full max-w-[40px] rounded-b-xs bg-status-law"
                      style={{ height: `${Math.max(lawHeightPct, 8)}%` }}
                    />
                  )}
                </div>
                <span className="font-mono text-[10px] tabular text-ink-3 group-hover:text-ink transition-colors h-3">
                  {m.becameLaw > 0 ? m.becameLaw : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend + narrative */}
      <div className="flex flex-wrap items-start justify-between gap-4 text-sm text-ink-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-4 rounded-xs bg-ink/25" aria-hidden="true" />
            Introduced
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-4 rounded-xs bg-status-law" aria-hidden="true" />
            Became law
          </span>
          <span className="font-mono text-xs text-ink-3">
            each track scaled independently
          </span>
        </div>
        {peak && quietest && (
          <p className="max-w-md leading-relaxed sm:text-right">
            Busiest:{' '}
            <span className="font-mono tabular text-ink">
              {formatMonth(peak.month)}
            </span>{' '}
            ({formatCount(peak.count)}). Quietest:{' '}
            <span className="font-mono tabular text-ink">
              {formatMonth(quietest.month)}
            </span>{' '}
            ({formatCount(quietest.count)}).{' '}
            <span className="tabular text-ink">
              {formatCount(totalLaws)}
            </span>{' '}
            bills became law
            {lawPeak && (
              <>
                , with the most signed in{' '}
                <span className="font-mono tabular text-ink">
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
