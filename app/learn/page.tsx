import Link from 'next/link';
import { ArrowRight, FilePlus, Landmark, PenLine, ScrollText, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { sharedViewport } from '../shared-metadata';
import PodcastPromo from '@/components/podcast-promo';
import { ChamberMark } from '@/components/brand/logo';
import { SectionHeader, SourceLine } from '@/components/brand/section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CommitteePicture,
  HouseVotePicture,
  HundredBills,
  IdeaPicture,
  LawPicture,
  PickPicture,
  SenateVotePicture,
  SignPicture,
  VotePicture,
} from './components/pictures';
import { TwoRooms } from './components/two-rooms';

// How Congress works, in pictures, for a reader as young as eight: one short
// caption per picture and no paragraphs. The page is server-rendered; the only
// client JavaScript of its own is the state picker in <TwoRooms>.

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'How Congress works',
  description:
    'How Congress works, in pictures: people vote, Congress meets in two rooms, and an idea becomes a law in six steps.',
  alternates: { canonical: '/learn' },
};

/**
 * One panel of the story: the picture first, then its caption beside a node —
 * a number in ink for the people, the stage's glyph in the stage's colour for
 * a bill's path. `wide` (the two rooms) puts the caption above a full-width
 * picture, because the caption leads into the state picker.
 */
function Step({
  node,
  tone = 'bg-ink',
  title,
  sub,
  picture,
  wide = false,
}: {
  node: number | LucideIcon;
  tone?: string;
  title: string;
  sub?: string;
  picture: ReactNode;
  wide?: boolean;
}) {
  const Glyph = typeof node === 'number' ? null : node;
  const caption = (
    <div className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-ink', tone)}
      >
        {Glyph ? (
          <Glyph className="h-5 w-5" strokeWidth={1.75} />
        ) : (
          <span className="font-mono text-base tabular">{node as number}</span>
        )}
      </span>
      <div className="pt-1">
        <h3 className="text-display-sm text-ink">{title}</h3>
        {sub && <p className="mt-1.5 text-ink-2 sm:text-lg">{sub}</p>}
      </div>
    </div>
  );
  const frame = <div className="rounded-lg border border-line bg-raised p-4 sm:p-6">{picture}</div>;
  return (
    <li className={cn('flex flex-col gap-5', wide && 'md:col-span-2')}>
      {wide ? caption : frame}
      {wide ? frame : caption}
    </li>
  );
}

function Part({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-line">
      <div className="container-editorial py-16 sm:py-24">
        <SectionHeader eyebrow={eyebrow} title={<span id={`${id}-title`}>{title}</span>} />
        <div className="mt-12 sm:mt-16">{children}</div>
      </div>
    </section>
  );
}

/** The whole idea in one picture: you → Congress → laws. */
function BigIdea() {
  const nodes: { label: string; icon: ReactNode; tone: string }[] = [
    { label: 'You', icon: <User className="h-10 w-10 sm:h-14 sm:w-14" strokeWidth={1.5} />, tone: 'bg-sunken text-ink' },
    { label: 'Congress', icon: <ChamberMark className="h-12 w-12 sm:h-16 sm:w-16" />, tone: 'bg-sunken text-ink' },
    { label: 'Laws', icon: <ScrollText className="h-10 w-10 sm:h-14 sm:w-14" strokeWidth={1.5} />, tone: 'bg-status-law text-on-ink' },
  ];
  return (
    <ol
      aria-label="You pick Congress, and Congress makes the laws."
      className="flex items-start justify-between gap-2 sm:justify-start sm:gap-6"
    >
      {nodes.map((n, i) => (
        <li key={n.label} className="flex items-start gap-2 sm:gap-6">
          <div className="flex flex-col items-center gap-3">
            <span
              aria-hidden="true"
              className={cn('flex h-20 w-20 items-center justify-center rounded-full sm:h-28 sm:w-28', n.tone)}
            >
              {n.icon}
            </span>
            <span className="text-title text-ink">{n.label}</span>
          </div>
          {i < nodes.length - 1 && (
            <ArrowRight aria-hidden="true" className="mt-7 h-6 w-6 text-ink-3 sm:mt-11" strokeWidth={1.75} />
          )}
        </li>
      ))}
    </ol>
  );
}

export default function LearnPage() {
  return (
    <article>
      <header className="container-editorial grid items-center gap-10 pb-16 pt-12 sm:pb-24 sm:pt-16 lg:grid-cols-2">
        <div>
          <p className="label-eyebrow">In pictures</p>
          <h1 className="mt-3 text-display-lg text-ink sm:text-display-xl">How Congress works</h1>
          <p className="mt-4 text-lg text-ink-2 sm:text-xl">Congress makes the rules for the whole country.</p>
        </div>
        <BigIdea />
      </header>

      <Part id="who" eyebrow="Part 1" title="Who is Congress?">
        <ol className="grid gap-x-8 gap-y-14 md:grid-cols-2">
          <Step node={1} title="People vote." sub="Every citizen 18 or older can." picture={<VotePicture />} />
          <Step node={2} title="They pick people to speak for them." picture={<PickPicture />} />
          <Step
            node={3}
            title="Those people meet in two rooms."
            sub="Together, the two rooms are Congress."
            picture={
              <div id="rooms" className="scroll-mt-24">
                <TwoRooms />
              </div>
            }
            wide
          />
        </ol>
      </Part>

      <Part id="path" eyebrow="Part 2" title="How an idea becomes a law">
        <ol className="grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          <Step
            node={FilePlus}
            tone="bg-status-introduced"
            title="Someone has an idea."
            sub="A member of Congress writes it down. Now it’s a bill."
            picture={<IdeaPicture />}
          />
          <Step
            node={Users}
            tone="bg-status-committee"
            title="A small group checks it."
            picture={<CommitteePicture />}
          />
          <Step
            node={Landmark}
            tone="bg-status-passed-one"
            title="One room votes yes."
            sub="More than half must agree."
            picture={<HouseVotePicture />}
          />
          <Step
            node={Landmark}
            tone="bg-status-passed-both"
            title="Then the other room votes yes."
            picture={<SenateVotePicture />}
          />
          <Step
            node={PenLine}
            tone="bg-status-president"
            title="The President signs it."
            picture={<SignPicture />}
          />
          <Step
            node={ScrollText}
            tone="bg-status-law"
            title="Now it’s a law."
            sub="Everyone in the country follows it."
            picture={<LawPicture />}
          />
        </ol>
      </Part>

      <Part id="odds" eyebrow="Part 3" title="Most bills never make it">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <p className="font-serif text-display-md text-ink sm:text-display-lg">
              About <span className="tabular">2</span> in <span className="tabular">100</span> become law.
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-ink-2">
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 rounded-full bg-status-law" />
                Became law
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 rounded-full bg-ink/15" />
                Did not
              </li>
            </ul>
            <SourceLine className="mt-6">
              Source: Congress.gov. The 117th and 118th Congresses (2021–2024): 639 of 31,807 bills became law.
            </SourceLine>
          </div>
          <HundredBills className="mx-auto w-full max-w-sm md:max-w-md" />
        </div>
      </Part>

      <section className="border-t border-line bg-sunken">
        <div className="container-editorial py-16 text-center sm:py-24">
          <h2 className="text-display-sm text-ink sm:text-display-md">See it for real</h2>
          <div className="mx-auto mt-8 flex max-w-xs flex-col items-center justify-center gap-3 sm:max-w-none sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/bills/enacted" data-ph-capture-attribute-cta="learn-enacted-bills">
                Bills that became law
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/bills" data-ph-capture-attribute-cta="learn-browse-bills">
                All bills in Congress
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="container-editorial py-10">
          <PodcastPromo placement="learn" variant="compact" />
        </div>
      </section>
    </article>
  );
}
