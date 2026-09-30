import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The chamber mark (Documentation/brand.md, "Logo"): the House floor seen from
 * the gallery — six seats on the outer row, four on the inner, the well and the
 * floor. It is the home page's hemicycle reduced to eleven dots.
 *
 * Geometry is on a 48-unit grid and must match public/brand/*.svg, which
 * scripts/generate-icons.ts turns into the favicons and app icons.
 */
const OUTER = [
  [6.53, 26.65], [11.14, 18.41], [19.28, 13.63], [28.72, 13.63], [36.86, 18.41], [41.47, 26.65],
] as const;
const INNER = [
  [14.91, 25.75], [20.41, 21.13], [27.59, 21.13], [33.09, 25.75],
] as const;

/**
 * The ink's own bounds on the 48-unit grid: the outer seats' edges left and
 * right, the top of the highest seats, the bottom of the floor. The lockup
 * draws the mark cropped to these so its bottom edge IS the floor, and the
 * wordmark's baseline can sit on it.
 */
const INK_BOX = '3.33 10.43 41.34 30.07';

export function ChamberMark({
  spectrum = false,
  trim = false,
  className,
}: {
  /**
   * Colour the outer seats with the six topic colours and the inner row with
   * ink-3. Once per surface, at 48px or larger (brand.md).
   */
  spectrum?: boolean;
  /**
   * Crop to the ink (INK_BOX) instead of the square 48-unit tile. The size
   * classes then describe the drawing itself, not a padded square around it.
   */
  trim?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox={trim ? INK_BOX : '0 0 48 48'} aria-hidden="true" className={cn('shrink-0', className)}>
      {OUTER.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={3.2}
          style={{ fill: spectrum ? `var(--topic-${i + 1})` : 'currentColor' }}
        />
      ))}
      {INNER.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={2.8}
          style={{ fill: spectrum ? 'hsl(var(--ink-3))' : 'currentColor' }}
        />
      ))}
      <circle cx={24} cy={31} r={3.4} fill="currentColor" />
      <rect x={4} y={37.5} width={40} height={3} rx={1.5} fill="currentColor" />
    </svg>
  );
}

/**
 * The lockup: mark plus the wordmark "Bills in Congress", linking home.
 *
 * Aligned on the floor, not on box centres: the mark is cropped to its ink, so
 * its bottom edge is the floor line, and `items-baseline` puts the wordmark's
 * baseline exactly on it (a flex item with no text baseline — the svg — offers
 * its bottom edge). Centring the two boxes instead left the text floating a few
 * pixels above the floor, because the square tile has empty space above the
 * seats and below the floor that the eye does not count.
 *
 * Mark sizes keep the drawing's 41.34:30.07 aspect and match the old square
 * tile's ink: 28px tile → 18px tall, 32px → 20px, 36px → 22.5px.
 */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <Link
      href="/"
      aria-label="Bills in Congress, home"
      className={cn('focus-ring inline-flex items-baseline gap-2.5 rounded-sm text-ink', className)}
    >
      <ChamberMark
        trim
        className={size === 'lg' ? 'h-[22.5px] w-[31px]' : 'h-[18px] w-[24.75px] sm:h-5 sm:w-[27.5px]'}
      />
      <span
        className={cn(
          'whitespace-nowrap font-serif font-semibold leading-none tracking-[-0.012em]',
          size === 'lg' ? 'text-2xl' : 'text-lg sm:text-[21px]',
        )}
      >
        Bills in Congress
      </span>
    </Link>
  );
}
