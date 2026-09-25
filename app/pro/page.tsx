import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Viewport } from 'next';

import { sharedViewport } from '../shared-metadata';
import { PlanCardsSkeleton, SubscribePanel } from '@/components/pro/subscribe-panel';
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

const INCLUDED = [
  {
    title: 'An email the day a bill moves',
    body: `Follow up to ${MAX_ALERTS_PER_USER} bills. On any morning one of them has a new action or a new status, you get one email listing exactly what happened, quoted from the official record. No news, no email.`,
  },
  {
    title: `${PRO_CHAT_DAILY_LIMIT} questions a day`,
    body: `Free accounts can ask ${AUTHED_CHAT_DAILY_LIMIT} a day. Pro raises it to ${PRO_CHAT_DAILY_LIMIT}, with the same sourced, checked answers.`,
  },
  {
    title: 'Keeps the site independent',
    body: 'No ads, no sponsors, no selling data. Subscriptions pay for the database, the AI and the email that run it.',
  },
];

const FREE = [
  'Every bill page, status, summary and action history',
  'The dashboard and every browse page',
  `Asking questions (${AUTHED_CHAT_DAILY_LIMIT} a day with a free account)`,
  'Saving bills to your account',
];

const FAQ = [
  {
    q: 'When do alert emails arrive?',
    a: 'Early in the morning, US Eastern time (11:00 UTC: 7 AM in summer, 6 AM in winter), on mornings when a bill you follow has something new. We sync with Congress.gov overnight, and Congress.gov sometimes posts an action a day or more after it happens, so an alert can trail the event.',
  },
  {
    q: 'How do I cancel?',
    a: 'From your account page, choose Manage billing. You keep Pro until the end of the period you paid for, and nothing is charged after that.',
  },
  {
    q: 'Who handles my card?',
    a: 'Stripe. Your card details go to Stripe and never reach our servers. We keep only whether your plan is active and when it renews.',
  },
  {
    q: 'What if I stop paying?',
    a: 'Your followed bills are kept but the emails stop, and your question allowance goes back to the free level. Subscribe again and the alerts resume.',
  },
];

// A plan page on the editorial grid: the two price panels are the one bold
// thing, and everything around them is hairline rows (Documentation/brand.md,
// "Layout and shape").
export default function ProPage() {
  return (
    <article className="animate-fade-in">
      <header className="container-editorial pb-12 pt-12 sm:pb-16 sm:pt-16">
        <p className="label-eyebrow">Pro</p>
        <h1 className="mt-3 max-w-3xl text-display-lg text-ink sm:text-display-xl">
          Know the morning a bill moves.
        </h1>
        <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed text-ink-2 sm:text-lg">
          For people who follow legislation for work. Reading the site stays free for
          everyone; Pro adds the tools that save you checking back.
        </p>
      </header>

      <div className="container-editorial">
        <div className="grid gap-12 border-t border-line pb-16 pt-12 sm:pb-24 sm:pt-16 lg:grid-cols-12 lg:gap-16">
          <div className="min-w-0 lg:col-span-7">
            <Suspense fallback={<PlanCardsSkeleton />}>
              <SubscribePanel />
            </Suspense>

            <section className="mt-16">
              <h2 className="label-eyebrow">What Pro adds</h2>
              <ul className="mt-4 border-t border-line">
                {INCLUDED.map((item) => (
                  <li key={item.title} className="border-b border-line py-5">
                    <h3 className="text-title text-ink tabular">{item.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{item.body}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-16">
              <h2 className="label-eyebrow">Questions</h2>
              <dl className="mt-4 border-t border-line">
                {FAQ.map((item) => (
                  <div key={item.q} className="border-b border-line py-5">
                    <dt className="text-[15px] font-medium text-ink">{item.q}</dt>
                    <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{item.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <h2 className="label-eyebrow">Free for everyone, always</h2>
              <ul className="mt-4 border-t border-line">
                {FREE.map((line) => (
                  <li key={line} className="border-b border-line py-3 text-[15px] leading-snug text-ink">
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-ink-3">
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
            </div>
          </aside>
        </div>
      </div>
    </article>
  );
}
