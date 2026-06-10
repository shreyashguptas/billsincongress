import Link from 'next/link';
import { sharedViewport } from '../shared-metadata';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms for using Bills.Congress — a free, independent record of legislation in the United States Congress.',
};

const LAST_UPDATED = 'June 9, 2026';

export default function TermsPage() {
  return (
    <article className="animate-fade-in">
      <header className="border-b border-border">
        <div className="container-editorial py-12 sm:py-16">
          <p className="label-eyebrow mb-3">Legal</p>
          <h1 className="font-serif text-display-md sm:text-display-lg font-semibold leading-[1.05] tracking-tight max-w-3xl">
            Terms of Service
          </h1>
          <p className="mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Bills.Congress is a free, public-interest service. These terms keep
            it that way — they are short, written in plain English, and ask
            little more than that you use the site reasonably.
          </p>
          <p className="mt-4 font-mono text-xs text-muted-foreground tabular">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </header>

      <section className="container-editorial py-14">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-8 space-y-10">
            <Section number={1} title="Agreement to these terms">
              <p>
                Bills.Congress (billsincongress.com) is an independent,
                open-source project operated by Shreyash Gupta. By using the
                site, you agree to these terms. If you do not agree with them,
                please do not use the site.
              </p>
            </Section>

            <div className="rule" />

            <Section number={2} title="What the service is (and isn't)">
              <p>
                The site reorganises public legislative data from the official{' '}
                <ExternalLink href="https://api.congress.gov">
                  Congress.gov API
                </ExternalLink>{' '}
                into a clearer, more readable record of the bills moving
                through the United States Congress, and offers an AI assistant
                that answers questions about individual bills.
              </p>
              <p>
                Bills.Congress is <strong>not</strong> affiliated with,
                endorsed by, or operated by the United States government. It is
                an educational and informational resource — nothing on this
                site is legal, financial, or professional advice. For official
                purposes, always rely on{' '}
                <ExternalLink href="https://www.congress.gov">
                  Congress.gov
                </ExternalLink>
                .
              </p>
            </Section>

            <div className="rule" />

            <Section number={3} title="Accuracy and AI-generated content">
              <p>
                We sync data from the public record daily and work hard to
                present it faithfully, but data can lag behind events or
                contain errors introduced upstream or by our processing.
              </p>
              <p>
                Answers and summaries produced by the AI assistant are
                generated automatically and can be incomplete, outdated, or
                plainly wrong. They are a starting point for understanding a
                bill — not a substitute for reading the bill itself or
                consulting the official record.
              </p>
            </Section>

            <div className="rule" />

            <Section number={4} title="Your account">
              <p>
                You don&rsquo;t need an account to read the site. If you create
                one — to save bills and get a higher AI-chat allowance — you
                agree to provide accurate information, keep your password to
                yourself, and be at least 13 years old. You are responsible for
                activity that happens under your account.
              </p>
              <p>
                You can stop using the site at any time, and you can have your
                account and its data deleted by emailing{' '}
                <a
                  href="mailto:hi@mail.billsincongress.com"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  hi@mail.billsincongress.com
                </a>
                .
              </p>
            </Section>

            <div className="rule" />

            <Section number={5} title="Fair use of the service">
              <p>
                The site is free, and the AI assistant costs real money to run,
                so daily usage limits apply (shown in the app when you reach
                them). To keep the service available for everyone, you agree
                not to:
              </p>
              <ul className="space-y-2 list-disc pl-5">
                <li>
                  circumvent rate limits or access controls, or automate
                  requests in a way that burdens the service;
                </li>
                <li>
                  attempt to disrupt, overload, probe, or gain unauthorised
                  access to the site or its infrastructure;
                </li>
                <li>use the service for anything unlawful; or</li>
                <li>
                  misrepresent AI-generated answers as official government
                  statements.
                </li>
              </ul>
              <p>
                If you want the data in bulk, you don&rsquo;t need to scrape us
                — it&rsquo;s all public at Congress.gov, and our code is open
                source.
              </p>
            </Section>

            <div className="rule" />

            <Section number={6} title="Content and licenses">
              <p>
                The legislative data on this site comes from the United States
                government and is in the public domain. The site&rsquo;s source
                code is open source under the MIT license on{' '}
                <ExternalLink href="https://github.com/shreyashguptas/billsincongress">
                  GitHub
                </ExternalLink>
                . The Bills.Congress name and the site&rsquo;s presentation
                remain ours.
              </p>
              <p>
                When you submit a question to the AI assistant, you give us
                permission to process and store it so the feature can work and
                so we can improve the service, as described in our{' '}
                <Link
                  href="/privacy"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </Section>

            <div className="rule" />

            <Section number={7} title="No warranty">
              <p>
                The service is provided &ldquo;as is&rdquo; and &ldquo;as
                available,&rdquo; without warranties of any kind, express or
                implied — including accuracy, availability, or fitness for a
                particular purpose. We may change, suspend, or discontinue any
                part of the service at any time.
              </p>
            </Section>

            <div className="rule" />

            <Section number={8} title="Limitation of liability">
              <p>
                To the fullest extent permitted by law, the project and its
                operator are not liable for any indirect, incidental, or
                consequential damages arising from your use of the site, or for
                decisions made in reliance on its content — including
                AI-generated content. The service is free; our total liability
                for any claim is limited to the amount you paid to use it,
                which is zero.
              </p>
            </Section>

            <div className="rule" />

            <Section number={9} title="Suspension and termination">
              <p>
                We may suspend or close accounts that violate these terms or
                abuse the service. You may delete your account at any time as
                described above.
              </p>
            </Section>

            <div className="rule" />

            <Section number={10} title="Changes to these terms">
              <p>
                If we change these terms, we will update this page and the
                &ldquo;last updated&rdquo; date at the top. Continued use of
                the site after a change means you accept the new terms. The{' '}
                <ExternalLink href="https://github.com/shreyashguptas/billsincongress">
                  full history of this page
                </ExternalLink>{' '}
                is publicly visible on GitHub.
              </p>
            </Section>

            <div className="rule" />

            <Section number={11} title="Governing law and contact">
              <p>
                These terms are governed by the laws of the United States.
                Questions about them are welcome at{' '}
                <a
                  href="mailto:hi@mail.billsincongress.com"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  hi@mail.billsincongress.com
                </a>{' '}
                or on{' '}
                <ExternalLink href="https://github.com/shreyashguptas/billsincongress">
                  GitHub
                </ExternalLink>
                .
              </p>
            </Section>
          </div>

          {/* Sidebar — plain-English summary */}
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 border-l border-border pl-6 space-y-6">
              <div>
                <p className="label-eyebrow mb-2">The short version</p>
                <p className="font-serif text-xl font-semibold tracking-tight leading-tight">
                  A free public resource. Use it reasonably.
                </p>
              </div>
              <ul className="space-y-3 text-sm">
                {summary.map((item) => (
                  <li
                    key={item}
                    className="border-b border-border pb-2 text-muted-foreground leading-relaxed"
                  >
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground leading-relaxed">
                How we handle data is covered separately in our{' '}
                <Link
                  href="/privacy"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      </section>
    </article>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <span className="col-span-12 sm:col-span-1 font-mono text-sm text-muted-foreground tabular pt-1">
        {String(number).padStart(2, '0')}
      </span>
      <div className="col-span-12 sm:col-span-11">
        <h2 className="font-serif text-display-sm font-semibold tracking-tight mb-3">
          {title}
        </h2>
        <div className="space-y-4 text-base text-muted-foreground leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </a>
  );
}

const summary = [
  'Free to use, with or without an account.',
  'Not the government, and not legal advice — verify anything important on Congress.gov.',
  'AI answers can be wrong. Read the bill.',
  'Daily AI-chat limits keep the service free for everyone — don’t try to game them.',
  'The data is public domain; the code is open source.',
  'Provided as-is, no warranty.',
];
