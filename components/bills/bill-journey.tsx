'use client';

import { useEffect } from 'react';
import { cn, formatCount } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { StageTrack, stageFill } from '@/components/brand/status';
import { SourceLine } from '@/components/brand/section';
import { getStageStep, PATH_LABELS, stagePath, stagePathNote } from '@/lib/utils/bill-stages';
import {
  axisTicks,
  congressClock,
  formatDay,
  journeyView,
  type BillJourney,
  type Chapter,
  type JourneyEvent,
} from '@/lib/bill-journey';
import { formatCongressOrdinal } from '@/lib/congress';
import { BillStages } from '@/lib/utils/bill-stages';

/**
 * The lower half of the bill page's status panel: how the bill got where it is
 * (Documentation/brand.md, "Journey"). A bar drawn to scale, one segment per
 * stage as long as the bill stayed there; under it, each stage's length in
 * days and what happened in it, votes included. A bill still on its way also
 * gets the Congress clock: how long is left before it expires.
 *
 * The panel's top half (the stage, in words, with its glyph) is the caller's.
 */
export function BillJourneyPanel({
  billId,
  billType,
  congress,
  introducedDate,
  journey,
  today,
  noun,
}: {
  billId: string;
  billType: string;
  congress: number;
  introducedDate: string;
  journey: BillJourney;
  today: string;
  noun: string;
}) {
  const view = journeyView({ journey, billType, congress, today });
  const drawn = view.chapters.length >= 2;
  const showClock = !view.finish;
  // Without a bar, the track is drawn on the measure's own road: a resolution
  // ends at "Agreed to" (Documentation/brand.md, "The road a measure travels").
  const { step, total } = getStageStep(journey.finalStage, billType);
  const roadEnd = PATH_LABELS[stagePath(billType)][total - 1];
  const roadNote = stagePathNote(billType);

  useEffect(() => {
    analytics.billJourneyViewed({
      bill_id: billId,
      progress_stage: journey.finalStage,
      chapters: view.chapters.length,
      total_days: view.totalDays,
      outcome: view.finish ?? (view.expired ? 'expired' : 'open'),
      bar_drawn: drawn,
    });
    // Once per bill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId]);

  return (
    <div>
      {drawn ? (
        <JourneyBar view={view} finalStage={journey.finalStage} />
      ) : (
        <>
          <StageTrack stage={journey.finalStage} billType={billType} labels size="lg" />
          {/* StageTrack drops its step names below `sm`; the two ends still
              say which way the track runs. */}
          <div className="mt-2.5 flex justify-between text-xs font-medium leading-4 sm:hidden" aria-hidden="true">
            <span className="text-ink">Introduced</span>
            <span className={step === total ? 'text-ink' : 'text-ink-3'}>{roadEnd}</span>
          </div>
          {roadNote && <p className="mt-4 max-w-measure text-sm leading-relaxed text-ink-2">{roadNote}</p>}
        </>
      )}

      {drawn && (
        <ol
          className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-[repeat(var(--chapters),minmax(0,1fr))]"
          style={{ ['--chapters' as string]: view.chapters.length }}
        >
          {view.chapters.map((chapter) => (
            <ChapterColumn key={`${chapter.stage}-${chapter.start}`} chapter={chapter} />
          ))}
        </ol>
      )}

      {showClock && (
        <CongressClock
          congress={congress}
          today={today}
          introducedDate={introducedDate}
          noun={noun}
          billType={billType}
          stage={journey.finalStage}
        />
      )}

      <SourceLine className="mt-6 border-t border-line pt-4">
        Source: Congress.gov · {formatCount(journey.actionCount)}{' '}
        {journey.actionCount === 1 ? 'action' : 'actions'} on the record
      </SourceLine>
    </div>
  );
}

function JourneyBar({ view, finalStage }: { view: ReturnType<typeof journeyView>; finalStage: number }) {
  const first = view.chapters[0];
  const ticks = axisTicks(first.start, view.endDate);
  const ending =
    view.finish === 'law'
      ? `became law on ${formatDay(view.endDate)}`
      : view.finish === 'signed'
        ? `was signed into law on ${formatDay(view.endDate)}`
        : view.finish === 'vetoed'
        ? `was vetoed on ${formatDay(view.endDate)}`
        : view.finish === 'adopted'
          ? `was adopted on ${formatDay(view.endDate)}`
          : view.expired && finalStage === BillStages.TO_PRESIDENT
            ? `was on the President's desk when the Congress ended on ${formatDay(view.endDate)}`
            : view.expired
            ? `expired on ${formatDay(view.endDate)}`
            : 'is still on its way';
  const label =
    view.chapters.map((c) => `${c.name}: ${c.days} ${c.days === 1 ? 'day' : 'days'}`).join('; ') +
    `. It ${ending}.`;

  return (
    <div>
      <div className="flex h-4 items-center gap-[3px]" role="img" aria-label={label}>
        {view.chapters.map((c) => (
          <span
            key={`${c.stage}-${c.start}`}
            aria-hidden="true"
            className={cn('h-4 min-w-[6px] rounded-xs', stageFill(c.stage))}
            style={{ flexGrow: Math.max(c.days, 1), flexBasis: 0 }}
          />
        ))}
        {view.finish && (
          <span aria-hidden="true" className={cn('h-4 w-4 shrink-0 rounded-full', stageFill(finalStage))} />
        )}
      </div>
      <div className="relative mt-2 h-4 font-mono text-xs leading-4 text-ink-3 tabular" aria-hidden="true">
        {ticks.map((t, i) => (
          <span
            key={`${t.label}-${i}`}
            className={cn(
              'absolute top-0 whitespace-nowrap',
              i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
              // Only the two ends on a phone; the months between need the width.
              i !== 0 && i !== ticks.length - 1 && 'hidden sm:inline',
            )}
            style={{ left: `${t.pct}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChapterColumn({ chapter }: { chapter: Chapter }) {
  const unit = chapter.days === 1 ? 'day' : 'days';
  return (
    <li className="min-w-0">
      <span aria-hidden="true" className={cn('block h-[3px] rounded-xs', stageFill(chapter.stage))} />
      <p className="mt-4 flex items-baseline gap-2">
        <span className="font-serif text-display-md text-ink tabular">
          {chapter.days === 0 ? 'Today' : formatCount(chapter.days)}
        </span>
        {chapter.days > 0 && (
          <span className="text-sm text-ink-3">{chapter.ongoing ? `${unit} so far` : unit}</span>
        )}
      </p>
      <p className="mt-0.5 text-[15px] font-medium leading-snug text-ink">{chapter.name}</p>
      {chapter.events.length > 0 && (
        <ul className="mt-4 space-y-3.5">
          {chapter.events.map((e, i) => (
            <EventLine key={`${e.kind}-${e.date}-${i}`} event={e} />
          ))}
        </ul>
      )}
    </li>
  );
}

function EventLine({ event }: { event: JourneyEvent }) {
  const hasTally = event.yeas !== undefined && event.nays !== undefined;
  const total = hasTally ? event.yeas! + event.nays! : 0;
  return (
    <li>
      <p className="font-mono text-xs leading-4 text-ink-3 tabular">{formatDay(event.date)}</p>
      <p className="mt-0.5 text-sm leading-5 text-ink-2">
        {event.label}
        {event.how ? `, by ${event.how}` : ''}.
      </p>
      {hasTally && total > 0 && (
        <div className="mt-2 flex items-center gap-2.5">
          <div
            className="flex h-2 w-[140px] gap-0.5"
            role="img"
            aria-label={`${event.yeas} yes, ${event.nays} no`}
          >
            <span
              aria-hidden="true"
              className="block rounded-xs bg-ink"
              style={{ width: `${(event.yeas! / total) * 100}%` }}
            />
            <span aria-hidden="true" className="block flex-1 rounded-xs border border-line-strong bg-sunken" />
          </div>
          <span className="font-mono text-xs text-ink tabular" aria-hidden="true">
            {event.yeas}–{event.nays}
          </span>
        </div>
      )}
    </li>
  );
}

/**
 * Every bill still pending when a Congress ends dies with it. The bar is the
 * whole two-year Congress, with the bill's introduction marked on it.
 */
function CongressClock({
  congress,
  today,
  introducedDate,
  noun,
  billType,
  stage,
}: {
  congress: number;
  today: string;
  introducedDate: string;
  noun: string;
  billType: string;
  stage: number;
}) {
  const clock = congressClock(congress, today, introducedDate);
  const ordinal = formatCongressOrdinal(congress);
  // The same classification as the track (printed forms like "H.Con.Res." too).
  const goesToPresident = stagePath(billType) === 'law';
  const outcome = goesToPresident ? 'become law' : 'been adopted';

  // Presented but neither signed nor vetoed on the record: a pocket veto or
  // an action not yet synced. "Expired" would claim more than the record does.
  if (clock.ended && stage === BillStages.TO_PRESIDENT) {
    return (
      <p className="mt-8 border-t border-line pt-6 text-sm leading-relaxed text-ink-2">
        The {ordinal} Congress ended on{' '}
        <span className="font-mono text-ink tabular">{formatDay(clock.end)}</span> with this {noun} on
        the President’s desk. The record shows no signature or veto.
      </p>
    );
  }

  if (clock.ended) {
    return (
      <p className="mt-8 border-t border-line pt-6 text-sm leading-relaxed text-ink-2">
        This {noun} expired when the {ordinal} Congress ended on{' '}
        <span className="font-mono text-ink tabular">{formatDay(clock.end)}</span>. To move again it
        would have to be introduced in a new Congress.
      </p>
    );
  }

  return (
    <div className="mt-8 border-t border-line pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
        <p className="text-base text-ink-2">
          <span className="font-serif text-display-sm text-ink tabular sm:text-display-md">
            {formatCount(clock.daysLeft)} {clock.daysLeft === 1 ? 'day' : 'days'}
          </span>{' '}
          left in the {ordinal} Congress
        </p>
        <p className="max-w-[520px] text-sm text-ink-2 sm:text-right">
          A {noun} that has not {outcome} when it ends on {formatDay(clock.end)} dies, and would have
          to be introduced again.
        </p>
      </div>
      <div
        className="relative mt-4 h-8"
        role="img"
        aria-label={`The ${ordinal} Congress runs from ${formatDay(clock.start)} to ${formatDay(clock.end)}. This ${noun} was introduced on ${formatDay(introducedDate)}; ${clock.daysLeft} days are left.`}
      >
        <div className="absolute inset-x-0 top-2.5 flex h-3 gap-0.5" aria-hidden="true">
          <span className="block rounded-xs bg-sunken" style={{ width: `${clock.elapsedPct}%` }} />
          <span className="block flex-1 rounded-xs border border-ink bg-[repeating-linear-gradient(135deg,transparent_0_4px,hsl(var(--line))_4px_5px)]" />
        </div>
        <span
          aria-hidden="true"
          className="absolute top-0 block h-8 w-0.5 -translate-x-1/2 bg-ink"
          style={{ left: `${clock.introducedPct}%` }}
        />
      </div>
      <div className="relative mt-1 h-4 font-mono text-xs leading-4 text-ink-3 tabular" aria-hidden="true">
        <span className="absolute left-0">{formatDay(clock.start)}</span>
        <span className="absolute right-0">{formatDay(clock.end)}</span>
      </div>
      <p className="mt-2 font-mono text-xs leading-4 text-ink tabular">
        Introduced {formatDay(introducedDate)}
      </p>
    </div>
  );
}
