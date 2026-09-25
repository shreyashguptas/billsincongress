import Link from 'next/link';
import { sharedViewport } from '../shared-metadata';
import type { Metadata, Viewport } from 'next';
import { LegalPage, Section, ExternalLink } from '@/components/legal/section';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms for using Bills in Congress — a free, independent record of legislation in the United States Congress.',
  alternates: { canonical: '/terms' },
};

const LAST_UPDATED = 'September 24, 2026';

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      standfirst={
        <>
          Bills in Congress is a free, public-interest service. These terms keep
          it that way — they are short, written in plain English, and ask
          little more than that you use the site reasonably.
        </>
      }
      lastUpdated={LAST_UPDATED}
      summaryTitle="A free public resource. Use it reasonably."
      summary={summary}
      summaryNote={
        <>
          How we handle data is covered separately in our{' '}
          <Link
            href="/privacy"
            className="link focus-ring rounded-xs"
          >
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      <Section number={1} title="Agreement to these terms">
        <p>
          Bills in Congress (billsincongress.com) is an independent,
          open-source project operated by Shreyash Gupta. By using the
          site, you agree to these terms. If you do not agree with them,
          please do not use the site.
        </p>
      </Section>

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
          Bills in Congress is <strong>not</strong> affiliated with,
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
            href="mailto:hi@billsincongress.com"
            className="link focus-ring rounded-xs"
          >
            hi@billsincongress.com
          </a>
          .
        </p>
      </Section>

      <Section number={5} title="Fair use of the service">
        <p>
          The site is free, and the AI assistant costs real money to run,
          so daily usage limits apply (shown in the app when you reach
          them). To keep the service available for everyone, you agree
          not to:
        </p>
        <ul className="list-disc space-y-2 pl-5">
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

      <Section number={6} title="Content and licenses">
        <p>
          The legislative data on this site comes from the United States
          government and is in the public domain. The site&rsquo;s source
          code is open source under the MIT license on{' '}
          <ExternalLink href="https://github.com/shreyashguptas/billsincongress">
            GitHub
          </ExternalLink>
          . The Bills in Congress name and the site&rsquo;s presentation
          remain ours.
        </p>
        <p>
          When you submit a question to the AI assistant, you give us
          permission to process and store it so the feature can work and
          so we can improve the service, as described in our{' '}
          <Link
            href="/privacy"
            className="link focus-ring rounded-xs"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section number={7} title="No warranty">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as
          available,&rdquo; without warranties of any kind, express or
          implied — including accuracy, availability, or fitness for a
          particular purpose. We may change, suspend, or discontinue any
          part of the service at any time.
        </p>
      </Section>

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

      <Section number={9} title="Suspension and termination">
        <p>
          We may suspend or close accounts that violate these terms or
          abuse the service. You may delete your account at any time as
          described above.
        </p>
      </Section>

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

      <Section number={11} title="Governing law and contact">
        <p>
          These terms are governed by the laws of the United States.
          Questions about them are welcome at{' '}
          <a
            href="mailto:hi@billsincongress.com"
            className="link focus-ring rounded-xs"
          >
            hi@billsincongress.com
          </a>{' '}
          or on{' '}
          <ExternalLink href="https://github.com/shreyashguptas/billsincongress">
            GitHub
          </ExternalLink>
          .
        </p>
      </Section>
    </LegalPage>
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
