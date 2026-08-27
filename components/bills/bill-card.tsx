'use client';

import { Badge } from '@/components/ui/badge';
import { Bill } from '@/lib/types/bill';
import { analytics } from '@/lib/analytics';
import { formatCongressOrdinal, formatCongressProse } from '@/lib/congress';
import { BillProgress } from './bill-progress';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface BillCardProps {
  bill: Bill;
  /** `compact` is the in-answer density: fits a 400px panel. */
  variant?: 'full' | 'compact';
}

const PARTY_DOT_COLOR: Record<string, string> = {
  D: 'bg-party-d',
  R: 'bg-party-r',
  I: 'bg-party-i',
};

export const STAGE_LABEL: Record<number, string> = {
  20: 'Introduced',
  40: 'In committee',
  60: 'Passed one chamber',
  80: 'Passed both',
  90: 'To president',
  95: 'Signed',
  100: 'Became law',
};

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
}: {
  href: string;
  label: string;
  title?: string;
  sponsorLastName?: string;
  sponsorParty?: string;
  stage?: number;
  onClick?: () => void;
}) {
  const partyDot = PARTY_DOT_COLOR[sponsorParty ?? ''] ?? 'bg-party-u';
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group block rounded-sm border border-border bg-card px-3 py-2.5 hover:border-foreground/40 transition-colors"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground tabular">
        {label}
      </p>
      {title ? (
        <p className="font-serif text-[13px] leading-snug mt-1 line-clamp-2 text-foreground">
          {title}
        </p>
      ) : (
        <p className="font-serif text-[13px] leading-snug mt-1 text-foreground">
          Open this bill →
        </p>
      )}
      {(sponsorLastName || stage !== undefined) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${partyDot}`} aria-hidden="true" />
          <span className="truncate">
            {sponsorLastName ? `${sponsorLastName} · ` : ''}
            {stage !== undefined ? (STAGE_LABEL[stage] ?? 'Unknown') : ''}
          </span>
        </p>
      )}
    </Link>
  );
}

export default function BillCard({ bill, variant = 'full' }: BillCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00Z');
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  };

  const stage =
    typeof bill.progress_stage === 'string'
      ? parseInt(bill.progress_stage, 10)
      : bill.progress_stage;

  const billNumberLabel = formatBillNumber(bill);
  const partyDot = PARTY_DOT_COLOR[bill.sponsor_party] ?? 'bg-party-u';

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
      />
    );
  }

  return (
    <Link
      href={`/bills/${bill.id}`}
      onClick={() =>
        analytics.billCardClicked({
          bill_id: String(bill.id),
          bill_type: bill.bill_type,
          bill_number: bill.bill_number,
          congress: bill.congress,
          policy_area: bill.bill_subjects?.policy_area_name ?? '',
          progress_stage: stage,
        })
      }
      className="group block rounded-sm border border-border bg-card hover:border-foreground/40 transition-colors h-full"
    >
      <article className="flex flex-col h-full p-6">
        {/* Header — bill number + congress */}
        <p
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground tabular mb-3"
          title={formatCongressProse(bill.congress)}
        >
          {billNumberLabel}
        </p>

        {/* Title */}
        <h3 className="font-serif text-xl font-semibold leading-snug tracking-tight text-foreground line-clamp-4 min-h-[5.25rem] group-hover:underline underline-offset-4 decoration-border">
          {bill.title}
        </h3>

        {/* Meta — labeled date + policy area */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted-foreground">
          <span>
            Introduced{' '}
            <span className="text-foreground font-medium">
              {formatDate(bill.introduced_date)}
            </span>
          </span>
          {bill.bill_subjects?.policy_area_name && (
            <Badge variant="muted">{bill.bill_subjects.policy_area_name}</Badge>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Progress */}
        <div className="mt-6">
          <BillProgress stage={stage} />
        </div>

        {/* Footer — sponsor */}
        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">
              Sponsor
            </p>
            <p className="flex items-center gap-2 text-[15px] font-medium text-foreground">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${partyDot}`}
                aria-hidden="true"
              />
              <span className="truncate">
                {bill.sponsor_first_name} {bill.sponsor_last_name}
                {bill.sponsor_party && bill.sponsor_state && (
                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {' '}· {bill.sponsor_party}-{bill.sponsor_state}
                  </span>
                )}
              </span>
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </article>
    </Link>
  );
}

function formatBillNumber(bill: Bill): string {
  const typeLabel = bill.bill_type_label || bill.bill_type?.toUpperCase();
  if (typeLabel && bill.bill_number) {
    return `${typeLabel} ${bill.bill_number} · ${formatCongressOrdinal(bill.congress)} Congress`;
  }
  return typeof bill.id === 'string' ? bill.id.replace(/-/g, ' · ').toUpperCase() : 'BILL';
}
