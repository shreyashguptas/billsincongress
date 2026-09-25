import Link from 'next/link';
import { sharedViewport } from '../shared-metadata';
import type { Metadata, Viewport } from 'next';
import { ArrowRight } from 'lucide-react';
import { SectionHeader } from '@/components/brand/section';
import { Button } from '@/components/ui/button';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'About',
  description:
    'About Bills in Congress — an independent record of legislation in the United States Congress.',
  alternates: { canonical: '/about' },
};

// An editorial reading page: one 680px column, sections divided by hairlines
// (Documentation/brand.md, "Layout and shape").
export default function AboutPage() {
  return (
    <article className="animate-fade-in">
      <header className="container-prose pb-12 pt-12 sm:pb-16 sm:pt-16">
        <p className="label-eyebrow">Colophon</p>
        <h1 className="mt-3 text-display-lg text-ink sm:text-display-xl">
          A clear, independent view of the U.S. Congress.
        </h1>
        <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed text-ink-2 sm:text-lg">
          Bills in Congress is a public-interest project that reorganises the
          government&apos;s own data into a calmer, more readable record of the
          laws being made on your behalf.
        </p>
      </header>

      {/* At a glance */}
      <section className="container-prose">
        <div className="border-t border-line pt-8 pb-16 sm:pb-24">
          <p className="label-eyebrow">At a glance</p>
          <p className="mt-3 font-serif text-title text-ink">
            An independent record of every bill in Congress.
          </p>
          <dl className="mt-6 border-t border-line text-sm">
            {facts.map((f) => (
              <div key={f.label} className="flex justify-between gap-3 border-b border-line py-3">
                <dt className="text-ink-2">{f.label}</dt>
                <dd className="text-right font-medium text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Bills in Congress is not affiliated with the United States
            government. Source data is in the public domain.
          </p>
        </div>
      </section>

      <section className="container-prose">
        <div className="border-t border-line py-16 sm:py-24">
          <SectionHeader eyebrow="Why this exists" title="Government data, made human-readable." />
          <p className="mt-5 font-serif text-reading text-ink">
            Congress.gov publishes everything you need to follow legislation —
            but it&apos;s optimised for legislative staff, not citizens. Titles
            are jargon, status codes are cryptic, and you have to know what
            you&apos;re looking for before you can find it. Bills in Congress takes
            the same primary data and presents it the way a newspaper of
            record would: clearly indexed, plainly summarised, fast to read.
          </p>
        </div>
      </section>

      <section className="container-prose">
        <div className="border-t border-line py-16 sm:py-24">
          <SectionHeader eyebrow="How it works" title="Built on public data, processed transparently." />
          <ol className="mt-8 border-t border-line">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-4 border-b border-line py-5 sm:gap-6">
                <span className="w-6 shrink-0 pt-1 font-mono text-sm text-ink-3 tabular">0{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="text-title text-ink">{step.title}</h3>
                  <p className="mt-1.5 text-base leading-relaxed text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container-prose">
        <div className="border-t border-line py-16 sm:py-24">
          <SectionHeader eyebrow="Get involved" title="Open source, by design." />
          <p className="mt-5 font-serif text-reading text-ink">
            Every line of code, every data transformation, and every
            prompt we send to the AI assistant is available to inspect. If you find
            something incorrect or have an idea, please open an issue or
            pull request on GitHub.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/bills" data-ph-capture-attribute-cta="about-browse-bills">
                Explore the bills
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a
                href="https://github.com/shreyashguptas/billsincongress"
                target="_blank"
                rel="noopener noreferrer"
                data-ph-capture-attribute-cta="about-github"
              >
                Source on GitHub
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </article>
  );
}

const steps = [
  {
    title: 'Direct ingestion from Congress.gov',
    body: 'We pull bill text, sponsor data, and status changes from the official Congress.gov API. No scraping, no intermediaries.',
  },
  {
    title: 'Continuous synchronisation',
    body: 'Scheduled jobs keep our database in step with the public record — nightly, with weekly and monthly safety nets. The bills index shows how long ago the last sync finished.',
  },
  {
    title: 'Plain-English summaries',
    body: "The plain-English summary on a bill page is Congress's own, written by the nonpartisan Congressional Research Service. We strip the markup and change nothing else — no rewriting, no AI.",
  },
  {
    title: 'Open data, open code',
    body: 'The source code, schema, and pipeline are all on GitHub. You can host your own copy or contribute back changes.',
  },
];

const facts = [
  { label: 'Data source', value: 'Congress.gov API' },
  { label: 'Update cadence', value: 'Daily' },
  { label: 'Coverage', value: 'Recent Congresses' },
  { label: 'License', value: 'Open source' },
];
