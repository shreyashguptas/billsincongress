'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatCount } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { StageTrack, stageFill } from '@/components/brand/status';
import { SourceLine } from '@/components/brand/section';
import { Term, TermText } from '@/components/brand/term';
import { stageTermId, type TermId } from '@/lib/glossary';
import { getStageStep, roadLabels, stagePathNote } from '@/lib/utils/bill-stages';
import {
  axisTicks,
  congressClock,
  congressClockRule,
  formatDay,
  journeyView,
  type BillJourney,
  type Chapter,
  type JourneyEvent,
} from '@/lib/bill-journey';
import { formatCongressOrdinal } from '@/lib/congress';
import { BillStages } from '@/lib/utils/bill-stages';

/**
 * The bill page's "How it got here" section: how the bill got where it is
 * (documentation/brand.md, "Journey"). A bar drawn to scale, one segment per
 * stage as long as the bill stayed there; under it, each stage's length in
 * days and what happened in it, votes included. A bill still on its way also
 * gets the Congress clock: how long is left before it expires.
 *
 * The stage in words, with its glyph, is the caller's: it sits in the "Where it
 * stands" card at the top of the page, and this panel below the summary.
 *
 * On a phone the stages start collapsed to their phases (the rule, the days,
 * the name) and "Show every step (n)" opens the dated moments; from `sm` up
 * they are always open.
 */
export function BillJourneyPanel({
  billId,
  billType,
  congress,
  introducedDate,
  journey,
  today,
  noun,
  amendment = false,
  skipTerm = null,
}: {
  billId: string;
  billType: string;
  congress: number;
  introducedDate: string;
  journey: BillJourney;
  today: string;
  noun: string;
  /** A proposed constitutional amendment: its road ends at the states, not law. */
  amendment?: boolean;
  /** A word the page has already explained (the status card's stage). */
  skipTerm?: TermId | null;
}) {
  const view = journeyView({ journey, billType, congress, today });
  const terms = journeyTerms(view.chapters, billType, skipTerm);
  const drawn = view.chapters.length >= 2;
  const showClock = !view.finish;
  // Without a bar, the track is drawn on the measure's own road: a resolution
  // ends at "Agreed to" (documentation/brand.md, "The road a measure travels").
  const { step, total } = getStageStep(journey.finalStage, billType, amendment);
  const roadEnd = roadLabels(billType, amendment)[total - 1];
  const roadNote = stagePathNote(billType, amendment);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const eventCount = view.chapters.reduce((sum, c) => sum + c.events.length, 0);
  // Nothing to fold when no stage has a dated moment under it.
  const collapsed = !expanded && eventCount > 0;

  // "How it got here" in the status card links here: arriving by it
  // opens the steps, so the link does not land on a folded list.
  useEffect(() => {
    const open = () => {
      if (window.location.hash === '#bill-journey') setExpanded(true);
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

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
          <StageTrack stage={journey.finalStage} billType={billType} amendment={amendment} labels size="lg" />
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
        <>
          <ol
            id={listId}
            className={cn(
              'mt-8 grid gap-x-6 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-8 lg:grid-cols-[repeat(var(--chapters),minmax(0,1fr))]',
              // Collapsed on a phone: the phases two up, each a rule, its days and its name.
              collapsed ? 'grid-cols-2 gap-y-6' : 'gap-y-8',
            )}
            style={{ ['--chapters' as string]: view.chapters.length }}
          >
            {view.chapters.map((chapter) => (
              <ChapterColumn
                key={`${chapter.stage}-${chapter.start}`}
                chapter={chapter}
                collapsed={collapsed}
                terms={terms.get(chapter) ?? NO_TERMS}
              />
            ))}
          </ol>
          {eventCount > 0 && (
            <Button
              type="button"
              variant="outline"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => {
                if (!expanded) {
                  analytics.billJourneyExpanded({
                    bill_id: billId,
                    chapters: view.chapters.length,
                    events: eventCount,
                  });
                }
                setExpanded(!expanded);
              }}
              className="mt-6 w-full sm:hidden"
            >
              {expanded ? 'Show the phases only' : `Show every step (${formatCount(eventCount)})`}
              <ChevronDown
                className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', expanded && 'rotate-180')}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Button>
          )}
        </>
      )}

      {showClock && (
        <CongressClock
          congress={congress}
          today={today}
          introducedDate={introducedDate}
          noun={noun}
          billType={billType}
          stage={journey.finalStage}
          amendment={amendment}
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
      <div className="relative mt-2 h-[18px] text-xs text-ink-2 tabular" aria-hidden="true">
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

/** Which words one chapter explains: its own stage, and any first `how` or floor. */
type ChapterTerms = { stage: TermId | null; how: Set<number>; floor: Set<number>; law: Set<number> };
const NO_TERMS: ChapterTerms = { stage: null, how: new Set(), floor: new Set(), law: new Set() };

/**
 * Each civics word once, in reading order: a chapter's stage name, "by voice
 * vote", "to the floor", "Public Law". Repeating a dotted word on every line
 * of the timeline would turn help into noise.
 */
function journeyTerms(chapters: Chapter[], billType: string, skip: TermId | null) {
  const used = new Set<string>(skip ? [skip] : []);
  const out = new Map<Chapter, ChapterTerms>();
  for (const c of chapters) {
    const t: ChapterTerms = { stage: null, how: new Set(), floor: new Set(), law: new Set() };
    const stageTerm = stageTermId(c.stage, billType);
    if (stageTerm && !used.has(stageTerm)) {
      used.add(stageTerm);
      t.stage = stageTerm;
    }
    c.events.forEach((e, i) => {
      if (e.how && !used.has(HOW_TERM[e.how])) {
        used.add(HOW_TERM[e.how]);
        t.how.add(i);
      }
      if (/\bfloor\b/i.test(e.label) && !used.has('floor')) {
        used.add('floor');
        t.floor.add(i);
      }
      if (e.kind === 'became_law' && !used.has('public-law')) {
        used.add('public-law');
        t.law.add(i);
      }
    });
    out.set(c, t);
  }
  return out;
}

/**
 * The words a journey explains, in the order it explains them: what the bill
 * page's "Words to know" list draws on, so it names only words the page shows.
 */
export function journeyTermIds(journey: BillJourney, billType: string, congress: number, today: string): TermId[] {
  const view = journeyView({ journey, billType, congress, today });
  const terms = journeyTerms(view.chapters, billType, null);
  const ids: TermId[] = [];
  for (const c of view.chapters) {
    const t = terms.get(c) ?? NO_TERMS;
    if (t.stage) ids.push(t.stage);
    c.events.forEach((e, i) => {
      if (t.floor.has(i)) ids.push('floor');
      if (t.law.has(i) && /Public Law [\d-]+/.test(e.label)) ids.push('public-law');
      if (t.how.has(i) && e.how) ids.push(HOW_TERM[e.how]);
    });
  }
  return ids;
}

const HOW_TERM: Record<NonNullable<JourneyEvent['how']>, TermId> = {
  'voice vote': 'voice-vote',
  'unanimous consent': 'unanimous-consent',
};

function ChapterColumn({
  chapter,
  collapsed,
  terms,
}: {
  chapter: Chapter;
  collapsed: boolean;
  terms: ChapterTerms;
}) {
  const unit = chapter.days === 1 ? 'day' : 'days';
  return (
    <li className="min-w-0">
      <span aria-hidden="true" className={cn('block h-[3px] rounded-xs', stageFill(chapter.stage))} />
      <p className={cn('flex items-baseline gap-2 sm:mt-4', collapsed ? 'mt-3' : 'mt-4')}>
        <span
          className={cn(
            'font-serif text-ink tabular sm:text-display-md',
            collapsed ? 'text-display-sm' : 'text-display-md',
          )}
        >
          {chapter.days === 0 ? 'Today' : formatCount(chapter.days)}
        </span>
        {chapter.days > 0 && (
          <span className="text-sm text-ink-2">{chapter.ongoing ? `${unit} so far` : unit}</span>
        )}
      </p>
      {/* A grid label, so plain: "Words to know" holds the stage's meaning
          (brand.md, "Term"). */}
      <p className="mt-0.5 text-ui font-medium leading-snug text-ink">{chapter.name}</p>
      {chapter.events.length > 0 && (
        <ul className={cn('mt-4 space-y-3.5 sm:block', collapsed && 'hidden')}>
          {chapter.events.map((e, i) => (
            <EventLine
              key={`${e.kind}-${e.date}-${i}`}
              event={e}
              termHow={terms.how.has(i)}
              termFloor={terms.floor.has(i)}
              termLaw={terms.law.has(i)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function EventLine({
  event,
  termHow,
  termFloor,
  termLaw,
}: {
  event: JourneyEvent;
  termHow: boolean;
  termFloor: boolean;
  termLaw: boolean;
}) {
  const hasTally = event.yeas !== undefined && event.nays !== undefined;
  const total = hasTally ? event.yeas! + event.nays! : 0;
  return (
    <li>
      <p className="text-meta font-medium text-ink tabular">{formatDay(event.date)}</p>
      <p className="text-meta text-ink-2">
        <EventLabel label={event.label} floor={termFloor} law={termLaw} />
        {event.how && (
          <>
            , by {termHow ? <Term id={HOW_TERM[event.how]}>{event.how}</Term> : event.how}
          </>
        )}
        .
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
          <span className="text-meta text-ink tabular" aria-hidden="true">
            {event.yeas}–{event.nays}
          </span>
        </div>
      )}
    </li>
  );
}

/** "Became Public Law 119-105", with the law's name and "floor" explained. */
function EventLabel({ label, floor, law }: { label: string; floor: boolean; law: boolean }) {
  const lawName = law ? /Public Law [\d-]+/.exec(label) : null;
  if (lawName) {
    return (
      <>
        {label.slice(0, lawName.index)}
        <Term id="public-law">{lawName[0]}</Term>
        {label.slice(lawName.index + lawName[0].length)}
      </>
    );
  }
  if (floor) return <TermText text={label} terms={['floor']} />;
  return <>{label}</>;
}

/**
 * Every bill still pending when a Congress ends dies with it. The bar is the
 * whole two-year Congress, with the bill's introduction marked on it.
 *
 * The rule it states is the one that applies: a bill still in Congress dies,
 * but one already on the President's desk can still be signed in its 10 days;
 * a proposed amendment both chambers have passed has gone to the states.
 */
function CongressClock({
  congress,
  today,
  introducedDate,
  noun,
  billType,
  stage,
  amendment,
}: {
  congress: number;
  today: string;
  introducedDate: string;
  noun: string;
  billType: string;
  stage: number;
  amendment: boolean;
}) {
  const clock = congressClock(congress, today, introducedDate);
  const ordinal = formatCongressOrdinal(congress);
  const rule = congressClockRule({ congress, noun, billType, amendment });

  // Presented but neither signed nor vetoed on the record: a pocket veto or
  // an action not yet synced. "Expired" would claim more than the record does.
  if (clock.ended && stage === BillStages.TO_PRESIDENT) {
    return (
      <p className="mt-8 border-t border-line pt-6 text-sm leading-relaxed text-ink-2">
        The {ordinal} Congress ended on{' '}
        <span className="font-medium text-ink tabular">{formatDay(clock.end)}</span> with this {noun} on
        the President’s desk. The record shows no signature or veto.
      </p>
    );
  }

  if (clock.ended) {
    return (
      <p className="mt-8 border-t border-line pt-6 text-sm leading-relaxed text-ink-2">
        This {noun} expired when the {ordinal} Congress ended on{' '}
        <span className="font-medium text-ink tabular">{formatDay(clock.end)}</span>. To move again it
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
          {rule}
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
      <div className="relative mt-1 h-[18px] text-xs text-ink-2 tabular" aria-hidden="true">
        <span className="absolute left-0">{formatDay(clock.start)}</span>
        <span className="absolute right-0">{formatDay(clock.end)}</span>
      </div>
      <p className="mt-2 text-meta font-medium text-ink tabular">
        Introduced {formatDay(introducedDate)}
      </p>
    </div>
  );
}
