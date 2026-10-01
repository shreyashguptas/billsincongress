/**
 * Everything the bill page's journey and dot field compute from what the
 * server sent: chapters with their lengths in days, the axis, the Congress
 * clock, the peer groups and the headline that states them.
 *
 * Pure and date-explicit — `today` is always passed in, never read from the
 * clock here — so the server render and the browser agree, and the tests can
 * pin a day.
 */
import type { BillJourney, JourneyEvent } from '../convex/billJourney';
import { BillStages, stageLabel } from './utils/bill-stages';
import { congressStartYear, formatCongressOrdinal } from './congress';
import { formatCount } from './utils/format';

export type { BillJourney, JourneyEvent };

const MS_PER_DAY = 86_400_000;

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / MS_PER_DAY);
}

/** Whole days from `from` to `to` (ISO dates), never negative. */
export function daysBetween(from: string, to: string): number {
  return Math.max(0, dayNumber(to) - dayNumber(from));
}

/** "Mar 31, 2025". */
export function formatDay(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatMonth(iso: string, withYear: boolean): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** A Congress runs from noon on Jan 3 of its first year to Jan 3 two years on. */
export function congressBounds(congress: number): { start: string; end: string } {
  const year = congressStartYear(congress);
  return { start: `${year}-01-03`, end: `${year + 2}-01-03` };
}

/**
 * Where a measure's road ends. A bill or joint resolution ends when it becomes
 * law or is vetoed. A simple resolution (H.Res., S.Res.) never goes to the
 * other chamber or the President: passing its own chamber is adoption. A
 * concurrent resolution is adopted once both chambers pass it.
 */
export function finishOf(
  stage: number,
  billType: string,
): 'law' | 'vetoed' | 'adopted' | null {
  if (stage === BillStages.BECAME_LAW) return 'law';
  if (stage === BillStages.VETOED) return 'vetoed';
  const type = (billType || '').toLowerCase();
  if ((type === 'hres' || type === 'sres') && stage >= BillStages.PASSED_ONE_CHAMBER) return 'adopted';
  if ((type === 'hconres' || type === 'sconres') && stage >= BillStages.PASSED_BOTH_CHAMBERS) {
    return 'adopted';
  }
  return null;
}

export type Chapter = {
  stage: number;
  name: string;
  start: string;
  end: string;
  days: number;
  /** Still in this stage today. */
  ongoing: boolean;
  events: JourneyEvent[];
};

export type JourneyView = {
  chapters: Chapter[];
  /** The day the road ended, or today (or the Congress's last day) if it has not. */
  endDate: string;
  finish: ReturnType<typeof finishOf>;
  /** The Congress ended with this bill still on the way. */
  expired: boolean;
  totalDays: number;
};

function chapterName(stage: number, events: JourneyEvent[]): string {
  if (stage === BillStages.PASSED_ONE_CHAMBER) {
    const passed = events.find((e) => e.kind === 'passed');
    if (passed?.chamber === 'house') return 'Passed the House';
    if (passed?.chamber === 'senate') return 'Passed the Senate';
  }
  return stageLabel(stage);
}

/**
 * The journey as chapters: one per stage the bill spent time in, each as long
 * as the bill stayed there. A stage left the same day it was reached (the usual
 * introduction-and-referral day) hands its moments to the next chapter rather
 * than drawing a zero-width one. A finished bill's last stage is its end point,
 * not a chapter. Moments after the end (a committee report filed after the
 * signing) are left out: they are not part of the road.
 */
export function journeyView(input: {
  journey: BillJourney;
  billType: string;
  congress: number;
  today: string;
}): JourneyView {
  const { journey, billType, congress, today } = input;
  const steps = journey.steps;
  const finish = finishOf(journey.finalStage, billType);
  const { end: congressEnd } = congressBounds(congress);
  const last = steps[steps.length - 1];

  const expired = !finish && today >= congressEnd;
  const openEnd = expired ? congressEnd : today < last.date ? last.date : today;
  const endDate = finish ? last.date : openEnd;

  // A finished bill's final step is its end point; every earlier step is a chapter.
  const segmentSteps = finish && steps.length > 1 ? steps.slice(0, -1) : steps;
  const raw: Chapter[] = segmentSteps.map((s, i) => {
    const end = i + 1 < steps.length ? steps[i + 1].date : endDate;
    return {
      stage: s.stage,
      name: '',
      start: s.date,
      end,
      days: daysBetween(s.date, end),
      ongoing: !finish && !expired && i === steps.length - 1,
      events: [],
    };
  });

  for (const event of journey.events) {
    if (event.date > endDate) continue;
    let idx = raw.findIndex((c, i) => event.date >= c.start && (event.date < c.end || i === raw.length - 1));
    if (idx === -1) idx = 0;
    raw[idx].events.push(event);
  }

  const chapters: Chapter[] = [];
  let carried: JourneyEvent[] = [];
  raw.forEach((c, i) => {
    const isLast = i === raw.length - 1;
    if (c.days === 0 && !isLast) {
      carried = [...carried, ...c.events];
      return;
    }
    const merged = { ...c, events: [...carried, ...c.events] };
    carried = [];
    if (c.days === 0 && isLast && finish && chapters.length > 0) {
      const prev = chapters[chapters.length - 1];
      prev.events = [...prev.events, ...merged.events];
      return;
    }
    chapters.push(merged);
  });
  for (const c of chapters) c.name = chapterName(c.stage, c.events);

  return {
    chapters,
    endDate,
    finish,
    expired,
    totalDays: steps.length ? daysBetween(steps[0].date, endDate) : 0,
  };
}

/**
 * Labels along the journey bar: its two ends, and month starts between them,
 * thinned so they never crowd (none within 9% of another).
 */
export function axisTicks(start: string, end: string): Array<{ label: string; pct: number }> {
  const span = daysBetween(start, end);
  if (span === 0) return [{ label: formatDay(start), pct: 0 }];
  const startYear = start.slice(0, 4);
  const ticks: Array<{ label: string; pct: number }> = [{ label: formatMonth(start, true), pct: 0 }];
  const endTick = { label: formatMonth(end, end.slice(0, 4) !== startYear), pct: 100 };
  if (span >= 60) {
    const months = Math.round(span / 30.4);
    const every = Math.max(1, Math.ceil(months / 8));
    const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    let n = 0;
    while (cursor.toISOString().slice(0, 10) < end) {
      const iso = cursor.toISOString().slice(0, 10);
      const pct = (daysBetween(start, iso) / span) * 100;
      const prev = ticks[ticks.length - 1].pct;
      if (n % every === 0 && pct - prev >= 9 && 100 - pct >= 9) {
        ticks.push({ label: formatMonth(iso, iso.slice(5, 7) === '01'), pct });
      }
      n++;
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  ticks.push(endTick);
  return ticks;
}

/** The two-year Congress as a bar: how much has gone and how much is left. */
export function congressClock(congress: number, today: string, introducedDate: string) {
  const { start, end } = congressBounds(congress);
  const length = daysBetween(start, end);
  const at = (iso: string) => Math.min(100, Math.max(0, (daysBetween(start, iso) / length) * 100));
  return {
    start,
    end,
    ended: today >= end,
    daysLeft: daysBetween(today, end),
    elapsedPct: at(today),
    introducedPct: at(introducedDate),
  };
}

/** Path order, with Vetoed after the President as on the home page's card. */
const PEER_ORDER = [
  BillStages.INTRODUCED,
  BillStages.IN_COMMITTEE,
  BillStages.PASSED_ONE_CHAMBER,
  BillStages.PASSED_BOTH_CHAMBERS,
  BillStages.TO_PRESIDENT,
  BillStages.SIGNED_BY_PRESIDENT,
  BillStages.VETOED,
  BillStages.BECAME_LAW,
] as number[];

/** "97.2%", and "<0.1%" for a group too small to round to one decimal. */
export function formatShare(count: number, total: number): string {
  if (total === 0) return '0%';
  const pct = (count / total) * 100;
  if (count > 0 && pct < 0.1) return '<0.1%';
  return `${pct.toFixed(1)}%`;
}

export function peerGroups(
  stageCounts: Array<{ stage: number; count: number }>,
): Array<{ stage: number; count: number }> {
  const rank = (s: number) => {
    const i = PEER_ORDER.indexOf(s);
    return i === -1 ? PEER_ORDER.length : i;
  };
  return stageCounts
    .filter((g) => g.count > 0)
    .sort((a, b) => rank(a.stage) - rank(b.stage) || a.stage - b.stage);
}

/** The dot field's headline: the finding about laws, in a sentence. */
export function peerHeadline(input: {
  topic: string;
  total: number;
  lawCount: number;
  billIsLaw: boolean;
  congress: number;
  today: string;
}): string {
  const { topic, total, lawCount, billIsLaw, congress, today } = input;
  const current = today < congressBounds(congress).end;
  const where = current ? 'this Congress' : `in the ${formatCongressOrdinal(congress)} Congress`;
  const set = `${formatCount(total)} ${topic} bills and resolutions ${where}`;
  if (billIsLaw && lawCount === 1) return `Of ${set}, this is the only one that became law.`;
  if (billIsLaw) return `${formatCount(lawCount)} of ${set} became law. This is one of them.`;
  if (lawCount === 0) {
    return current ? `None of the ${set} has become law yet.` : `None of the ${set} became law.`;
  }
  const verb = current ? (lawCount === 1 ? 'has become' : 'have become') : 'became';
  return `${formatCount(lawCount)} of ${set} ${verb} law.`;
}
