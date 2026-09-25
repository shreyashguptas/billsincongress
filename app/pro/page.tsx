import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Viewport } from 'next';

import { sharedViewport } from '../shared-metadata';
import { SubscribePanel } from '@/components/pro/subscribe-panel';
import {
  AUTHED_CHAT_DAILY_LIMIT,
  MAX_ALERTS_PER_USER,
  PRO_CHAT_DAILY_LIMIT,
} from '@/convex/plan';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'Pro',
  description:
    'Bills.Congress Pro emails you on any day a bill you follow moves, and raises your daily question allowance. Reading the site stays free.',
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

export default function ProPage() {
  return (
    <article className="animate-fade-in">
      <header className="border-b border-border">
        <div className="container-editorial py-12 sm:py-16">
          <p className="label-eyebrow mb-3">Pro</p>
          <h1 className="font-serif text-display-md sm:text-display-lg font-semibold leading-[1.05] tracking-tight max-w-3xl">
            Know the morning a bill moves.
          </h1>
          <p className="mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            For people who follow legislation for work. Reading the site stays free for
            everyone; Pro adds the tools that save you checking back.
          </p>
        </div>
      </header>

      <section className="container-editorial py-12">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-10">
            <Suspense fallback={<div className="h-64" aria-hidden />}>
              <SubscribePanel />
            </Suspense>

            <div>
              <p className="label-eyebrow mb-4">What Pro adds</p>
              <ul className="divide-y divide-border border-y border-border">
                {INCLUDED.map((item) => (
                  <li key={item.title} className="py-5">
                    <p className="font-serif text-lg font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="label-eyebrow mb-4">Questions</p>
              <dl className="space-y-6">
                {FAQ.map((item) => (
                  <div key={item.q}>
                    <dt className="font-medium">{item.q}</dt>
                    <dd className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <aside className="lg:col-span-5">
            <div className="rounded-md border border-border p-6 lg:sticky lg:top-24">
              <p className="label-eyebrow mb-3">Free for everyone, always</p>
              <ul className="space-y-2 text-sm">
                {FREE.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden className="text-muted-foreground">—</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
                See the <Link href="/terms" className="underline underline-offset-4">terms</Link> and{' '}
                <Link href="/privacy" className="underline underline-offset-4">privacy notice</Link> for
                how billing and alert emails work.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </article>
  );
}
