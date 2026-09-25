'use client';

import Link from 'next/link';
import type { Bill } from '@/lib/types/bill';
import { useEffect } from 'react';
import {
  stageLabel,
  getStageStep,
  isValidStage,
  BillStages,
  type BillStage,
} from '@/lib/utils/bill-stages';
import { analytics } from '@/lib/analytics';
import {
  formatCongressOrdinal,
  formatCongressProse,
  formatCongressYears,
} from '@/lib/congress';
import { billAnswerParagraph, billNoun, billSummaryText } from '@/lib/seo';
import { AskAboutBill } from './ask-about-bill';
import SaveBillButton from './save-bill-button';
import PodcastPromo from '@/components/podcast-promo';
import {
  ArrowLeft,
  Ban,
  FilePlus,
  FileText,
  Landmark,
  PenLine,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatCount } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PartyDot, PartyTag } from '@/components/brand/party';
import { SourceLine } from '@/components/brand/section';
import { StageTrack, stageFill } from '@/components/brand/status';
import { STATE_NAMES } from '@/lib/constants/filters';

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

/** Each stage's fixed glyph (Documentation/brand.md, "Iconography"). */
const STAGE_GLYPH: Record<BillStage, LucideIcon> = {
  [BillStages.INTRODUCED]: FilePlus,
  [BillStages.IN_COMMITTEE]: Users,
  [BillStages.PASSED_ONE_CHAMBER]: Landmark,
  [BillStages.PASSED_BOTH_CHAMBERS]: Landmark,
  [BillStages.VETOED]: Ban,
  [BillStages.TO_PRESIDENT]: PenLine,
  [BillStages.SIGNED_BY_PRESIDENT]: PenLine,
  [BillStages.BECAME_LAW]: ScrollText,
};

/**
 * Past this many characters a title set at 56px runs to six or seven lines and
 * pushes the status panel below the fold, so it steps down one size.
 */
const LONG_TITLE_CHARS = 90;

interface BillDetailsProps {
  bill: Bill;
}

export default function BillDetails({ bill }: BillDetailsProps) {
  // Derived, not state: stripping the CRS markup used to happen in an effect via
  // document.createElement, which meant the server-rendered HTML shipped the raw
  // "&lt;p&gt;&lt;strong&gt;…" tag soup and only became readable once JS ran.
  // billSummaryText is pure, so the clean text is now in the first response —
  // which is all a crawler without JS ever sees. It also drops the CRS habit of
  // opening with an echo of the bill's own title.
  const summary = billSummaryText(bill);
  const answer = billAnswerParagraph(bill);

  // "bill" / "resolution" / "joint resolution". The chrome around `answer` has
  // to agree with it: that paragraph already opens "H.Res. 1486 is a
  // resolution", so headings beside it cannot go on saying "this bill".
  const noun = billNoun(bill.bill_type);

  const progressStage =
    typeof bill.progress_stage === 'string'
      ? parseInt(bill.progress_stage, 10)
      : bill.progress_stage;

  // Top of the bill-engagement funnel: one event per bill detail view, with
  // richer properties than the automatic $pageview.
  useEffect(() => {
    analytics.billViewed({
      bill_id: String(bill.id),
      bill_type: bill.bill_type,
      bill_number: bill.bill_number,
      congress: bill.congress,
      policy_area: bill.bill_subjects?.policy_area_name ?? '',
      progress_stage: progressStage,
      has_summary: Boolean(bill.latest_summary),
      has_pdf: Boolean(bill.pdf_url),
    });
    // Re-fire only if the user navigates to a different bill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.id]);

  // Passive: record when the committee base-rate context is actually shown.
  useEffect(() => {
    if (
      bill.base_rate_percent !== undefined &&
      bill.base_rate_sample !== undefined &&
      bill.days_in_committee !== undefined
    ) {
      analytics.billBaseRateViewed({
        bill_id: String(bill.id),
        chamber: bill.bill_type?.startsWith('s') ? 'senate' : 'house',
        days_in_committee: bill.days_in_committee,
        base_rate_percent: bill.base_rate_percent,
        base_rate_sample: bill.base_rate_sample,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.id]);

  // An unrecognised stage code draws as Introduced, the way the old pipeline
  // did, rather than as an empty panel.
  const stage: BillStage = isValidStage(progressStage) ? progressStage : BillStages.INTRODUCED;
  const { step, total, isVetoed } = getStageStep(stage);
  const StageGlyph = STAGE_GLYPH[stage];

  const stateName = STATE_NAMES[bill.sponsor_state] || bill.sponsor_state;
  const partyName = PARTY_NAMES[bill.sponsor_party] || bill.sponsor_party;
  const sponsorName = `${bill.sponsor_first_name ?? ''} ${bill.sponsor_last_name ?? ''}`.trim();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00Z');
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  };

  const billLabel = `${bill.bill_type_label || bill.bill_type?.toUpperCase()} ${bill.bill_number}`;
  const longTitle = bill.title.length > LONG_TITLE_CHARS;

  const hasBaseRate =
    bill.base_rate_percent !== undefined &&
    bill.base_rate_sample !== undefined &&
    bill.days_in_committee !== undefined;

  return (
    <article className="animate-fade-in">
      {/* Article header */}
      <header className="container-editorial pt-6 sm:pt-8">
        <Link
          href="/bills"
          className="focus-ring inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          All bills
        </Link>

        <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-10">
          <span className="font-mono text-sm font-medium text-ink tabular">{billLabel}</span>
          <span className="font-mono text-sm text-ink-3 tabular">
            {formatCongressProse(bill.congress)}
          </span>
          {bill.bill_subjects?.policy_area_name && (
            <Badge variant="muted">{bill.bill_subjects.policy_area_name}</Badge>
          )}
        </div>

        <h1
          className={cn(
            'mt-4 text-ink',
            longTitle
              ? 'max-w-[28ch] text-[28px] leading-[1.15] sm:text-display-md lg:text-display-lg'
              : 'max-w-[24ch] text-[34px] leading-[1.1] sm:text-display-xl',
          )}
        >
          {bill.title}
        </h1>

        <div className="mt-6 flex flex-col gap-4 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          {/* Two lines on a phone, one row with a separator from `sm` up, so the
              dot never dangles at the end of a wrapped line. */}
          <div className="flex min-w-0 flex-col gap-y-2 text-sm text-ink-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <span>
              Introduced{' '}
              <span className="font-mono text-ink tabular">{formatDate(bill.introduced_date)}</span>
            </span>
            {sponsorName && (
              <>
                <span aria-hidden="true" className="hidden text-ink-3 sm:inline">
                  ·
                </span>
                <span className="inline-flex min-w-0 items-center gap-2">
                  By
                  <PartyTag name={sponsorName} party={bill.sponsor_party} state={bill.sponsor_state} />
                </span>
              </>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            {bill.pdf_url && (
              <Button asChild variant="outline" className="h-11 flex-1 sm:h-10 sm:flex-none">
                <a
                  href={bill.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => analytics.billPdfOpened(String(bill.id))}
                >
                  <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Read full text (PDF)
                </a>
              </Button>
            )}
            <SaveBillButton
              className="h-11 flex-1 sm:h-10 sm:flex-none"
              billId={String(bill.id)}
              analyticsProps={{
                bill_type: bill.bill_type,
                bill_number: bill.bill_number,
                congress: bill.congress,
                policy_area: bill.bill_subjects?.policy_area_name ?? '',
                progress_stage: progressStage,
              }}
            />
          </div>
        </div>
      </header>

      {/* Status panel — the page's one bold element (brand.md, "Principles" 6). */}
      <div className="container-editorial mt-10 sm:mt-12">
        <section
          aria-labelledby="bill-status-label"
          className="rounded-lg border border-line bg-raised p-6 sm:px-8 sm:py-7"
        >
          <div className="grid gap-6 sm:grid-cols-[280px_minmax(0,1fr)] sm:items-center sm:gap-12">
            <div>
              <p id="bill-status-label" className="label-eyebrow">
                Current status
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-ink',
                    stageFill(stage),
                  )}
                  aria-hidden="true"
                >
                  <StageGlyph className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <p className="font-serif text-display-sm font-medium text-ink sm:text-display-md">
                  {stageLabel(stage)}
                </p>
              </div>
              <p className="mt-2 font-mono text-sm text-ink-3 tabular">
                {/* A vetoed bill is not "stage 5 of 7": it reached the President
                    and stopped there, off the path to law. */}
                {isVetoed
                  ? 'Stopped at the President'
                  : `Stage ${step} of ${total}`}
              </p>
            </div>

            <div>
              <StageTrack stage={stage} labels size="lg" />
              {/* StageTrack drops its seven step names below `sm`; the two ends
                  still say which way the track runs. */}
              <div
                className="mt-2.5 flex justify-between text-xs font-medium leading-4 sm:hidden"
                aria-hidden="true"
              >
                <span className="text-ink">Introduced</span>
                <span className={step === total ? 'text-ink' : 'text-ink-3'}>Law</span>
              </div>
            </div>
          </div>

          {hasBaseRate && (
            <div className="mt-6 max-w-measure space-y-1.5 border-t border-line pt-5">
              <p className="text-sm leading-relaxed text-ink-2">
                In committee for{' '}
                <span className="font-medium text-ink tabular">
                  {formatCount(bill.days_in_committee!)} days
                </span>
                . Among {bill.bill_type?.startsWith('s') ? 'Senate' : 'House'} bills and
                resolutions from past Congresses still in committee this long, about{' '}
                <span className="font-medium text-ink tabular">{bill.base_rate_percent}%</span>{' '}
                ever advanced further.
              </p>
              <p className="text-xs leading-4 text-ink-3">
                Based on <span className="tabular">{formatCount(bill.base_rate_sample!)}</span> past
                bills and resolutions — a description of that group, not a prediction for this{' '}
                {noun}.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Body: the answer and the summary, beside the sponsor */}
      <div className="container-editorial py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-20">
          <div className="min-w-0 max-w-measure">
            {/* The one-paragraph answer: what this bill is and where it stands.
                For bills Congress has not summarised yet this is the page's only
                substantive prose, so it always renders. */}
            <p className="label-eyebrow">At a glance</p>
            <p className="mt-3 font-serif text-[19px] leading-[30px] text-ink sm:text-[22px] sm:leading-[34px]">
              {answer}
            </p>

            {summary && (
              <>
                <hr className="rule my-10" />
                <p className="label-eyebrow">Summary</p>
                <div className="mt-3 whitespace-pre-wrap font-serif text-reading-sm text-ink sm:text-reading">
                  {summary}
                </div>
                {/* Say who wrote it (brand.md, "Voice"). The summary is the
                    CRS text as Congress.gov publishes it, markup removed. */}
                <SourceLine className="mt-5">
                  Summary by the Congressional Research Service · via Congress.gov
                </SourceLine>
              </>
            )}
          </div>

          <aside className="min-w-0" aria-labelledby="bill-sponsor-label">
            <div className="rounded-md border border-line bg-raised p-6">
              <p id="bill-sponsor-label" className="label-eyebrow">
                Sponsor
              </p>
              <p className="mt-2 font-serif text-display-sm font-semibold text-ink">
                {sponsorName}
              </p>
              <dl className="mt-5 text-sm">
                <div className="flex justify-between gap-3 border-t border-line py-3">
                  <dt className="text-ink-3">Party</dt>
                  <dd className="inline-flex items-center gap-2 font-medium text-ink">
                    <PartyDot party={bill.sponsor_party} />
                    {partyName}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line py-3">
                  <dt className="text-ink-3">State</dt>
                  <dd className="font-medium text-ink">{stateName}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line py-3">
                  <dt className="text-ink-3">Bill number</dt>
                  <dd className="font-mono text-ink tabular">{billLabel}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-3">
                  <dt className="text-ink-3">Congress</dt>
                  <dd className="font-mono text-ink tabular">
                    {formatCongressOrdinal(bill.congress)} ({formatCongressYears(bill.congress)})
                  </dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {/* Ask the record — the page's quiet closing band */}
      <section aria-labelledby="bill-ask-title" className="bg-sunken py-16 sm:py-[72px]">
        <div className="container-editorial">
          <AskAboutBill title={bill.title} noun={noun} headingId="bill-ask-title" />
        </div>
      </section>

      {/* Podcast cross-promotion (end of page — never mid-read) */}
      <section className="border-t border-line">
        <div className="container-editorial py-10 sm:py-12">
          <PodcastPromo placement="bill" variant="compact" billId={String(bill.id)} />
        </div>
      </section>
    </article>
  );
}
