import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * The Pro mark (Documentation/brand.md, "Pro"): a reader on Pro wears the
 * spectrum — the six topic colours — as a ring around their initials, in the
 * header and on the account page. Free readers get the plain ink-edged circle.
 * Pro's own colour is the indigo dot on `ProPill`, as in the plan emails.
 */

export function initialsFor(nameOrEmail: string | undefined | null): string {
  if (!nameOrEmail) return '·';
  const trimmed = nameOrEmail.trim();
  const atIdx = trimmed.indexOf('@');
  const base = atIdx > 0 ? trimmed.slice(0, atIdx) : trimmed;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZES = {
  // The header avatar: 36px overall, ring included.
  sm: { box: 'h-9 w-9', ring: 'p-[2px]', gap: 'p-[1.5px]', text: 'text-xs' },
  lg: { box: 'h-20 w-20 sm:h-24 sm:w-24', ring: 'p-[4px]', gap: 'p-[3px]', text: 'text-xl sm:text-2xl' },
  xl: { box: 'h-24 w-24 sm:h-28 sm:w-28', ring: 'p-[5px]', gap: 'p-[4px]', text: 'text-2xl sm:text-3xl' },
} as const;

/**
 * Initials in a circle. `pro` draws the spectrum ring, then a paper gap, then
 * the circle, so the ring never touches the letters. Decorative: the name and
 * the plan are always said in words beside it.
 */
export function AvatarMark({
  initials,
  pro,
  size = 'lg',
  className,
}: {
  initials: string;
  pro: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  const face = (
    <span
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-sunken font-mono uppercase text-ink',
        // `group-hover` answers the header button's hover.
        !pro && 'border border-line-strong group-hover:border-ink',
        s.text,
      )}
    >
      {initials}
    </span>
  );
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 rounded-full', s.box, pro && ['spectrum-ring', s.ring], className)}>
      {pro ? <span className={cn('flex h-full w-full rounded-full bg-paper', s.gap)}>{face}</span> : face}
    </span>
  );
}

/** "Pro" as a pill with Pro's indigo dot — the word always carries the plan. */
export function ProPill({ className, children = 'Pro' }: { className?: string; children?: ReactNode }) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 whitespace-nowrap', className)}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-topic-3" aria-hidden="true" />
      {children}
    </Badge>
  );
}

/** The six-band strip along the top of a Pro card, as the emails open. */
export function SpectrumStrip({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('spectrum-strip h-1.5 w-full', className)} />;
}
