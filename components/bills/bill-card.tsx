'use client';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PartyDot, PartyTag } from '@/components/brand/party';
import { StageTrack, StatusPill } from '@/components/brand/status';
import { Bill } from '@/lib/types/bill';
import { analytics } from '@/lib/analytics';
import { compactStageLabel, getStageStep } from '@/lib/utils/bill-stages';
import { formatCongressProse } from '@/lib/congress';
import { billNoun } from '@/lib/seo';
import Link from 'next/link';

interface BillCardProps {
  bill: Bill;
  /** `compact` is the in-answer density: fits a 400px panel. */
  variant?: 'full' | 'compact';
  /** Leave out the topic tag — on a topic hub every row would repeat it. */
  hideTopic?: boolean;
}

/**
 * The compact card body, taking primitives rather than a `Bill`.
 *
 * Answers name bills by id and carry only a small display projection, never a
 * full row — so this takes what an answer actually has. `BillCard`'s compact
 * variant and the in-answer entity cards both render through here, which is
 * what stops the two densities drifting apart.
 */
export function CompactBillCard({
  href,
  label,
  title,
  sponsorLastName,
  sponsorParty,
  stage,
  onClick,
  noun = 'bill',
}: {
  href: string;
  label: string;
  title?: string;
  sponsorLastName?: string;
  sponsorParty?: string;
  stage?: number;
  onClick?: () => void;
  /**
   * What to call this in the no-title fallback below. Defaults to "bill"
   * because the in-answer entity cards carry a display projection that has no
   * bill_type to derive it from; BillCard passes the real noun.
   */
  noun?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group block rounded-md border border-line bg-raised px-3 py-2.5 transition-colors hover:border-line-strong focus-ring"
    >
      <p className="font-mono text-xs font-medium text-ink-2 tabular">{label}</p>
      <p className="mt-1 line-clamp-2 font-serif text-[15px] font-medium leading-snug text-ink group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-[3px]">
        {title || `Open this ${noun} →`}
      </p>
      {(sponsorLastName || stage !== undefined) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
          {sponsorLastName && <PartyDot party={sponsorParty} className="h-1.5 w-1.5" />}
          <span className="truncate">
            {sponsorLastName ? `${sponsorLastName} · ` : ''}
            {stage !== undefined ? compactStageLabel(stage) : ''}
          </span>
        </p>
      )}
    </Link>
  );
}

/**
 * One bill as a row of the register (Documentation/brand.md, "Lists are
 * rows"): number and date, then the title and sponsor, then the stage. The
 * whole row is the link. On phones the three columns stack in that order.
 */
export default function BillCard({ bill, variant = 'full', hideTopic = false }: BillCardProps) {
  const stage =
    typeof bill.progress_stage === 'string'
      ? parseInt(bill.progress_stage, 10)
      : bill.progress_stage;

  const track = () =>
    analytics.billCardClicked({
      bill_id: String(bill.id),
      bill_type: bill.bill_type,
      bill_number: bill.bill_number,
      congress: bill.congress,
      policy_area: bill.bill_subjects?.policy_area_name ?? '',
      progress_stage: stage,
    });

  if (variant === 'compact') {
    return (
      <CompactBillCard
        href={`/bills/${bill.id}`}
        label={`${bill.bill_type_label || bill.bill_type?.toUpperCase()} ${bill.bill_number}`}
        title={bill.title}
        sponsorLastName={bill.sponsor_last_name}
        sponsorParty={bill.sponsor_party}
        stage={stage}
        onClick={track}
        noun={billNoun(bill.bill_type)}
      />
    );
  }

  const { step, total, isVetoed } = getStageStep(stage);
  const sponsorName = [bill.sponsor_first_name, bill.sponsor_last_name].filter(Boolean).join(' ');
  const policyArea = hideTopic ? undefined : bill.bill_subjects?.policy_area_name;

  return (
    <Link
      href={`/bills/${bill.id}`}
      onClick={track}
      className="group grid gap-x-10 gap-y-3 border-b border-line py-6 focus-ring md:grid-cols-[120px_minmax(0,1fr)_220px]"
    >
      {/* Number and date. A row on phones, a column from md up. */}
      <div className="flex items-baseline gap-3 md:flex-col md:gap-1">
        <span
          className="font-mono text-sm font-medium text-ink tabular"
          title={formatCongressProse(bill.congress)}
        >
          {formatBillNumber(bill)}
        </span>
        {bill.introduced_date && (
          <span className="font-mono text-xs text-ink-3 tabular">
            <span className="sr-only">Introduced </span>
            <time dateTime={bill.introduced_date}>{formatDate(bill.introduced_date)}</time>
          </span>
        )}
      </div>

      {/* Title and sponsor */}
      <div className="min-w-0">
        <h3 className="line-clamp-3 max-w-[64ch] text-title text-ink [text-wrap:pretty] decoration-line-strong decoration-1 underline-offset-4 group-hover:underline">
          {bill.title}
        </h3>
        {(sponsorName || policyArea) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {sponsorName && (
              <PartyTag name={sponsorName} party={bill.sponsor_party} state={bill.sponsor_state} />
            )}
            {policyArea && <Badge variant="secondary">{policyArea}</Badge>}
          </div>
        )}
      </div>

      {/* Stage */}
      <div className="flex flex-col gap-2.5 md:pt-0.5">
        <div className="flex items-center justify-between gap-3">
          <StatusPill stage={stage} />
          {!isVetoed && step > 0 && (
            // The track below carries the same fact as its accessible name.
            // An unrecognised stage (step 0) shows no counter: "Unknown · 1 of 7"
            // would contradict itself.
            <span className="font-mono text-xs text-ink-3 tabular" aria-hidden="true">
              {step} of {total}
            </span>
          )}
        </div>
        <StageTrack stage={stage} />
      </div>
    </Link>
  );
}

/** A row's shape while its bill is loading. Same grid, so nothing jumps. */
export function BillRowSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-x-10 gap-y-3 border-b border-line py-6 md:grid-cols-[120px_minmax(0,1fr)_220px]"
    >
      <div className="flex gap-3 md:flex-col md:gap-2">
        <Skeleton className="h-4 w-16 rounded-xs" />
        <Skeleton className="h-3 w-20 rounded-xs" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-5 w-full max-w-[56ch] rounded-xs" />
        <Skeleton className="h-5 w-3/4 max-w-[40ch] rounded-xs" />
        <Skeleton className="mt-4 h-4 w-40 rounded-xs" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-28 rounded-sm" />
        <Skeleton className="h-1.5 w-full rounded-xs" />
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** "S. 5446". The Congress is on the row's `title`: every list is one Congress. */
function formatBillNumber(bill: Bill): string {
  const typeLabel = bill.bill_type_label || bill.bill_type?.toUpperCase();
  if (typeLabel && bill.bill_number) return `${typeLabel} ${bill.bill_number}`;
  return typeof bill.id === 'string' ? bill.id.replace(/-/g, ' ').toUpperCase() : 'Bill';
}
