import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// The site's picture primitives: small flat scenes drawn in SVG on the server,
// so they cost no client JavaScript. Everything is ink except the one colour a
// scene is about — a stage (Learn), the spectrum that signs the alert email, or
// Pro's indigo (Documentation/brand.md, "Pictures"). Every scene carries its
// own text alternative.
//
// Used by the Learn page (app/learn/components/pictures.tsx) and the Pro page
// and account page (components/pro/pictures.tsx).

export function Scene({
  label,
  children,
  viewBox = '0 0 240 150',
  className,
}: {
  label: string;
  children: ReactNode;
  viewBox?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={label}
      className={cn('h-auto w-full', className)}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** A standing figure: a head over rounded shoulders, feet at y + 16·s. */
export function Person({ x, y, s = 1, className = 'fill-ink' }: { x: number; y: number; s?: number; className?: string }) {
  return (
    <g className={className}>
      <circle cx={x} cy={y - 15 * s} r={8 * s} />
      <path d={`M${x - 13 * s} ${y + 16 * s}v${-8 * s}a${13 * s} ${13 * s} 0 0 1 ${26 * s} 0v${8 * s}z`} />
    </g>
  );
}

/** A page of writing: a raised sheet, a title bar in `accent`, grey lines. */
export function Paper({
  x,
  y,
  w,
  h,
  accent,
  lines = Math.max(2, Math.floor((h - 34) / 12)),
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  accent: string;
  lines?: number;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} className="fill-raised stroke-ink" strokeWidth={2} />
      <rect x={x + 10} y={y + 12} width={w * 0.5} height={6} rx={3} className={accent} />
      {Array.from({ length: lines }, (_, i) => (
        <rect
          key={i}
          x={x + 10}
          y={y + 28 + i * 12}
          width={(w - 20) * (i === lines - 1 ? 0.6 : 1)}
          height={4}
          rx={2}
          className="fill-ink/25"
        />
      ))}
    </g>
  );
}

export function Arrow({ from, to, y }: { from: number; to: number; y: number }) {
  return (
    <path
      d={`M${from} ${y}H${to}M${to - 9} ${y - 8}L${to} ${y}L${to - 9} ${y + 8}`}
      className="fill-none stroke-ink-3"
      strokeWidth={3}
    />
  );
}

export const Floor = () => <rect x={16} y={134} width={208} height={3} rx={1.5} className="fill-ink/20" />;

/**
 * Six equal bands in the topic colours, left to right: the strip that signs
 * every email the site sends (brand.md, "Email"), drawn in SVG.
 */
export function SpectrumBands({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const band = w / 6;
  return (
    <g>
      {[1, 2, 3, 4, 5, 6].map((n, i) => (
        <rect key={n} x={x + i * band} y={y} width={band + 0.2} height={h} style={{ fill: `var(--topic-${n})` }} />
      ))}
    </g>
  );
}

/**
 * The alert email as a picture: an envelope whose card is signed by the
 * spectrum strip, as the real email is. `children` draws on the card.
 */
export function Envelope({
  x,
  y,
  w,
  h,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  children?: ReactNode;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={5} className="fill-raised stroke-ink" strokeWidth={2} />
      {/* Inset from the rounded corners, so no clip path (and no shared id) is needed. */}
      <SpectrumBands x={x + 4} y={y + 3} w={w - 8} h={5} />
      {children}
    </g>
  );
}

/** Seven stage segments, like `StageTrack`: the first `reached` in `fill`. */
export function TrackPicture({
  x,
  y,
  w,
  reached,
  fill,
  h = 6,
}: {
  x: number;
  y: number;
  w: number;
  reached: number;
  fill: string;
  h?: number;
}) {
  const gap = 3;
  const seg = (w - gap * 6) / 7;
  return (
    <g>
      {Array.from({ length: 7 }, (_, i) => (
        <rect
          key={i}
          x={x + i * (seg + gap)}
          y={y}
          width={seg}
          height={h}
          rx={1.5}
          className={i < reached ? fill : 'fill-ink/15'}
        />
      ))}
    </g>
  );
}
