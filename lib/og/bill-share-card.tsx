import type { ReactElement } from 'react';
import type { Bill } from '@/lib/types/bill';
import { C, SPECTRUM, STAGE } from '@/convex/emailStyle';
import { formatCongressOrdinal } from '@/lib/congress';
import { billIdentifier, truncateAtWord } from '@/lib/seo';
import {
  BillStages,
  getStageStep,
  isValidStage,
  stageLabel,
  type BillStage,
} from '@/lib/utils/bill-stages';
import { geist500, geistMono500, newsreader500, newsreader600 } from './fonts';

/**
 * The picture a bill's link unfurls into — in iMessage, WhatsApp, Slack, email
 * clients, X and anywhere else that reads Open Graph (Documentation/brand.md,
 * "Share card"). It is the bill page's header reduced to what survives at a
 * thumbnail's size: the identifier, the title, the status panel and the
 * sponsor, on the Day palette.
 *
 * Drawn by satori (next/og), which takes inline styles only, so the colours are
 * literal. They are the same literals the emails use (convex/emailStyle.ts),
 * which are the Day values of the tokens in app/globals.css; the two chrome
 * values emailStyle has no name for are below.
 */

const INK_2 = '#4a515a'; // --ink-2, Day
const SUNKEN = '#edece6'; // --sunken, Day: the unfilled track segments

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
 * Title size by length. A thumbnail is ~300px wide on a phone, a quarter of
 * this canvas, so the title is set as large as its length allows and a long
 * formal title ("To amend title 38, United States Code, to …") is cut at a word
 * to three lines rather than shrunk to nothing.
 */
export function shareCardTitle(title: string): { text: string; fontSize: number } {
  const t = title.trim();
  if (t.length <= 42) return { text: t, fontSize: 76 };
  if (t.length <= 80) return { text: t, fontSize: 62 };
  if (t.length <= 120) return { text: t, fontSize: 50 };
  return { text: truncateAtWord(t, 150), fontSize: 44 };
}

/** "Stage 3 of 7", "Stopped at the President", "Stage unknown" — as on the bill page. */
export function shareCardStageNote(stage: number): string {
  const { step, total, isVetoed } = getStageStep(stage);
  if (isVetoed) return 'Stopped at the President';
  return step > 0 ? `Stage ${step} of ${total}` : 'Stage unknown';
}

/** "Jodey Arrington" and "R-TX", or null when we hold no sponsor name. */
function sponsorParts(bill: Bill): { name: string; tag: string } | null {
  const name = `${bill.sponsor_first_name ?? ''} ${bill.sponsor_last_name ?? ''}`.trim();
  if (!name) return null;
  const tag = [bill.sponsor_party, bill.sponsor_state].filter(Boolean).join('-');
  return { name, tag };
}

function introducedOn(bill: Bill): string | null {
  if (!bill.introduced_date) return null;
  const d = new Date(`${bill.introduced_date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function BillShareCard({ bill }: { bill: Bill }): ReactElement {
  const stage =
    typeof bill.progress_stage === 'string'
      ? parseInt(bill.progress_stage, 10)
      : bill.progress_stage;
  const { step, total } = getStageStep(stage);
  // An unrecognised stage takes neutral ink-3, never a stage's hue (status.tsx).
  const fill = isValidStage(stage) ? STAGE[stage].fill : C.muted;
  const title = shareCardTitle(bill.title ?? '');
  const sponsor = sponsorParts(bill);
  const introduced = introducedOn(bill);
  const area = bill.bill_subjects?.policy_area_name;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.ground,
        padding: '52px 64px 44px',
        fontFamily: 'Geist',
        color: C.ink,
      }}
    >
      {/* Masthead: the lockup, then the identifier where the page puts it. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <SpectrumMark size={52} />
          <div
            style={{
              marginLeft: 14,
              fontFamily: 'Newsreader',
              fontWeight: 600,
              fontSize: 32,
              letterSpacing: '-0.012em',
            }}
          >
            Bills in Congress
          </div>
        </div>
        <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 24 }}>
          <span style={{ color: C.ink }}>{billIdentifier(bill)}</span>
          <span style={{ color: C.muted, marginLeft: 14 }}>
            · {formatCongressOrdinal(bill.congress)} Congress
          </span>
        </div>
      </div>

      {/* Title block: takes the room the panel leaves and sits at its foot. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flexGrow: 1,
          paddingTop: 24,
          paddingBottom: 28,
        }}
      >
        {area && (
          <div
            style={{
              fontSize: 19,
              fontWeight: 500,
              color: INK_2,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            {area}
          </div>
        )}
        <div
          style={{
            display: 'block',
            fontFamily: 'Newsreader',
            fontWeight: 500,
            fontSize: title.fontSize,
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            lineClamp: 3,
            maxWidth: 1060,
          }}
        >
          {title.text}
        </div>
      </div>

      {/* The status panel — the page's one bold element, reduced. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: C.card,
          border: `1px solid ${C.rule}`,
          borderRadius: 14,
          padding: '26px 32px',
        }}
      >
        {/* Wide enough for the longest label, "On the President's desk", on one line. */}
        <div style={{ display: 'flex', alignItems: 'center', width: 560, flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 60,
              height: 60,
              borderRadius: 30,
              background: fill,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={glyphDataUri(stage, C.ground)} width={30} height={30} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 20 }}>
            <div
              style={{
                fontFamily: 'Newsreader',
                fontWeight: 500,
                fontSize: 40,
                lineHeight: 1.05,
                whiteSpace: 'nowrap',
              }}
            >
              {stageLabel(stage)}
            </div>
            <div style={{ fontFamily: 'Geist Mono', fontSize: 19, color: C.muted, marginTop: 6 }}>
              {shareCardStageNote(stage)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          <div style={{ display: 'flex' }}>
            {Array.from({ length: total }, (_, i) => (
              <div
                key={i}
                style={{
                  flexGrow: 1,
                  height: 14,
                  borderRadius: 3,
                  marginLeft: i === 0 ? 0 : 6,
                  background: i < step ? fill : SUNKEN,
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 12,
              fontSize: 17,
              fontWeight: 500,
            }}
          >
            <span style={{ color: C.ink }}>Introduced</span>
            <span style={{ color: step === total ? C.ink : C.muted }}>Law</span>
          </div>
        </div>
      </div>

      {/* Byline: who and when, then where it lives. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 26,
          fontSize: 21,
          color: INK_2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {sponsor && <span>By {sponsor.name}</span>}
          {sponsor?.tag && (
            <span style={{ fontFamily: 'Geist Mono', color: C.muted, marginLeft: 10 }}>
              · {sponsor.tag}
            </span>
          )}
          {introduced && (
            <span style={{ fontFamily: 'Geist Mono', color: C.muted, marginLeft: sponsor ? 10 : 0 }}>
              {sponsor ? '· ' : ''}Introduced {introduced}
            </span>
          )}
        </div>
        <div style={{ fontFamily: 'Geist Mono', color: C.muted }}>billsincongress.com</div>
      </div>
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

/** The card's fonts for `ImageResponse`, decoded once per isolate. */
export function shareCardFonts() {
  fontCache ??= decodeFonts();
  return fontCache;
}
