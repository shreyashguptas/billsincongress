import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { sharedViewport } from '../shared-metadata';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'How Congress works',
  description:
    'A short, plain-English guide to the United States Congress and the journey of a bill into law.',
};

export default function LearnPage() {
  return (
    <article className="animate-fade-in">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container-editorial py-12 sm:py-16">
          <p className="label-eyebrow mb-3">A primer</p>
          <h1 className="font-serif text-display-md sm:text-display-lg font-semibold leading-[1.05] tracking-tight max-w-3xl">
            How Congress works.
          </h1>
          <p className="mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Everything moving through this site is part of one specific
            process — the writing, debating and passing of federal law. Here is
            a short guide to what's happening and who is doing it.
          </p>

          <nav className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href="#congress" className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">What Congress is</a>
            <a href="#chambers" className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">The two chambers</a>
            <a href="#bills" className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">What a bill is</a>
            <a href="#journey" className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">A bill's journey</a>
          </nav>
        </div>
      </header>

      {/* Body */}
      <div className="container-editorial py-12 sm:py-16">
        <div className="container-prose !mx-0 lg:!mx-auto !max-w-2xl space-y-16">
          <section id="congress" className="space-y-4 scroll-mt-24">
            <p className="label-eyebrow">§ 01 — Institution</p>
            <h2 className="font-serif text-display-sm font-semibold tracking-tight">
              What is Congress?
            </h2>
            <p className="font-serif text-lg leading-[1.7] text-foreground first-letter-drop">
              Congress is the law-making branch of the federal government — the
              elected body that writes, debates, amends and passes the laws
              under which the United States operates. It is divided into two
              chambers, the House of Representatives and the Senate, and meets
              in the U.S. Capitol in Washington, D.C.
            </p>
            <p className="font-serif text-lg leading-[1.7] text-foreground">
              Each two-year period of work is numbered. The current Congress
              picks up where the last one left off; bills that didn't make it
              through must be reintroduced. That's why every bill on this site
              is tagged with the Congress it belongs to.
            </p>
          </section>

          <hr className="rule" />

          <section id="chambers" className="space-y-6 scroll-mt-24">
            <p className="label-eyebrow">§ 02 — Structure</p>
            <h2 className="font-serif text-display-sm font-semibold tracking-tight">
              The two chambers.
            </h2>
            <p className="font-serif text-lg leading-[1.7] text-foreground">
              For a bill to become a law, both the House and the Senate must
              pass it in identical form. The two chambers serve different — and
              deliberately countervailing — purposes.
            </p>

            <div className="grid sm:grid-cols-2 gap-px bg-border border border-border mt-4">
              {chambers.map((c) => (
                <div key={c.title} className="bg-background p-6">
                  <p className="label-eyebrow mb-2">{c.subtitle}</p>
                  <h3 className="font-serif text-xl font-semibold tracking-tight mb-3">
                    {c.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {c.description}
                  </p>
                  <dl className="space-y-2 text-sm border-t border-border pt-3">
                    {c.facts.map((f) => (
                      <div key={f.label} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{f.label}</dt>
                        <dd className="text-foreground font-mono tabular text-right">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <hr className="rule" />

          <section id="bills" className="space-y-4 scroll-mt-24">
            <p className="label-eyebrow">§ 03 — The instrument</p>
            <h2 className="font-serif text-display-sm font-semibold tracking-tight">
              What is a bill?
            </h2>
            <p className="font-serif text-lg leading-[1.7] text-foreground">
              A bill is a written proposal for a new law, or for a change to an
              existing one. It is the basic instrument by which Congress
              legislates. Bills are written by members of Congress (often with
              help from staff, lawyers, and outside groups) and introduced
              into one of the two chambers.
            </p>
            <p className="font-serif text-lg leading-[1.7] text-foreground">
              Most bills die quietly: more than ninety percent never become law.
              Many are introduced symbolically, to put an idea on the record;
              others fail in committee. The few that survive may travel for
              months or years before reaching the President's desk.
            </p>
          </section>

          <hr className="rule" />

          <section id="journey" className="space-y-6 scroll-mt-24">
            <p className="label-eyebrow">§ 04 — Process</p>
            <h2 className="font-serif text-display-sm font-semibold tracking-tight">
              A bill's journey, in seven stages.
            </h2>
            <p className="font-serif text-lg leading-[1.7] text-foreground">
              Every bill on this site is tracked through the same set of
              stages. The progress bar you see on a bill's page corresponds to
              its position on this path.
            </p>

            <ol className="mt-2 border-y border-border divide-y divide-border">
              {stages.map((s, i) => (
                <li key={s.title} className="grid grid-cols-12 gap-4 py-5">
                  <div className="col-span-2 sm:col-span-1">
                    <p className="font-mono text-sm text-muted-foreground tabular pt-0.5">
                      0{i + 1}
                    </p>
                  </div>
                  <div className="col-span-10 sm:col-span-11">
                    <h3 className="font-serif text-xl font-semibold tracking-tight mb-1">
                      {s.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="rule" />

          <section className="text-center py-4">
            <p className="label-eyebrow mb-3">Now you're ready.</p>
            <Link
              href="/bills"
              className="inline-flex items-center gap-2 rounded-sm bg-foreground px-5 py-3 text-sm font-medium text-background hover:bg-foreground/85 transition-colors"
            >
              Browse the bills in Congress
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </div>
      </div>
    </article>
  );
}

const chambers = [
  {
    subtitle: "The People's Chamber",
    title: 'House of Representatives',
    description:
      "Representation by population. Each state's seats are apportioned according to its share of the national population, so larger states have more votes.",
    facts: [
      { label: 'Members', value: '435' },
      { label: 'Term length', value: '2 years' },
      { label: 'Leader', value: 'Speaker' },
    ],
  },
  {
    subtitle: "The States' Chamber",
    title: 'Senate',
    description:
      'Equal representation by state. Every state — no matter its size — has exactly two Senators, and one third of the seats come up for election every two years.',
    facts: [
      { label: 'Members', value: '100' },
      { label: 'Term length', value: '6 years' },
      { label: 'Leader', value: 'Vice President' },
    ],
  },
];

const stages = [
  {
    title: 'Introduced',
    body: 'A member of Congress formally puts the bill on the record in their chamber. The bill receives an official number, like H.R. 1234 (House) or S. 567 (Senate).',
  },
  {
    title: 'In committee',
    body: 'The bill is referred to one or more standing committees, where most of the substantive work happens — hearings, expert testimony, amendments, and often, quiet death.',
  },
  {
    title: 'Passed one chamber',
    body: 'If the committee reports the bill out, the full chamber debates and votes on it. A simple majority is enough for passage.',
  },
  {
    title: 'Passed both chambers',
    body: 'The other chamber repeats the process. If both pass different versions, a conference committee reconciles them into a single text that both chambers must approve again.',
  },
  {
    title: 'To the President',
    body: 'Once both chambers agree on identical language, the bill is enrolled and sent to the President.',
  },
  {
    title: 'Signed',
    body: 'The President signs the bill within ten days. (If they do nothing while Congress is in session, it also becomes law. A veto sends it back, where Congress may override with a two-thirds vote in each chamber.)',
  },
  {
    title: 'Became law',
    body: 'The bill is now an Act, assigned a Public Law number (e.g. PL 118-42), and added to the United States Code.',
  },
];
