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

export function ChamberMark({
  spectrum = false,
  className,
}: {
  /**
   * Colour the outer seats with the six topic colours and the inner row with
   * ink-3. Once per surface, at 48px or larger (brand.md).
   */
  spectrum?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn('shrink-0', className)}>
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

/** The lockup: mark plus the wordmark "Bills in Congress", linking home. */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <Link
      href="/"
      aria-label="Bills in Congress, home"
      className={cn('focus-ring inline-flex items-center gap-2.5 rounded-sm text-ink', className)}
    >
      <ChamberMark className={size === 'lg' ? 'h-9 w-9' : 'h-7 w-7 sm:h-8 sm:w-8'} />
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
