import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import type { Metadata, Viewport } from 'next';
import {
  ArrowRight,
  Bookmark,
  CalendarCheck,
  CreditCard,
  Lock,
  MailX,
  MessageCircle,
  Server,
  User,
} from 'lucide-react';

import { sharedViewport } from '../shared-metadata';
import { SubscribePanel } from '@/components/pro/subscribe-panel';
import { PlanCompareSkeleton } from '@/components/pro/plan-compare';
import {
  AlertsTilePicture,
  DiagramNode,
  IndependentTilePicture,
  MorningPicture,
  QuestionsTilePicture,
} from '@/components/pro/pictures';
import {
  AUTHED_CHAT_DAILY_LIMIT,
  MAX_ALERTS_PER_USER,
  PRO_CHAT_DAILY_LIMIT,
} from '@/convex/plan';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'Pro',
  description:
    'Bills in Congress Pro emails you on any day a bill you follow moves, and raises your daily question allowance. Reading the site stays free.',
  alternates: { canonical: '/pro' },
};

// The plan page: the plans first, as Free and Pro cards a reader can compare
// at a glance, then what Pro adds and the questions in pictures, like /learn.
// Server-rendered; the only client JavaScript is the subscribe panel. The one
// bold thing is the Pro card (Documentation/brand.md, "Principles").

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-line">
      <div className="container-editorial py-16 sm:py-24">
        <p className="label-eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-3 text-display-sm text-ink sm:text-display-md">
          {title}
        </h2>
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  );
}

/** One thing Pro adds: the picture, a big number, a unit, one line. */
function AddTile({
  picture,
  figure,
  unit,
  line,
  legend,
}: {
  picture: ReactNode;
  figure: string;
  unit: string;
  line: string;
  legend?: ReactNode;
}) {
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-line bg-raised">
      <div className="flex min-h-[176px] items-center justify-center bg-sunken/60 px-6 py-6">{picture}</div>
      <div className="flex flex-1 flex-col gap-2 border-t border-line p-6">
        <p className="flex items-baseline gap-2.5">
          <span className="font-serif text-display-lg font-medium leading-none text-ink tabular">{figure}</span>
          <span className="text-title text-ink">{unit}</span>
        </p>
        {legend}
        <p className="text-[15px] leading-snug text-ink-2">{line}</p>
      </div>
    </li>
  );
}

/** An arrow between diagram steps. */
function Then() {
  return <ArrowRight aria-hidden="true" className="mt-3 h-5 w-5 shrink-0 text-ink-3" strokeWidth={1.75} />;
}

/**
 * The questions, each as a card: a small picture of the answer, the question,
 * one line. Facts are the old FAQ's, fewer words. The picture's text
 * alternative carries anything the line leaves out.
 */
const FAQ: { q: string; a: string; picture: ReactNode }[] = [
  {
    q: 'When do alerts arrive?',
    a: 'Early morning, on days a bill you follow moves. Congress.gov can post an action a day or more late, so an alert can trail it.',
    picture: <MorningPicture />,
  },
  {
    q: 'How do I cancel?',
    a: 'You keep Pro until the end of the period you paid for. Nothing is charged after that.',
    picture: (
      <div role="img" aria-label="Your account page, then Manage billing, then Pro runs to the end of the period you paid for." className="flex items-start justify-center gap-2 sm:gap-3">
        <DiagramNode icon={User} label="Account" />
        <Then />
        <DiagramNode icon={CreditCard} label="Manage billing" tone="bg-ink text-on-ink" />
        <Then />
        <DiagramNode icon={CalendarCheck} label="Pro to period end" />
      </div>
    ),
  },
  {
    q: 'Who handles my card?',
    a: 'Stripe. Your card never reaches our servers. We keep only whether your plan is active and when it renews.',
    picture: (
      <div role="img" aria-label="Your card goes to Stripe. It never reaches our servers." className="flex items-start justify-center gap-2 sm:gap-3">
        <DiagramNode icon={CreditCard} label="Your card" />
        <Then />
        <DiagramNode icon={Lock} label="Stripe" tone="bg-ink text-on-ink" />
        <span aria-hidden="true" className="mx-1 mt-2 h-8 w-px bg-line sm:mx-3" />
        <DiagramNode icon={Server} label="Our servers" struck />
      </div>
    ),
  },
  {
    q: 'What if I stop paying?',
    a: `Followed bills are kept, the emails stop, and questions go back to ${AUTHED_CHAT_DAILY_LIMIT} a day. Subscribe again and alerts resume.`,
    picture: (
      <div
        role="img"
        aria-label={`Your followed bills are kept. Alert emails stop. Questions go back to ${AUTHED_CHAT_DAILY_LIMIT} a day.`}
        className="flex items-start justify-center gap-4 sm:gap-6"
      >
        <DiagramNode icon={Bookmark} label="Bills kept" tone="bg-ink text-on-ink" />
        <DiagramNode icon={MailX} label="Emails stop" />
        <DiagramNode
          icon={MessageCircle}
          label={
            <span className="font-mono tabular">
              <s className="text-ink-3">{PRO_CHAT_DAILY_LIMIT}</s> {AUTHED_CHAT_DAILY_LIMIT}/day
            </span>
          }
        />
      </div>
    ),
  },
];

export default function ProPage() {
  return (
    <article className="animate-fade-in">
      {/* The plans come first and fit on one screen, like any pricing page: a
          reader can decide without scrolling. The pictures below explain. */}
      <header className="container-editorial pt-10 text-center sm:pt-14">
        <p className="label-eyebrow">Pro</p>
        <h1 className="mt-3 text-display-md text-ink sm:text-display-lg">Know the morning a bill moves.</h1>
        <p className="mx-auto mt-3 max-w-xl text-[17px] text-ink-2 sm:text-lg">
          Reading stays free. Pro emails you when the bills you follow move.
        </p>
      </header>

      <section id="plans" aria-label="Plans" className="container-editorial scroll-mt-24 pb-16 pt-8 sm:pb-24 sm:pt-10">
        <div className="mx-auto max-w-3xl">
          <Suspense fallback={<PlanCompareSkeleton />}>
            <SubscribePanel />
          </Suspense>
        </div>
      </section>

      <Section id="adds" eyebrow="What Pro adds" title="Three things, in pictures">
        <ul className="grid gap-6 md:grid-cols-3">
          <AddTile
            picture={<AlertsTilePicture />}
            figure={String(MAX_ALERTS_PER_USER)}
            unit="bills followed"
            line="One email the morning any of them moves, quoted from the record. No news, no email."
          />
          <AddTile
            picture={<QuestionsTilePicture free={AUTHED_CHAT_DAILY_LIMIT} pro={PRO_CHAT_DAILY_LIMIT} />}
            figure={String(PRO_CHAT_DAILY_LIMIT)}
            unit="questions a day"
            legend={
              <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-2 tabular">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-ink" />
                  Free {AUTHED_CHAT_DAILY_LIMIT}
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-topic-3" />
                  Pro adds {PRO_CHAT_DAILY_LIMIT - AUTHED_CHAT_DAILY_LIMIT}
                </li>
              </ul>
            }
            line="The same sourced, checked answers."
          />
          <AddTile
            picture={<IndependentTilePicture />}
            figure="0"
            unit="ads"
            line="No sponsors, no selling data. Subscriptions pay for the database, the AI and the email."
          />
        </ul>
      </Section>

      <Section id="questions" eyebrow="Questions" title="Short answers">
        <ul className="grid gap-6 md:grid-cols-2">
          {FAQ.map((item) => (
            <li key={item.q} className="flex flex-col overflow-hidden rounded-lg border border-line bg-raised">
              <div className="flex min-h-[120px] items-center justify-center bg-sunken/60 px-5 py-5">
                <div className="w-full max-w-[320px]">{item.picture}</div>
              </div>
              <div className="border-t border-line p-6">
                <h3 className="text-title text-ink">{item.q}</h3>
                <p className="mt-1.5 text-[15px] leading-snug text-ink-2">{item.a}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-xs leading-relaxed text-ink-3">
          See the{' '}
          <Link href="/terms" className="link focus-ring rounded-xs">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="link focus-ring rounded-xs">
            privacy notice
          </Link>{' '}
          for how billing and alert emails work.
        </p>
      </Section>
    </article>
  );
}
