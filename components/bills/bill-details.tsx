'use client';

import Link from 'next/link';
import type { Bill } from '@/lib/types/bill';
import { useEffect } from 'react';
import {
  getStageStep,
  isStageOnPath,
  measureStageLabel,
  proposesAmendment,
  roadLabels,
  stageNote,
  stagePath,
  stagePathNote,
  BillStages,
  type BillStage,
} from '@/lib/utils/bill-stages';
import { analytics } from '@/lib/analytics';
import {
  formatCongressOrdinal,
  formatCongressProse,
  formatCongressYears,
} from '@/lib/congress';
import { billAnswerParagraph, billLead, billNoSummaryLine, billNoun, billSummaryText } from '@/lib/seo';
import { AskAboutBill, AskSummaryChip } from './ask-about-bill';
import SaveBillButton from './save-bill-button';
import BillAlertButton from './bill-alert-button';
import ShareBillButton from './share-bill-button';
import PodcastPromo from '@/components/podcast-promo';
import { BillJourneyPanel, journeyTermIds } from './bill-journey';
import { BillPeersSection } from './bill-peers';
import { BillRelatedSection } from './bill-related';
import { MemberAccounts } from './member-accounts';
import { BillCosponsors } from './bill-cosponsors';
import { BillWords } from './bill-words';
import { committeeBaseRate, congressClock, finishOf, journeyView } from '@/lib/bill-journey';
import { billNextStep, daysLeftPhrase } from '@/lib/bill-next-step';
import type { BillPageExtras } from '@/lib/services/bills-service';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Ban,
  CircleHelp,
  FilePlus,
  FileText,
  Landmark,
  PenLine,
  ScrollText,
  Users,
  CalendarCheck,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatCount } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PartyDot, PartyTag } from '@/components/brand/party';
import { SourceLine } from '@/components/brand/section';
import { StageSteps, StageTrack, stageFill } from '@/components/brand/status';
import { billPageWords, measureTermId, stageTermId, statusCardLine, termHref } from '@/lib/glossary';
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

/** Each stage's fixed glyph (documentation/brand.md, "Iconography"). */
const STAGE_GLYPH: Record<BillStage, LucideIcon> = {
  [BillStages.INTRODUCED]: FilePlus,
  [BillStages.IN_COMMITTEE]: Users,
  [BillStages.OUT_OF_COMMITTEE]: CalendarCheck,
  [BillStages.PASSED_ONE_CHAMBER]: Landmark,
  [BillStages.PASSED_BOTH_CHAMBERS]: Landmark,
  [BillStages.VETOED]: Ban,
  [BillStages.TO_PRESIDENT]: PenLine,
  [BillStages.SIGNED_BY_PRESIDENT]: PenLine,
  [BillStages.BECAME_LAW]: ScrollText,
};

/**
 * Past this many characters a title set at 56px runs to six or seven lines and
 * pushes the lead and the status below the fold, so it steps down one size.
 */
const LONG_TITLE_CHARS = 90;

interface BillDetailsProps {
  bill: Bill;
  /** The journey and peer counts; null when Convex could not supply them. */
  extras?: BillPageExtras | null;
  /** Today in Washington, YYYY-MM-DD, from the server. */
  today: string;
}

export default function BillDetails({ bill, extras = null, today }: BillDetailsProps) {
  // Derived, not state: stripping the CRS markup used to happen in an effect via
  // document.createElement, which meant the server-rendered HTML shipped the raw
  // "&lt;p&gt;&lt;strong&gt;…" tag soup and only became readable once JS ran.
  // billSummaryText is pure, so the clean text is now in the first response —
  // which is all a crawler without JS ever sees. It also drops the CRS habit of
  // opening with an echo of the bill's own title.
  const summary = billSummaryText(bill);
  // "In short": the first sentence of that summary, or a plain one built from
  // the title and the stage when Congress has not written one.
  const lead = billLead(bill);

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

  // The committee base rate, for a bill still in committee in a live
  // Congress (`committeeBaseRate` in lib/bill-journey.ts).
  const baseRate = committeeBaseRate(bill, today);

  // Passive: record when the committee base-rate context is actually shown.
  useEffect(() => {
    if (baseRate) {
      analytics.billBaseRateViewed({
        bill_id: String(bill.id),
        chamber: bill.bill_type?.startsWith('s') ? 'senate' : 'house',
        days_in_committee: baseRate.days,
        base_rate_percent: baseRate.percent,
        base_rate_sample: baseRate.sample,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.id]);

  // An unrecognised stage code is shown as unknown — heading "Unknown", no
  // step, an empty track — never as Introduced: that is a status the record
  // does not hold. Only the glyph needs a stand-in.
  //
  // Everything below is drawn on the measure's own road: a resolution ends at
  // "Agreed to", not at law (documentation/brand.md, "The road a measure
  // travels"), so a stage off that road is unknown too.
  const stage = progressStage;
  const billType = bill.bill_type;
  // A proposed constitutional amendment never becomes a law: its road ends at
  // the states, not the President.
  const amendment = proposesAmendment(billType, bill.title);
  const { step, total } = getStageStep(stage, billType, amendment);
  const StageGlyph = isStageOnPath(stage, billType) ? STAGE_GLYPH[stage as BillStage] : CircleHelp;
  const roadEnd = roadLabels(billType, amendment)[total - 1];
  const roadNote = stagePathNote(billType, amendment);
  // The civics words this page explains, each the first time it appears.
  const stageTerm = isStageOnPath(stage, billType) ? stageTermId(stage, billType) : null;
  const measureTerm = measureTermId(billType);
  // The Congress is over: an unfinished measure expired with it, and the
  // card's present-tense lines would be false (lib/glossary.ts, stageLine).
  const congressEnded = congressClock(bill.congress, today, bill.introduced_date || today).ended;
  const lifeOpts = { congressEnded, finished: finishOf(stage, bill.bill_type ?? '') !== null };
  const answer = billAnswerParagraph(bill, lifeOpts);
  // The current stage in one plain sentence, always on screen: the most
  // important word on the page should not wait for a tap. The measure's type
  // picks the line: a concurrent resolution is agreed to by both rooms.
  const stagePlain = statusCardLine(stage, billType, congressEnded);
  // The status card's way to the whole road: Learn's picture story for a
  // bill, the measure's own word for a resolution (its road is not that one).
  const roadLink = amendment
    ? { href: termHref('joint-resolution'), label: 'What a joint resolution is' }
    : stagePath(billType) === 'law'
      ? { href: '/learn#path', label: 'How a bill becomes law' }
      : { href: termHref(measureTerm), label: 'What a resolution is' };

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

  // The same five properties ride on every bill-page action event.
  const actionAnalytics = {
    bill_type: bill.bill_type,
    bill_number: bill.bill_number,
    congress: bill.congress,
    policy_area: bill.bill_subjects?.policy_area_name ?? '',
    progress_stage: progressStage,
  };

  // The journey is drawn only when its last stage is the stage this page
  // states: both come from the same calculator, so a difference means the
  // stored stage and the actions disagree, and the page does not pick a side.
  const journey =
    extras?.journey && extras.journey.finalStage === stage && bill.introduced_date
      ? extras.journey
      : null;
  const view = journey
    ? journeyView({ journey, billType: bill.bill_type, congress: bill.congress, today })
    : null;
  const figureCaption = !view
    ? null
    : view.finish === 'law'
      ? 'from introduction to law'
      : view.finish === 'signed'
        ? 'from introduction to the signature'
        : view.finish === 'vetoed'
        ? 'from introduction to the veto'
        : view.finish === 'adopted'
          ? 'from introduction to adoption'
          : view.expired
            ? `from introduction to the end of the ${formatCongressOrdinal(bill.congress)} Congress`
            : 'since it was introduced';

  const hasBaseRate = baseRate !== null;

  // The journey's headline states how the road ended, and when, not that
  // there is one (brand.md, "Headlines state the finding"). Its length is the
  // status card's one number, so the headline does not repeat it.
  const n = view?.totalDays ?? 0;
  const ended = view ? formatDate(view.endDate) : '';
  const journeyTitle = !view
    ? baseRate
      ? `In committee for ${formatCount(baseRate.days)} ${baseRate.days === 1 ? 'day' : 'days'}`
      : 'Its journey so far'
    : n === 0 && !view.finish
      ? 'Introduced today'
      : view.finish === 'law'
        ? `Became law on ${ended}`
        : view.finish === 'signed'
          ? `Signed by the President on ${ended}`
          : view.finish === 'vetoed'
            ? `Vetoed on ${ended}`
            : view.finish === 'adopted'
              ? `Agreed to on ${ended}`
              : view.expired && stage === BillStages.TO_PRESIDENT
                ? 'On the President’s desk when the Congress ended'
                : view.expired
                  ? `Expired when the ${formatCongressOrdinal(bill.congress)} Congress ended`
                  : 'Its journey so far';

  // What happens next: a rule of the process, never a forecast, and the days
  // left in the Congress for a measure that can still move.
  const next = billNextStep({
    stage,
    billType,
    congress: bill.congress,
    introducedDate: bill.introduced_date,
    today,
    title: bill.title,
    events: journey?.events,
  });
  const hasJourneySection = Boolean(journey) || hasBaseRate;

  // "Words to know" at the foot of the page: the words it marked, in the
  // order a reader meets them, its own kind of measure first.
  const pageWords = billPageWords(measureTerm, [
    'congress-number',
    Boolean(sponsorName) && 'sponsor',
    lead.from === 'summary' && 'crs',
    stageTerm,
    ...(journey ? journeyTermIds(journey, bill.bill_type, bill.congress, today) : []),
    extras?.cosponsors?.fetched && 'cosponsor',
  ], stageTerm);

  // A law "does"; anything still on its way, or stopped, "would do".
  const enacted = stage === BillStages.BECAME_LAW || stage === BillStages.SIGNED_BY_PRESIDENT;
  const doesTitle = enacted ? `What this ${noun === 'bill' ? 'law' : noun} does` : `What this ${noun} would do`;

  return (
    <article className="animate-fade-in">
      {/* The story, in the order a reader asks it (brand.md, "Bill page
          order"): what it is, what it does in one sentence, where it stands —
          then the summary, the journey, who is behind it, and its peers. */}
      <header className="container-editorial pb-16 pt-6 sm:pb-20 sm:pt-8">
        {/* Share sits opposite the way back, where a phone reader looks for
            it — and in the installed app, which has no address bar, it is the
            only way to get this page's link. */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/bills"
            className="touch-hit focus-ring inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            All bills
          </Link>
          <ShareBillButton
            billId={String(bill.id)}
            shareTitle={`${billLabel}: ${bill.title}`}
            className="min-w-[9rem]"
            analyticsProps={actionAnalytics}
          />
        </div>

        {/* One column on phones (title, lead, status, actions); from `lg` the
            status card takes the right-hand column beside the title and lead.
            The first row is only as tall as the title and lead, so the actions
            follow the lead, not the card's height. */}
        <div className="mt-6 grid gap-8 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:gap-y-8 xl:gap-x-20">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 touchable:gap-y-6">
              {/* The number names the kind of measure: "H.Res." is a resolution
                  that can never become law, and nothing else on the page says
                  so this early. */}
              {/* Plain, not Terms: a dotted word belongs in a sentence, never
                  on a label (brand.md, "Term"). "Words to know" explains both. */}
              <span className="font-mono text-sm font-medium text-ink tabular">{billLabel}</span>
              <span className="text-sm text-ink-2 tabular">{formatCongressProse(bill.congress)}</span>
              {bill.bill_subjects?.policy_area_name && (
                <Badge variant="secondary">{bill.bill_subjects.policy_area_name}</Badge>
              )}
            </div>

            <h1
              className={cn(
                'mt-4 text-ink',
                longTitle
                  ? 'max-w-[28ch] text-[1.75rem] leading-[1.15] sm:text-display-md lg:text-[2.5rem] lg:leading-[1.15]'
                  : 'max-w-[22ch] text-[2.125rem] leading-[1.1] sm:text-display-xl',
              )}
            >
              {bill.title}
            </h1>

            {/* The byline: who wrote it and when. Two lines on a phone, one
                row with a separator from `sm` up. */}
            <div className="mt-4 flex min-w-0 flex-col gap-y-2 text-sm text-ink-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
              <span>
                Introduced{' '}
                <span className="font-medium text-ink tabular">{formatDate(bill.introduced_date)}</span>
              </span>
              {sponsorName && (
                <>
                  <span aria-hidden="true" className="hidden text-ink-3 sm:inline">
                    ·
                  </span>
                  {/* "Sponsored by" never breaks; a long name drops to its own
                      line before it is cut short. */}
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="whitespace-nowrap">Sponsored by</span>
                    <PartyTag
                      name={sponsorName}
                      party={bill.sponsor_party}
                      state={bill.sponsor_state}
                      className="max-w-full"
                    />
                  </span>
                </>
              )}
            </div>

            {/* In short — the answer to "what does it do?", before anything
                else. Plain first, the record one tap away (brand.md, 5). Only
                from a summary: built from the title, it only said the title
                again, so without one a single line says so (and, for a
                measure that expired, that none is coming) and the status card
                follows. */}
            {lead.from !== 'summary' ? (
              <p className="meta mt-6 border-t border-line pt-4">
                {billNoSummaryLine(bill, lifeOpts)}{' '}
                <a href="#bill-summary" className="link touch-hit focus-ring whitespace-nowrap rounded-xs">
                  What the record says
                </a>
              </p>
            ) : !lead.text ? (
              // The summary opens with a heading, not a sentence ("DIVISION
              // A--INCREASING AMERICAN ENERGY PRODUCTION…"): no In short, only
              // the way down to it.
              <p className="meta mt-6 border-t border-line pt-4">
                This {noun} has a summary by the Congressional Research Service.{' '}
                <a href="#bill-summary" className="link touch-hit focus-ring whitespace-nowrap rounded-xs">
                  Read the summary
                </a>
              </p>
            ) : (
              <div className="mt-8 border-t border-line pt-6 sm:mt-10 sm:pt-8">
                <h2 className="label-eyebrow">In short</h2>
                <p className="mt-3 max-w-measure font-serif text-[1.375rem] leading-[2rem] text-ink sm:text-[1.625rem] sm:leading-[2.375rem]">
                  {lead.text}
                </p>
                {/* A source line, so its words stay plain: a dotted word beside
                    the underlined link read as a second link. */}
                <p className="meta mt-3">
                  From the summary by the Congressional Research Service
                  {lead.rest && (
                    <>
                      {' · '}
                      <a href="#bill-summary" className="link touch-hit focus-ring whitespace-nowrap rounded-xs">
                        {lead.split ? 'Read the rest' : 'Read all of it'}
                      </a>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Where it stands — the page's one bold element (brand.md,
              "Principles" 6), now compact enough to sit beside the lead. */}
          <section
            aria-labelledby="bill-status-label"
            className="min-w-0 self-start rounded-lg border border-line bg-raised p-5 sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1"
          >
            <h2 id="bill-status-label" className="label-eyebrow">
              Where it stands
            </h2>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 lg:block">
              {/* A basis, so from sm the stage text leaves room for the count
                  beside it instead of pushing it onto a line of its own. */}
              <div className="min-w-0 flex-1 basis-64">
                {/* The badge sits in a box one line tall, so it stays beside
                    the first line when the stage wraps (brand.md, "Icons
                    beside text"). */}
                <div className="flex items-start gap-3 py-[max(0px,calc((2.25rem-1lh)/2))] text-display-sm">
                  <span className="flex h-[1lh] shrink-0 items-center" aria-hidden="true">
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full text-on-ink',
                        stageFill(stage, billType),
                      )}
                    >
                      <StageGlyph className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </span>
                  </span>
                  {/* Plain: the line under it says what it means. */}
                  <p className="font-serif text-display-sm font-medium text-ink">
                    {measureStageLabel(stage, billType)}
                  </p>
                </div>
                {/* What the stage means, in one plain sentence, without a tap. */}
                {stagePlain && (
                  <p className="mt-2 max-w-measure text-ui leading-snug text-ink-2">{stagePlain}</p>
                )}
                <p className="mt-1.5 text-sm text-ink-2 tabular">
                  {/* A vetoed bill is not "stage 5 of 7": it reached the
                      President and stopped there, off the path to law. */}
                  {stageNote(stage, billType, amendment)}
                </p>
                <Link
                  href={roadLink.href}
                  data-ph-capture-attribute-cta="bill-status-learn-road"
                  className="focus-ring touch-hit mt-2 flex w-fit items-center gap-1.5 rounded-xs text-sm font-medium text-ink-2 underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink"
                >
                  {roadLink.label}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </Link>
              </div>

              {view && view.totalDays > 0 && (
                // How long the road has been, beside where it stands.
                // The figure and its caption share a left edge at every width:
                // right-aligned, a count that wrapped under the stage sat 65px
                // right of its own caption (/bills/131hr119 at 768px).
                <div className="lg:mt-5 lg:border-t lg:border-line lg:pt-4">
                  <p className="flex items-baseline gap-2">
                    <span className="font-serif text-[2.75rem] font-normal leading-none text-ink tabular">
                      {formatCount(view.totalDays)}
                    </span>
                    <span className="text-base text-ink-2">{view.totalDays === 1 ? 'day' : 'days'}</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-2">{figureCaption}</p>
                </div>
              )}
            </div>

            {/* The road, with its step names: across the card on phones and
                tablets, stood on its end in the narrow column from `lg`. */}
            <div className="mt-5 lg:hidden">
              <StageTrack stage={stage} billType={billType} amendment={amendment} labels size="lg" />
              {/* StageTrack drops its step names below `sm`; the two ends
                  still say which way the track runs. */}
              <div
                className="mt-2.5 flex justify-between text-xs font-medium leading-4 sm:hidden"
                aria-hidden="true"
              >
                <span className="text-ink">Introduced</span>
                <span className={step === total ? 'text-ink' : 'text-ink-3'}>{roadEnd}</span>
              </div>
            </div>
            <StageSteps stage={stage} billType={billType} amendment={amendment} className="mt-5 hidden lg:grid" />

            {/* Why a resolution's road is short: it ends where it is finished. */}
            {roadNote && <p className="mt-4 text-sm leading-relaxed text-ink-2">{roadNote}</p>}

            {/* What happens next: the next step on the road, as a rule of the
                process, and the calendar (lib/bill-next-step.ts). */}
            {next && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="label-eyebrow">What happens next</h3>
                <p className="mt-2 text-ui leading-snug text-ink">{next.text}</p>
                {next.daysLeft !== null && (
                  <p className="meta mt-1.5">{daysLeftPhrase(next.daysLeft, bill.congress)}</p>
                )}
              </div>
            )}

            {hasJourneySection && (
              <a
                href="#bill-journey"
                className="touch-hit focus-ring mt-5 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                {journey ? 'How it got here' : 'How long bills like it wait'}
                <ArrowDown className="h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
              </a>
            )}
          </section>

          {/* PDF on its own line on a phone, then Save and alerts side by
              side; one row from `sm` up. Wraps so the alert button's error
              can sit under it. */}
          <div className="flex flex-wrap content-start gap-2 lg:col-start-1 lg:row-start-2">
            {bill.pdf_url && (
              <Button asChild variant="outline" className="basis-full sm:basis-auto">
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
              className="flex-1 sm:flex-none"
              billId={String(bill.id)}
              analyticsProps={actionAnalytics}
            />
            <BillAlertButton
              className="flex-1 sm:flex-none"
              billId={String(bill.id)}
              analyticsProps={actionAnalytics}
            />
          </div>
        </div>
      </header>

      {/* The full summary, with the question it answers beside it. */}
      <section
        id="bill-summary"
        aria-labelledby="bill-summary-title"
        className="container-editorial scroll-mt-24 pb-16 sm:pb-20"
      >
        <div className="grid gap-10 border-t border-line pt-12 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-16 xl:gap-x-20">
          <div className="min-w-0 max-w-measure">
            {/* The lead above is the summary's first sentence, so what follows
                here starts after it: no sentence is printed twice. */}
            <p className="label-eyebrow">
              {!summary ? 'At a glance' : lead.split ? 'More from the summary' : 'Summary'}
            </p>
            <h2 id="bill-summary-title" className="mt-3 text-display-sm text-ink sm:text-display-md">
              {summary ? doesTitle : 'What the record says'}
            </h2>
            {summary ? (
              <>
                {lead.rest ? (
                  <div className="mt-6 whitespace-pre-wrap font-serif text-reading-sm text-ink sm:text-reading">
                    {lead.rest}
                  </div>
                ) : (
                  <p className="mt-6 text-base leading-relaxed text-ink-2">
                    The summary is the one sentence under the title, in full.
                  </p>
                )}
                {/* Say who wrote it (brand.md, "Voice"). The summary is the
                    CRS text as Congress.gov publishes it, markup removed. */}
                <SourceLine className="mt-5">
                  Summary by the Congressional Research Service · via Congress.gov
                </SourceLine>
              </>
            ) : (
              // For bills Congress has not summarised yet this is the page's
              // only substantive prose, so it always renders.
              <p className="mt-6 font-serif text-reading-sm text-ink sm:text-reading">{answer}</p>
            )}
          </div>

          <AskSummaryChip
            noun={noun}
            className="self-start border-t border-line pt-6 lg:sticky lg:top-24 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-1"
          />
        </div>
      </section>

      {/* How it got here: the journey to scale, stage by stage. */}
      {hasJourneySection && (
        <section
          id="bill-journey"
          aria-labelledby="bill-journey-title"
          className="container-editorial scroll-mt-24 pb-16 sm:pb-20"
        >
          <div className="border-t border-line pt-12 sm:pt-16">
            <p className="label-eyebrow">How it got here</p>
            <h2 id="bill-journey-title" className="mt-3 text-display-sm text-ink sm:text-display-md">
              {journeyTitle}
            </h2>
            <div className="mt-8 rounded-lg border border-line bg-raised p-6 sm:px-8 sm:py-7">
              {journey && (
                <BillJourneyPanel
                  billId={String(bill.id)}
                  billType={bill.bill_type}
                  congress={bill.congress}
                  introducedDate={bill.introduced_date}
                  journey={journey}
                  today={today}
                  noun={noun}
                  amendment={amendment}
                  skipTerm={stageTerm}
                />
              )}

              {baseRate && (
                <div
                  className={cn(
                    'max-w-measure space-y-1.5',
                    journey && 'mt-6 border-t border-line pt-5',
                  )}
                >
                  <p className="text-sm leading-relaxed text-ink-2">
                    In committee for{' '}
                    <span className="font-medium text-ink tabular">
                      {formatCount(baseRate.days)} days
                    </span>
                    . Among {bill.bill_type?.startsWith('s') ? 'Senate' : 'House'} bills and
                    resolutions from past Congresses still in committee this long, about{' '}
                    <span className="font-medium text-ink tabular">{baseRate.percent}%</span>{' '}
                    ever advanced further.
                  </p>
                  <p className="meta">
                    Based on <span className="tabular">{formatCount(baseRate.sample)}</span>{' '}
                    past bills and resolutions — a description of that group, not a prediction for
                    this {noun}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Who is behind it: the sponsor, then the cosponsors. */}
      <section aria-labelledby="bill-sponsor-label" className="container-editorial pb-16 sm:pb-20">
        <div className="border-t border-line pt-12 sm:pt-16">
          <p className="label-eyebrow">Sponsor</p>
          <h2
            id="bill-sponsor-label"
            className="mt-3 font-serif text-display-sm font-semibold text-ink sm:text-display-md"
          >
            {extras?.sponsorAccounts ? (
              // A page exists for every member in office (app/members/[id]).
              <Link
                href={`/members/${extras.sponsorAccounts.bioguideId}`}
                className="touch-hit focus-ring rounded-sm hover:underline"
                onClick={() =>
                  analytics.memberPageLinkClicked({
                    bioguide_id: extras.sponsorAccounts!.bioguideId,
                    from: 'bill_sponsor_card',
                    bill_id: String(bill.id),
                  })
                }
              >
                {sponsorName}
              </Link>
            ) : (
              sponsorName
            )}
          </h2>
          {/* grid-cols-1 is minmax(0,1fr): an implicit column is as wide as its
              widest unbreakable content, and at a 24px font a member's site
              address made the whole page scroll sideways on a phone. */}
          <div className="mt-6 grid grid-cols-1 gap-8 rounded-md border border-line bg-raised p-6 md:grid-cols-2 md:gap-12">
            <dl className="text-sm">
              <div className="flex justify-between gap-3 py-3 first:pt-0">
                <dt className="text-ink-3">Party</dt>
                <dd className="inline-flex min-w-0 items-center gap-2 text-right font-medium text-ink">
                  <PartyDot party={bill.sponsor_party} />
                  {partyName}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line py-3">
                <dt className="text-ink-3">State</dt>
                <dd className="min-w-0 text-right font-medium text-ink">{stateName}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line py-3">
                <dt className="text-ink-3">Bill number</dt>
                <dd className="min-w-0 text-right font-mono text-ink tabular">{billLabel}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-3">
                <dt className="text-ink-3">Congress</dt>
                <dd className="min-w-0 text-right font-medium text-ink tabular">
                  {formatCongressOrdinal(bill.congress)} ({formatCongressYears(bill.congress)})
                </dd>
              </div>
            </dl>
            <MemberAccounts
              data={extras?.sponsorAccounts}
              surface="bill_sponsor_card"
              billId={String(bill.id)}
            />
          </div>
        </div>
      </section>

      <BillCosponsors billId={String(bill.id)} noun={noun} cosponsors={extras?.cosponsors} />

      {extras?.peers && (
        <BillPeersSection
          billId={String(bill.id)}
          billLabel={billLabel}
          billStage={stage}
          billUpdatedAt={extras.billUpdatedAt}
          congress={bill.congress}
          peers={extras.peers}
          today={today}
        />
      )}

      <BillRelatedSection
        billId={String(bill.id)}
        billType={bill.bill_type ?? ''}
        stage={stage}
        policyArea={bill.bill_subjects?.policy_area_name ?? null}
        related={extras?.related ?? []}
      />

      {/* Every word the page explained, as plain text: the fallback for the
          popovers (screen readers, print, readers who never tap). */}
      <BillWords billId={String(bill.id)} ids={pageWords} />

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
