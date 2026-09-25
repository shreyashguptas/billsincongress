import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { sharedViewport } from '../shared-metadata';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import PodcastPromo from '@/components/podcast-promo';
import { SectionHeader } from '@/components/brand/section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LearnMotionProvider } from './components/motion-provider';
import { CapitolDome } from './components/capitol-dome';
import { HeroStats } from './components/hero-stats';
import { Reveal } from './components/reveal';
import { CivicFlow } from './components/civic-flow';
import { ChamberSeats } from './components/chamber-seats';
import { BillSurvival } from './components/bill-survival';
import { BillJourney } from './components/bill-journey';
import { CivicsQuiz } from './components/civics-quiz';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'How Congress works',
  description:
    'An illustrated, interactive guide to the United States Congress — who writes the laws, how a bill survives the journey, and why most never make it.',
  alternates: { canonical: '/learn' },
};

const JUMP_LINKS = [
  { href: '#idea', label: 'The big idea' },
  { href: '#chambers', label: 'The two rooms' },
  { href: '#bills', label: "What's a bill" },
  { href: '#journey', label: 'The journey' },
  { href: '#quiz', label: 'Pop quiz' },
  { href: '#podcast', label: 'Go deeper' },
];

/**
 * One chapter of the guide: an eyebrow, a headline, the lead paragraph in
 * Newsreader at reading size, then the interactive piece. Chapters are divided
 * by a hairline, never boxed (Documentation/brand.md, "Layout and shape").
 */
function Chapter({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lead: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-24 border-t border-line', className)}>
      <div className="container-editorial py-16 sm:py-24">
        <Reveal className="max-w-measure">
          <SectionHeader eyebrow={eyebrow} title={title} />
          <p className="mt-5 font-serif text-reading text-ink">{lead}</p>
        </Reveal>
        <div className="mt-10 sm:mt-14">{children}</div>
      </div>
    </section>
  );
}

export default function LearnPage() {
  return (
    <LearnMotionProvider>
      <article className="animate-fade-in">
        {/* Page head */}
        <header className="overflow-hidden">
          <div className="container-editorial pt-12 sm:pt-16">
            <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-6">
                <p className="label-eyebrow">A visual guide</p>
                <h1 className="mt-3 text-display-lg text-ink sm:text-display-xl">How Congress works.</h1>
                <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed text-ink-2 sm:text-lg">
                  535 people. Two rooms. One long obstacle course from idea to
                  law. Here is the whole story, told simply enough for anyone —
                  no homework required.
                </p>

                <nav
                  aria-label="Sections of this guide"
                  className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm"
                >
                  {JUMP_LINKS.map((link) => (
                    <a key={link.href} href={link.href} className="link focus-ring rounded-xs">
                      {link.label}
                    </a>
                  ))}
                </nav>
              </div>

              {/* The Capitol draws itself in */}
              <div className="text-ink lg:col-span-6">
                <CapitolDome className="mx-auto w-full max-w-xl" />
              </div>
            </div>

            {/* The three figures */}
            <div className="mt-10 sm:mt-14">
              <HeroStats />
            </div>
          </div>
        </header>

        {/* The strip above already closes with a hairline, so the first
            chapter does not draw a second one. */}
        <Chapter
          id="idea"
          eyebrow="§ 01 — The big idea"
          title="Who makes the rules?"
          className="border-t-0"
          lead={
            <>
              Every country needs rules — about taxes, schools, roads, food,
              the internet, the air. In America, the people who write those
              rules work in one building: the United States Capitol in
              Washington, D.C. Together they are called Congress. And they all
              work for you.
            </>
          }
        >
          <CivicFlow />
        </Chapter>

        <Chapter
          id="chambers"
          eyebrow="§ 02 — The two rooms"
          title="Congress is two teams in two rooms."
          lead={
            <>
              The House of Representatives is big, loud, and fast. The Senate
              is small, slow, and stubborn. Nothing becomes law unless both
              rooms say yes to the exact same words — that is the whole trick
              of the system. Every dot below is a real seat, held by a real
              person.
            </>
          }
        >
          <ChamberSeats />
        </Chapter>

        <Chapter
          id="bills"
          eyebrow="§ 03 — The paperwork"
          title="Every law starts as a bill."
          lead={
            <>
              A bill is an idea for a law, written down and given a number.
              That&apos;s it. Anyone can have the idea — a scientist, a shop owner,
              a fifth-grader — but only a member of Congress can put it in the
              race. And once it&apos;s in, the odds are brutal.
            </>
          }
        >
          <BillSurvival />
        </Chapter>

        {/* The page's one bold moment: the interactive journey. */}
        <Chapter
          id="journey"
          eyebrow="§ 04 — The obstacle course"
          title="From idea to law, in seven steps."
          lead={
            <>
              Every bill on this site is somewhere on this exact path — whether
              it&apos;s about school lunches or space travel. Click through the
              steps and walk the road yourself.
            </>
          }
        >
          <BillJourney />
        </Chapter>

        <Chapter
          id="quiz"
          eyebrow="§ 05 — Pop quiz"
          title="Think you've got it?"
          lead="Five questions. No grades, no pressure — just bragging rights."
        >
          <Reveal delay={0.1} className="max-w-3xl">
            <CivicsQuiz />
          </Reveal>
        </Chapter>

        {/* § 06 — Go deeper (podcast) */}
        <section id="podcast" className="scroll-mt-24 border-t border-line">
          <div className="container-editorial py-16 sm:py-24">
            <Reveal>
              <PodcastPromo placement="learn" eyebrow="§ 06 — Go deeper" />
            </Reveal>
          </div>
        </section>

        {/* Closing call to action — the quiet band */}
        <section className="border-t border-line bg-sunken">
          <div className="container-editorial py-16 text-center sm:py-24">
            <Reveal>
              <p className="label-eyebrow">Now you&apos;re ready</p>
              <h2 className="mt-3 text-display-sm text-ink sm:text-display-md">Watch it happen for real.</h2>
              <p className="mx-auto mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-2 sm:text-lg">
                Right now, thousands of real bills are making this exact journey
                through Congress. Some will become laws that shape your life.
                Follow them as it happens.
              </p>
              <Button asChild size="lg" className="mt-8">
                <Link href="/bills" data-ph-capture-attribute-cta="learn-browse-bills">
                  Browse the bills in Congress
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </Reveal>
          </div>
        </section>
      </article>
    </LearnMotionProvider>
  );
}
