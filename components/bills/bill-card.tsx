'use client';

import { Badge } from '@/components/ui/badge';
import { Bill } from '@/lib/types/bill';
import { BillProgress } from './bill-progress';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface BillCardProps {
  bill: Bill;
}

export default function BillCard({ bill }: BillCardProps) {
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

  // Reconstruct the bill number string (e.g., HR · 1234) from available fields.
  const billNumberLabel = formatBillNumber(bill);

  return (
    <Link
      href={`/bills/${bill.id}`}
      className="group block rounded-sm border border-border bg-card hover:border-foreground/40 transition-colors h-full"
    >
      <article className="flex flex-col h-full p-5">
        {/* Header — number + date */}
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground tabular">
            {billNumberLabel}
          </span>
          <time className="font-mono text-[11px] text-muted-foreground tabular">
            {formatDate(bill.introduced_date)}
          </time>
        </div>

        {/* Title */}
        <h3 className="font-serif text-lg font-semibold leading-snug tracking-tight text-foreground line-clamp-3 min-h-[4.5rem] group-hover:underline underline-offset-4 decoration-border">
          {bill.title}
        </h3>

        {/* Policy area */}
        {bill.bill_subjects?.policy_area_name && (
          <div className="mt-3">
            <Badge variant="muted">{bill.bill_subjects.policy_area_name}</Badge>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Progress */}
        <div className="mt-5">
          <BillProgress stage={stage} description={bill.progress_description} />
        </div>

        {/* Footer — sponsor */}
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Sponsor
            </p>
            <p className="text-sm font-medium text-foreground truncate">
              {bill.sponsor_first_name} {bill.sponsor_last_name}
              {bill.sponsor_party && bill.sponsor_state && (
                <span className="font-mono text-xs text-muted-foreground tabular">
                  {' '}· {bill.sponsor_party}-{bill.sponsor_state}
                </span>
              )}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </article>
    </Link>
  );
}

function formatBillNumber(bill: Bill): string {
  if (bill.bill_type && bill.bill_number) {
    return `${bill.bill_type.toUpperCase()} ${bill.bill_number} · ${bill.congress}${ordinal(bill.congress)}`;
  }
  return typeof bill.id === 'string' ? bill.id.replace(/-/g, ' · ').toUpperCase() : 'BILL';
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}
