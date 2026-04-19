'use client';

import Link from 'next/link';
import type { Bill } from '@/lib/types/bill';
import { useEffect, useState } from 'react';
import {
  getStageDescription,
  getStagePercentage,
  getProgressDots,
  isValidStage,
  BillStages,
} from '@/lib/utils/bill-stages';
import BillQA from './bill-qa';
import { ArrowLeft, FileText, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

const PARTY_NAMES: Record<string, string> = {
  R: 'Republican',
  D: 'Democrat',
  I: 'Independent',
  ID: 'Independent Democrat',
  IR: 'Independent Republican',
  L: 'Libertarian',
  G: 'Green Party',
  '': 'No Party Affiliation',
};

interface BillDetailsProps {
  bill: Bill;
}

export default function BillDetails({ bill }: BillDetailsProps) {
  const [summary, setSummary] = useState<string>(bill.latest_summary || 'No summary available.');

  useEffect(() => {
    try {
      if (bill.latest_summary) {
        const tmp = document.createElement('div');
        tmp.innerHTML = bill.latest_summary;
        setSummary(tmp.textContent || tmp.innerText || 'No summary available.');
      }
    } catch (e) {
      console.error('Error parsing bill summary:', e);
      setSummary('Error loading summary.');
    }
  }, [bill.latest_summary]);

  const progressStage =
    typeof bill.progress_stage === 'string'
      ? parseInt(bill.progress_stage, 10)
      : bill.progress_stage;
  const progressPercentage = getStagePercentage(progressStage);
  const displayDescription = getStageDescription(progressStage);
  const progressDots = isValidStage(progressStage)
    ? getProgressDots(progressStage)
    : getProgressDots(BillStages.INTRODUCED);

  const stateName = STATE_NAMES[bill.sponsor_state] || bill.sponsor_state;
  const partyName = PARTY_NAMES[bill.sponsor_party] || bill.sponsor_party;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00Z');
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  };

  const billLabel = `${bill.bill_type_label || bill.bill_type?.toUpperCase()} ${bill.bill_number}`;

  return (
    <article className="animate-fade-in">
      {/* ── Article header ──────────────────────────────────────── */}
      <header className="border-b border-border">
        <div className="container-editorial pt-6 pb-10 sm:pt-8 sm:pb-14">
          <Link
            href="/bills"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All bills
          </Link>

          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground tabular">
                {billLabel} · {bill.congress}th Congress
              </span>
              {bill.bill_subjects?.policy_area_name && (
                <Badge variant="muted">{bill.bill_subjects.policy_area_name}</Badge>
              )}
            </div>

            <h1 className="font-serif text-display-md sm:text-display-lg font-semibold leading-[1.08] tracking-tight">
              {bill.title}
            </h1>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span>
                Introduced <span className="text-foreground">{formatDate(bill.introduced_date)}</span>
              </span>
              <span className="hidden sm:inline">·</span>
              <span>
                By{' '}
                <span className="text-foreground font-medium">
                  {bill.sponsor_first_name} {bill.sponsor_last_name}
                </span>{' '}
                {bill.sponsor_party && bill.sponsor_state && (
                  <span className="font-mono tabular">
                    ({bill.sponsor_party}-{bill.sponsor_state})
                  </span>
                )}
              </span>
              {bill.pdf_url && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <a
                    href={bill.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Read full text (PDF)
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Status pipeline ─────────────────────────────────────── */}
      <section className="border-b border-border bg-secondary/30">
        <div className="container-editorial py-8">
          <div className="grid lg:grid-cols-3 gap-8 items-start">
            <div>
              <p className="label-eyebrow mb-2">Current status</p>
              <p className="font-serif text-2xl font-semibold tracking-tight leading-tight">
                {displayDescription}
              </p>
              <p className="mt-1 font-mono text-sm text-muted-foreground tabular">
                {progressPercentage}% through the legislative process
              </p>
            </div>

            <div className="lg:col-span-2">
              <ProgressPipeline dots={progressDots} percentage={progressPercentage} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Body: summary + sponsor sidebar ─────────────────────── */}
      <section className="container-editorial py-12 sm:py-16">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-8">
            <p className="label-eyebrow mb-3">Plain-English summary</p>
            <div className="font-serif text-lg leading-[1.7] text-foreground whitespace-pre-wrap">
              {summary}
            </div>
          </div>

          <aside className="lg:col-span-4 space-y-8 lg:border-l lg:border-border lg:pl-10">
            <div>
              <p className="label-eyebrow mb-3">Sponsor</p>
              <p className="font-serif text-xl font-semibold tracking-tight">
                {bill.sponsor_first_name} {bill.sponsor_last_name}
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3 border-b border-border pb-2">
                  <dt className="text-muted-foreground">Party</dt>
                  <dd className="text-foreground font-medium">{partyName}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-border pb-2">
                  <dt className="text-muted-foreground">State</dt>
                  <dd className="text-foreground font-medium">{stateName}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-border pb-2">
                  <dt className="text-muted-foreground">Bill number</dt>
                  <dd className="text-foreground font-mono tabular">
                    {bill.bill_type?.toUpperCase()} {bill.bill_number}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Congress</dt>
                  <dd className="text-foreground font-mono tabular">{bill.congress}th</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Q&A ────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-secondary/30">
        <div className="container-editorial py-12 sm:py-16">
          <div className="max-w-3xl">
            <p className="label-eyebrow mb-3">Ask the record</p>
            <h2 className="font-serif text-display-sm font-semibold tracking-tight mb-2">
              Have a question about this bill?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Get plain-English answers grounded in the bill's full text.
            </p>
            <BillQA billId={bill.id} />
          </div>
        </div>
      </section>
    </article>
  );
}

/* Editorial pipeline visualisation: dots on a horizontal line */
function ProgressPipeline({
  dots,
  percentage,
}: {
  dots: Array<{ stage: string; isComplete: boolean }>;
  percentage: number;
}) {
  return (
    <div>
      {/* Horizontal pipeline (sm+) */}
      <ol className="hidden sm:block">
        <div className="relative">
          {/* base line */}
          <div className="absolute left-2 right-2 top-2 h-px bg-border" aria-hidden="true" />
          {/* progress line */}
          <div
            className="absolute left-2 top-2 h-px bg-foreground transition-all duration-500"
            style={{ width: `calc((100% - 1rem) * ${percentage / 100})` }}
            aria-hidden="true"
          />
          <div className="flex items-start justify-between gap-1">
            {dots.map(({ stage, isComplete }) => (
              <li
                key={stage}
                className="relative flex flex-col items-center text-center"
                style={{ flex: '1 1 0' }}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full border bg-background z-10',
                    isComplete
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border'
                  )}
                  aria-hidden="true"
                >
                  {isComplete && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
                <span
                  className={cn(
                    'mt-2 text-[11px] leading-tight max-w-[8ch]',
                    isComplete ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}
                >
                  {stage}
                </span>
              </li>
            ))}
          </div>
        </div>
      </ol>

      {/* Vertical pipeline (mobile) */}
      <ol className="sm:hidden space-y-2.5">
        {dots.map(({ stage, isComplete }) => (
          <li key={stage} className="flex items-center gap-3">
            <span
              className={cn(
                'flex h-3 w-3 items-center justify-center rounded-full border shrink-0',
                isComplete ? 'border-foreground bg-foreground' : 'border-border'
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'text-sm',
                isComplete ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}
            >
              {stage}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
