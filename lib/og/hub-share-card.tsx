import type { ReactElement } from 'react';
import { formatCongressOrdinal } from '@/lib/congress';
import { formatCount } from '@/lib/utils';
import { stageLabel } from '@/lib/utils/bill-stages';
import {
  BigFigure,
  C,
  CardFrame,
  INK_2,
  STAGE,
  StageTrack,
  SUNKEN,
  TOPIC_COLOURS,
} from './card-parts';

/**
 * The pictures a status, chamber or topic page's link unfurls into
 * (Documentation/brand.md, "Share card"). Same frame as a bill's card; the
 * body is the page's finding, stated as a figure and drawn.
 *
 * Every number here must be a complete count (AGENTS.md, "Answer accuracy"):
 * hub-share-data.ts only passes a figure it read in full, and a part it could
 * not read arrives as null and is left off the card rather than estimated.
 */

export type HubCardData =
  | { kind: 'status'; congress: number; stage: number; count: number; total: number }
  | {
      kind: 'chamber';
      congress: number;
      chamber: 'house' | 'senate';
      count: number;
      otherCount: number;
      /** Null unless the chamber's breakdown accounts for every one of its bills. */
      becameLaw: number | null;
    }
  | {
      kind: 'topic';
      congress: number;
      topic: string;
      count: number;
      /** Every policy area's exact count, or null when any could not be read. */
      ranking: { name: string; count: number }[] | null;
    };

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** Satori lays a fragment's children out in a row; each card body is a real column. */
const COLUMN = { display: 'flex', flexDirection: 'column' } as const;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The words beside a status page's figure: the stage, as the hub means it.
 * "Introduced" needs its own wording, because the line under the figure counts
 * every bill *introduced*; the hub is the ones still at that first step, not
 * yet sent to a committee (its heading: "Newly introduced bills").
 */
export function statusHeadline(stage: number): string {
  if (stage === 20) return 'not yet in committee';
  return lowerFirst(stageLabel(stage));
}

/**
 * The line under a status page's figure. A share is stated only when it rounds
 * to something visible; "0.6% of" says less than the plain denominator.
 */
export function statusShareLine(count: number, total: number): string {
  const all = `${formatCount(total)} bills and resolutions introduced`;
  const pct = total > 0 ? (count / total) * 100 : 0;
  return pct >= 1 ? `${pct.toFixed(1)}% of the ${all}` : `Out of ${all}`;
}

export interface TopicRow {
  name: string;
  count: number;
  /** Competition rank: 1 + the number of topics with more bills. Ties share it. */
  rank: number;
  /** Another topic has the same count. */
  tied: boolean;
  colour: string;
  isThis: boolean;
}

/**
 * The bars beside a topic: the six largest, in the home page's topic colours
 * (brand.md: topic-1 … topic-6 are the six largest in rank order). A topic
 * outside the six takes the sixth row itself, labelled with its rank, in ink-3
 * — the colour everything past six folds into on the site.
 *
 * Ranked here from complete counts rather than taken from stored order: the
 * nightly rollup writes the areas largest first, but daily updates patch counts
 * in place, so stored order can drift between rebuilds.
 *
 * A rank is a claim about order, so ties share one ("Tied for the 4th most")
 * rather than being split by name into a 4th and a 5th the data does not
 * support. Name only orders the rows on the card.
 */
export function topicRows(
  topic: string,
  ranking: { name: string; count: number }[],
): { rows: TopicRow[]; rank: number; tied: boolean } {
  const sorted = [...ranking].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const rankOf = (count: number) => 1 + sorted.filter((t) => t.count > count).length;
  const position = sorted.findIndex((t) => t.name === topic);
  const mine = sorted[position];
  const rank = mine ? rankOf(mine.count) : 0;
  const tied = mine ? sorted.some((t) => t.name !== topic && t.count === mine.count) : false;
  const toRow = (t: { name: string; count: number }, i: number): TopicRow => ({
    ...t,
    rank: rankOf(t.count),
    tied: sorted.some((o) => o.name !== t.name && o.count === t.count),
    colour: i < TOPIC_COLOURS.length ? TOPIC_COLOURS[i] : C.muted,
    isThis: t.name === topic,
  });
  const rows =
    position < 6
      ? sorted.slice(0, 6).map(toRow)
      : [...sorted.slice(0, 5).map(toRow), toRow(mine, position)];
  return { rows, rank, tied };
}

/**
 * A row's name, with its rank when it sits outside the six ("12th · Energy",
 * "Tied 12th · Energy"). A topic with no bills gets no rank: a place in a
 * list of nothing says nothing.
 */
export function rowLabel(row: TopicRow): string {
  if (row.rank <= 6 || row.count === 0) return row.name;
  return `${row.tied ? 'Tied ' : ''}${ordinal(row.rank)} · ${row.name}`;
}

/** "The most of any topic", "The 5th most of any topic", "Tied for the 4th most of any topic". */
export function topicRankLine(rank: number, count: number, tied = false): string | null {
  if (count === 0) return 'None yet this Congress';
  if (rank <= 0) return null;
  const place = rank === 1 ? 'the most' : `the ${ordinal(rank)} most`;
  return tied ? `Tied for ${place} of any topic` : `${place.charAt(0).toUpperCase()}${place.slice(1)} of any topic`;
}

/** Long policy-area names ("Civil Rights and Liberties, Minority Issues") step down. */
function topicTitleSize(name: string): number {
  if (name.length <= 12) return 92;
  if (name.length <= 22) return 72;
  if (name.length <= 32) return 58;
  return 48;
}

function StatusCard({ stage, count, total }: { stage: number; count: number; total: number }) {
  return (
    <div style={COLUMN}>
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 12 }}>
        <BigFigure>{formatCount(count)}</BigFigure>
        <div
          style={{ fontFamily: 'Newsreader', fontWeight: 500, fontSize: 60, lineHeight: 1.05, marginLeft: 28, marginBottom: 12 }}
        >
          {statusHeadline(stage)}
        </div>
      </div>
      <div style={{ fontSize: 30, color: INK_2, marginBottom: 48 }}>{statusShareLine(count, total)}</div>
      <StageTrack stage={stage} />
    </div>
  );
}

function ChamberCard({
  chamber,
  count,
  otherCount,
  becameLaw,
}: {
  chamber: 'house' | 'senate';
  count: number;
  otherCount: number;
  becameLaw: number | null;
}) {
  const name = chamber === 'house' ? 'House' : 'Senate';
  const otherName = chamber === 'house' ? 'Senate' : 'House';
  const all = count + otherCount;
  const share = all > 0 ? count / all : 0;
  return (
    <div style={COLUMN}>
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 12 }}>
        <BigFigure>{formatCount(count)}</BigFigure>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 28, marginBottom: 10 }}>
          <div style={{ fontFamily: 'Newsreader', fontWeight: 500, fontSize: 56, lineHeight: 1.05 }}>
            {`${name} bills`}
          </div>
          <div style={{ fontFamily: 'Newsreader', fontWeight: 500, fontSize: 56, lineHeight: 1.05, color: INK_2 }}>
            and resolutions
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 30, color: INK_2, marginBottom: 48 }}>
        {becameLaw !== null && (
          <span style={{ color: STAGE[100].text, fontWeight: 500, marginRight: 12 }}>
            {`${formatCount(becameLaw)} became law ·`}
          </span>
        )}
        <span>{`${Math.round(share * 100)}% of everything introduced this Congress`}</span>
      </div>
      <div style={{ display: 'flex', height: 30 }}>
        <div style={{ width: `${share * 100}%`, background: C.ink, borderRadius: 6 }} />
        <div style={{ flexGrow: 1, background: SUNKEN, borderRadius: 6, marginLeft: 10 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 21, fontWeight: 500 }}>
        <span>{`${name} · ${formatCount(count)}`}</span>
        <span style={{ color: C.muted }}>{`${otherName} · ${formatCount(otherCount)}`}</span>
      </div>
    </div>
  );
}

function TopicCard({
  topic,
  count,
  ranking,
}: {
  topic: string;
  count: number;
  ranking: { name: string; count: number }[] | null;
}) {
  const ranked = ranking ? topicRows(topic, ranking) : null;
  const rankLine = topicRankLine(ranked?.rank ?? 0, count, ranked?.tied);
  const max = ranked ? Math.max(1, ...ranked.rows.map((r) => r.count)) : 1;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: ranked ? 480 : 1056 }}>
        <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: INK_2 }}>
          Topic
        </div>
        <div
          style={{
            display: 'block',
            fontFamily: 'Newsreader',
            fontWeight: 500,
            fontSize: topicTitleSize(topic),
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            marginTop: 10,
            lineClamp: 3,
          }}
        >
          {topic}
        </div>
        <div style={{ fontFamily: 'Newsreader', fontWeight: 500, fontSize: 36, lineHeight: 1.15, marginTop: 18 }}>
          {`${formatCount(count)} ${count === 1 ? 'bill or resolution' : 'bills and resolutions'}`}
        </div>
        {rankLine && <div style={{ fontSize: 26, color: INK_2, marginTop: 8 }}>{rankLine}</div>}
      </div>
      {ranked && (
        <div style={{ display: 'flex', flexDirection: 'column', width: 520 }}>
          {ranked.rows.map((row, i) => (
            <div key={row.name} style={{ display: 'flex', flexDirection: 'column', marginTop: i ? 12 : 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 18,
                  fontWeight: 500,
                  color: row.isThis ? C.ink : C.muted,
                }}
              >
                <span>{rowLabel(row)}</span>
                <span style={{ fontFamily: 'Geist Mono' }}>{formatCount(row.count)}</span>
              </div>
              <div style={{ display: 'flex', marginTop: 6, height: 16, width: '100%', borderRadius: 4, background: SUNKEN }}>
                <div
                  style={{
                    width: `${(row.count / max) * 100}%`,
                    borderRadius: 4,
                    background: row.colour,
                    opacity: row.isThis ? 1 : 0.35,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HubShareCard({ data }: { data: HubCardData }): ReactElement {
  return (
    <CardFrame context={`${formatCongressOrdinal(data.congress)} Congress`}>
      {data.kind === 'status' && <StatusCard stage={data.stage} count={data.count} total={data.total} />}
      {data.kind === 'chamber' && (
        <ChamberCard
          chamber={data.chamber}
          count={data.count}
          otherCount={data.otherCount}
          becameLaw={data.becameLaw}
        />
      )}
      {data.kind === 'topic' && <TopicCard topic={data.topic} count={data.count} ranking={data.ranking} />}
    </CardFrame>
  );
}
