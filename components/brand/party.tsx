import { cn } from '@/lib/utils';

/**
 * Party marks (Documentation/brand.md, "PartyTag"). The dot is the only place
 * party colour appears outside a chart — never tint a name, card or row.
 */
const PARTY_FILL: Record<string, string> = {
  D: 'bg-party-d',
  R: 'bg-party-r',
  I: 'bg-party-i',
};

export function PartyDot({ party, className }: { party?: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', PARTY_FILL[party ?? ''] ?? 'bg-party-u', className)}
    />
  );
}

/** "Gary Peters · D-MI": the name in ink, the code in mono. */
export function PartyTag({
  name,
  party,
  state,
  className,
}: {
  name: string;
  party?: string | null;
  state?: string | null;
  className?: string;
}) {
  const code = [party, state].filter(Boolean).join('-');
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 text-sm font-medium text-ink', className)}>
      <PartyDot party={party} />
      <span className="truncate">{name}</span>
      {code && <span className="shrink-0 font-mono text-[13px] font-normal text-ink-3">{code}</span>}
    </span>
  );
}
