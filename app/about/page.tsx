import Link from 'next/link';
import { sharedViewport } from '../shared-metadata';
import type { Metadata, Viewport } from 'next';
import { ArrowRight } from 'lucide-react';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'About',
  description:
    'About Bills.Congress — an independent record of legislation in the United States Congress.',
};

export default function AboutPage() {
  return (
    <article className="animate-fade-in">
      <header className="border-b border-border">
        <div className="container-editorial py-12 sm:py-16">
          <p className="label-eyebrow mb-3">Colophon</p>
          <h1 className="font-serif text-display-md sm:text-display-lg font-semibold leading-[1.05] tracking-tight max-w-3xl">
            A clear, independent view of the U.S. Congress.
          </h1>
          <p className="mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Bills.Congress is a public-interest project that reorganises the
            government's own data into a calmer, more readable record of the
            laws being made on your behalf.
          </p>
        </div>
      </header>

      <section className="container-editorial py-14">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-8 space-y-10">
            <div>
              <p className="label-eyebrow mb-2">Why this exists</p>
              <h2 className="font-serif text-display-sm font-semibold tracking-tight mb-3">
                Government data, made human-readable.
              </h2>
              <p className="text-base font-serif leading-relaxed text-foreground">
                Congress.gov publishes everything you need to follow legislation —
                but it's optimised for legislative staff, not citizens. Titles
                are jargon, status codes are cryptic, and you have to know what
                you're looking for before you can find it. Bills.Congress takes
                the same primary data and presents it the way a newspaper of
                record would: clearly indexed, plainly summarised, fast to read.
              </p>
            </div>

            <div className="rule" />

            <div>
              <p className="label-eyebrow mb-2">How it works</p>
              <h2 className="font-serif text-display-sm font-semibold tracking-tight mb-3">
                Built on public data, processed transparently.
              </h2>
              <ol className="space-y-5 mt-5">
                {steps.map((step, i) => (
                  <li key={step.title} className="grid grid-cols-12 gap-4 border-b border-border pb-5 last:border-0">
                    <span className="col-span-1 font-mono text-sm text-muted-foreground tabular pt-0.5">
                      0{i + 1}
                    </span>
                    <div className="col-span-11">
                      <p className="font-serif text-lg font-semibold tracking-tight mb-1">
                        {step.title}
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rule" />

            <div>
              <p className="label-eyebrow mb-2">Get involved</p>
              <h2 className="font-serif text-display-sm font-semibold tracking-tight mb-3">
                Open source, by design.
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed mb-5">
                Every line of code, every data transformation, and every
                AI-generated summary prompt is available to inspect. If you find
                something incorrect or have an idea, please open an issue or
                pull request on GitHub.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://github.com/shreyashguptas/billsincongress"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  Source on GitHub
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/bills"
                  className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/85"
                >
                  Explore the bills
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          {/* Sidebar — facts box */}
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 border-l border-border pl-6 space-y-6">
              <div>
                <p className="label-eyebrow mb-2">At a glance</p>
                <p className="font-serif text-xl font-semibold tracking-tight leading-tight">
                  An independent record of every bill in Congress.
                </p>
              </div>
              <dl className="space-y-3 text-sm">
                {facts.map((f) => (
                  <div key={f.label} className="border-b border-border pb-2 flex justify-between gap-3">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="text-foreground font-medium text-right">{f.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Bills.Congress is not affiliated with the United States
                government. Source data is in the public domain.
              </p>
            </div>
          </aside>
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
    body: 'A scheduled job keeps our database in step with the public record. Every bill page shows when its data was last refreshed.',
  },
  {
    title: 'Plain-English summaries',
    body: 'Long-form bill text is condensed into clear summaries by an AI model — never replacing the original, only making it easier to enter.',
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
