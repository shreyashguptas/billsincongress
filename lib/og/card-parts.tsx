import type { ReactNode } from 'react';
import { C, SPECTRUM, STAGE } from '@/convex/emailStyle';
import {
  BillStages,
  getStageStep,
  isValidStage,
  MAIN_PATH_LABELS,
  stageLabel,
  type BillStage,
} from '@/lib/utils/bill-stages';
import { geist500, geistMono500, newsreader500, newsreader600 } from './fonts';

/**
 * The pieces every share card is built from (Documentation/brand.md, "Share
 * card"): the frame with the lockup, the stage headline and the seven-step
 * track. Bill cards (bill-share-card.tsx) and page cards (hub-share-card.tsx)
 * both use them, so the two read as one family.
 *
 * Drawn by satori (next/og), which takes inline styles only, so the colours are
 * literal. They are the same literals the emails use (convex/emailStyle.ts),
 * which are the Day values of the tokens in app/globals.css; the two chrome
 * values emailStyle has no name for are below.
 */

export const INK_2 = '#4a515a'; // --ink-2, Day
export const SUNKEN = '#edece6'; // --sunken, Day: unfilled track segments and bars
/** The six topic colours in rank order, Day values (--topic-1 … --topic-6). */
export const TOPIC_COLOURS = SPECTRUM;
export { C, STAGE };

/** Stage glyphs (brand.md, "Iconography"), as Lucide's own SVG children (ISC). */
const LANDMARK =
  '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>';
const PEN_LINE =
  '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>';
const GLYPHS: Record<BillStage | 'unknown', string> = {
  [BillStages.INTRODUCED]:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
  [BillStages.IN_COMMITTEE]:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  [BillStages.PASSED_ONE_CHAMBER]: LANDMARK,
  [BillStages.PASSED_BOTH_CHAMBERS]: LANDMARK,
  [BillStages.VETOED]: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  [BillStages.TO_PRESIDENT]: PEN_LINE,
  [BillStages.SIGNED_BY_PRESIDENT]: PEN_LINE,
  [BillStages.BECAME_LAW]:
    '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
  unknown:
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
};

function glyphDataUri(stage: number, colour: string): string {
  const children = isValidStage(stage) ? GLYPHS[stage] : GLYPHS.unknown;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${colour}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** A stage's fill, tint and text colours; an unknown stage is neutral ink-3. */
export function stageColours(stage: number): { fill: string; text: string } {
  return isValidStage(stage) ? STAGE[stage] : { fill: C.muted, text: C.muted };
}

/** "Stage 3 of 7", "Stopped at the President", "Stage unknown" — as on the bill page. */
export function stageNote(stage: number): string {
  const { step, total, isVetoed } = getStageStep(stage);
  if (isVetoed) return 'Stopped at the President';
  return step > 0 ? `Stage ${step} of ${total}` : 'Stage unknown';
}

/** The chamber mark's geometry (components/brand/logo.tsx), spectrum cut. */
const OUTER = [
  [6.53, 26.65], [11.14, 18.41], [19.28, 13.63], [28.72, 13.63], [36.86, 18.41], [41.47, 26.65],
] as const;
const INNER = [
  [14.91, 25.75], [20.41, 21.13], [27.59, 21.13], [33.09, 25.75],
] as const;

function SpectrumMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      {OUTER.map(([cx, cy], i) => (
        <circle key={`o${i}`} cx={cx} cy={cy} r={3.2} fill={SPECTRUM[i]} />
      ))}
      {INNER.map(([cx, cy], i) => (
        <circle key={`i${i}`} cx={cx} cy={cy} r={2.8} fill={C.muted} />
      ))}
      <circle cx={24} cy={31} r={3.4} fill={C.ink} />
      <rect x={4} y={37.5} width={40} height={3} rx={1.5} fill={C.ink} />
    </svg>
  );
}

/**
 * The card: paper, the lockup top left, an optional context line top right
 * ("119th Congress"), and the body at the foot.
 */
export function CardFrame({ context, children }: { context?: string; children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.ground,
        padding: '56px 72px 60px',
        fontFamily: 'Geist',
        color: C.ink,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <SpectrumMark size={64} />
          <div
            style={{
              marginLeft: 16,
              fontFamily: 'Newsreader',
              fontWeight: 600,
              fontSize: 42,
              letterSpacing: '-0.012em',
            }}
          >
            Bills in Congress
          </div>
        </div>
        {context && (
          <div style={{ fontFamily: 'Geist Mono', fontSize: 26, color: C.muted }}>{context}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end' }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Display size for a stage name in the 880px beside its glyph: "In committee"
 * at full size, "On the President's desk" and "Signed by the President" smaller
 * so they stay on one line.
 */
export function stageHeadlineSize(label: string): number {
  if (label.length <= 12) return 104;
  if (label.length <= 18) return 88;
  return 72;
}

/** The stage glyph in its colour, the stage in display type, the note under it. */
export function StageHeadline({ stage }: { stage: number }) {
  const { fill } = stageColours(stage);
  const label = stageLabel(stage);
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 136,
          height: 136,
          borderRadius: 68,
          background: fill,
          flexShrink: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={glyphDataUri(stage, C.ground)} width={68} height={68} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 40 }}>
        <div
          style={{
            fontFamily: 'Newsreader',
            fontWeight: 500,
            fontSize: stageHeadlineSize(label),
            lineHeight: 1,
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        <div style={{ fontFamily: 'Geist Mono', fontSize: 34, color: C.muted, marginTop: 14 }}>
          {stageNote(stage)}
        </div>
      </div>
    </div>
  );
}

/**
 * The seven-step track, full width, every step named under its segment.
 * Reached segments take the stage's colour; the current step's name is in the
 * stage's text colour, earlier ones ink, later ones ink-3.
 */
export function StageTrack({ stage }: { stage: number }) {
  const { step, total } = getStageStep(stage);
  const { fill, text } = stageColours(stage);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex' }}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            style={{
              flexGrow: 1,
              flexBasis: 0,
              height: 30,
              borderRadius: 6,
              marginLeft: i ? 10 : 0,
              background: i < step ? fill : SUNKEN,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 14 }}>
        {MAIN_PATH_LABELS.map((label, i) => (
          <div
            key={label}
            style={{
              flexGrow: 1,
              flexBasis: 0,
              marginLeft: i ? 10 : 0,
              fontSize: 19,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              color: i + 1 === step ? text : i < step ? C.ink : C.muted,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A figure set large in Newsreader, lining numerals — the page cards' headline. */
export function BigFigure({ children, size = 176 }: { children: string; size?: number }) {
  return (
    <div
      style={{
        fontFamily: 'Newsreader',
        fontWeight: 500,
        fontSize: size,
        lineHeight: 0.9,
        letterSpacing: '-0.03em',
        // The words beside it wrap; the figure never shrinks into them.
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

let fontCache: ReturnType<typeof decodeFonts> | null = null;

function decodeFonts() {
  const buf = (b64: string) => Buffer.from(b64, 'base64');
  return [
    { name: 'Newsreader', data: buf(newsreader500), weight: 500 as const, style: 'normal' as const },
    { name: 'Newsreader', data: buf(newsreader600), weight: 600 as const, style: 'normal' as const },
    { name: 'Geist', data: buf(geist500), weight: 500 as const, style: 'normal' as const },
    { name: 'Geist Mono', data: buf(geistMono500), weight: 500 as const, style: 'normal' as const },
  ];
}

/** The cards' fonts for `ImageResponse`, decoded once per isolate. */
export function shareCardFonts() {
  fontCache ??= decodeFonts();
  return fontCache;
}
