import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { sharedViewport } from '../shared-metadata';
import type { Metadata, Viewport } from 'next';
import PodcastPromo from '@/components/podcast-promo';
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
};

const JUMP_LINKS = [
  { href: '#idea', label: 'The big idea' },
  { href: '#chambers', label: 'The two rooms' },
  { href: '#bills', label: "What's a bill" },
  { href: '#journey', label: 'The journey' },
  { href: '#quiz', label: 'Pop quiz' },
  { href: '#podcast', label: 'Go deeper' },
];

export default function LearnPage() {
  return (
    <LearnMotionProvider>
      <article className="animate-fade-in">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-border overflow-hidden">
        <div className="container-editorial pt-12 sm:pt-16">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-6">
              <p className="label-eyebrow mb-3">A visual guide</p>
              <h1 className="font-serif text-display-md sm:text-display-lg lg:text-display-xl font-semibold leading-[1.05] tracking-tight">
                How Congress works.
              </h1>
              <p className="mt-5 max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
                535 people. Two rooms. One long obstacle course from idea to
                law. Here is the whole story, told simply enough for anyone —
                no homework required.
              </p>

              <nav
                aria-label="Sections of this guide"
                className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm"
              >
                {JUMP_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </div>

            {/* The Capitol draws itself in */}
            <div className="lg:col-span-6 text-foreground">
              <CapitolDome className="w-full max-w-xl mx-auto" />
            </div>
          </div>

          {/* Data strip */}
          <div className="mt-10 sm:mt-14 -mx-4 sm:mx-0">
            <HeroStats />
          </div>
        </div>
      </header>

      {/* ── § 01 — The big idea ──────────────────────────────────────────── */}
      <section id="idea" className="scroll-mt-24">
        <div className="container-editorial py-16 sm:py-20">
          <Reveal className="max-w-2xl">
            <p className="label-eyebrow mb-3">§ 01 — The big idea</p>
            <h2 className="font-serif text-display-sm sm:text-display-md font-semibold tracking-tight mb-5">
              Who makes the rules?
            </h2>
            <p className="font-serif text-lg leading-[1.7] text-foreground first-letter-drop">
              Every country needs rules — about taxes, schools, roads, food,
              the internet, the air. In America, the people who write those
              rules work in one building: the United States Capitol in
              Washington, D.C. Together they are called Congress. And they all
              work for you.
            </p>
          </Reveal>

          <div className="mt-10 sm:mt-12">
            <CivicFlow />
          </div>
        </div>
      </section>

      <div className="container-editorial">
        <hr className="rule" />
      </div>

      {/* ── § 02 — The two rooms ─────────────────────────────────────────── */}
      <section id="chambers" className="scroll-mt-24">
        <div className="container-editorial py-16 sm:py-20">
          <Reveal className="max-w-2xl">
            <p className="label-eyebrow mb-3">§ 02 — The two rooms</p>
            <h2 className="font-serif text-display-sm sm:text-display-md font-semibold tracking-tight mb-5">
              Congress is two teams in two rooms.
            </h2>
            <p className="font-serif text-lg leading-[1.7] text-foreground">
              The House of Representatives is big, loud, and fast. The Senate
              is small, slow, and stubborn. Nothing becomes law unless both
              rooms say yes to the exact same words — that is the whole trick
              of the system. Every dot below is a real seat, held by a real
              person.
            </p>
          </Reveal>

          <div className="mt-10 sm:mt-12">
            <ChamberSeats />
          </div>
        </div>
      </section>

      <div className="container-editorial">
        <hr className="rule" />
      </div>

      {/* ── § 03 — The paperwork ─────────────────────────────────────────── */}
      <section id="bills" className="scroll-mt-24">
        <div className="container-editorial py-16 sm:py-20">
          <Reveal className="max-w-2xl">
            <p className="label-eyebrow mb-3">§ 03 — The paperwork</p>
            <h2 className="font-serif text-display-sm sm:text-display-md font-semibold tracking-tight mb-5">
              Every law starts as a bill.
            </h2>
            <p className="font-serif text-lg leading-[1.7] text-foreground">
              A bill is an idea for a law, written down and given a number.
              That's it. Anyone can have the idea — a scientist, a shop owner,
              a fifth-grader — but only a member of Congress can put it in the
              race. And once it's in, the odds are brutal.
            </p>
          </Reveal>

          <div className="mt-10 sm:mt-14">
            <BillSurvival />
          </div>
        </div>
      </section>

      {/* ── § 04 — The journey (centerpiece, full-bleed band) ───────────── */}
      <section id="journey" className="scroll-mt-24 border-y border-border bg-secondary/40">
        <div className="container-editorial py-16 sm:py-20">
          <Reveal className="max-w-2xl">
            <p className="label-eyebrow mb-3">§ 04 — The obstacle course</p>
            <h2 className="font-serif text-display-sm sm:text-display-md font-semibold tracking-tight mb-5">
              From idea to law, in seven steps.
            </h2>
            <p className="font-serif text-lg leading-[1.7] text-foreground">
              Every bill on this site is somewhere on this exact path — whether
              it's about school lunches or space travel. Click through the
              steps and walk the road yourself.
            </p>
          </Reveal>

          <div className="mt-10 sm:mt-12">
            <BillJourney />
          </div>
        </div>
      </section>

      {/* ── § 05 — Pop quiz ──────────────────────────────────────────────── */}
      <section id="quiz" className="scroll-mt-24">
        <div className="container-editorial py-16 sm:py-20">
          <Reveal className="max-w-2xl">
            <p className="label-eyebrow mb-3">§ 05 — Pop quiz</p>
            <h2 className="font-serif text-display-sm sm:text-display-md font-semibold tracking-tight mb-5">
              Think you've got it?
            </h2>
            <p className="font-serif text-lg leading-[1.7] text-foreground">
              Five questions. No grades, no pressure — just bragging rights.
            </p>
          </Reveal>

          <Reveal delay={0.1} className="mt-10 max-w-3xl">
            <CivicsQuiz />
          </Reveal>
        </div>
      </section>

      <div className="container-editorial">
        <hr className="rule" />
      </div>

      {/* ── § 06 — Go deeper (podcast) ───────────────────────────────────── */}
      <section id="podcast" className="scroll-mt-24">
        <div className="container-editorial py-16 sm:py-20">
          <Reveal>
            <PodcastPromo placement="learn" eyebrow="§ 06 — Go deeper" />
          </Reveal>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-secondary/40">
        <div className="container-editorial py-16 sm:py-20 text-center">
          <Reveal>
            <p className="label-eyebrow mb-3">Now you're ready</p>
            <h2 className="font-serif text-display-sm sm:text-display-md font-semibold tracking-tight mb-4">
              Watch it happen for real.
            </h2>
            <p className="mx-auto max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed mb-8">
              Right now, thousands of real bills are making this exact journey
              through Congress. Some will become laws that shape your life.
              Follow them as it happens.
            </p>
            <Link
              href="/bills"
              data-ph-capture-attribute-cta="learn-browse-bills"
              className="inline-flex items-center gap-2 rounded-sm bg-foreground px-6 py-3.5 text-sm font-medium text-background hover:bg-foreground/85 transition-colors"
            >
              Browse the bills in Congress
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>
      </article>
    </LearnMotionProvider>
  );
}
