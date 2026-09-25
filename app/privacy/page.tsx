import Link from 'next/link';
import { sharedViewport } from '../shared-metadata';
import type { Metadata, Viewport } from 'next';
import { LegalPage, Section, ExternalLink } from '@/components/legal/section';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Bills in Congress collects, uses, and protects your data — in plain English.',
  alternates: { canonical: '/privacy' },
};

const LAST_UPDATED = 'September 24, 2026';

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      standfirst={
        <>
          We run this site to make Congress easier to read — not to collect
          data about you. This page explains, in plain English, exactly what
          we collect, why we collect it, and what we will never do with it.
        </>
      }
      lastUpdated={LAST_UPDATED}
      summaryTitle="We collect as little as possible, and we never sell it."
      summary={summary}
      summaryNote={
        <>
          Questions? Email{' '}
          <a
            href="mailto:hi@billsincongress.com"
            className="link focus-ring rounded-xs"
          >
            hi@billsincongress.com
          </a>
          . See also our{' '}
          <Link
            href="/terms"
            className="link focus-ring rounded-xs"
          >
            Terms of Service
          </Link>
          .
        </>
      }
    >
      <Section number={1} title="Who we are">
        <p>
          Bills in Congress (billsincongress.com) is an independent,
          open-source, public-interest project operated by Shreyash
          Gupta. It is not affiliated with the United States government.
          The legislative data we publish comes from the official{' '}
          <ExternalLink href="https://api.congress.gov">
            Congress.gov API
          </ExternalLink>{' '}
          and is in the public domain. In this policy, &ldquo;we&rdquo;
          and &ldquo;us&rdquo; refer to the project and its operator.
        </p>
      </Section>

      <Section number={2} title="What we collect when you just browse">
        <p>
          You can read every bill on this site without creating an
          account. While you browse, we collect usage analytics through{' '}
          <ExternalLink href="https://posthog.com">PostHog</ExternalLink>
          : the pages you visit, the links and buttons you click, your
          browser and device type, the site that referred you, page
          performance measurements, and any errors the site throws. Our
          analytics also include session replay — a reconstruction of how
          a page was used (clicks, scrolling, navigation) that helps us
          find confusing design and bugs.
        </p>
        <p>
          One thing you type is included in that analytics data: when a
          search of the bills list returns no results, we record the text
          you searched for, so we can see what people expect to find and
          cannot. Your other filter choices are not recorded.
        </p>
        <p>
          Your IP address is processed by our hosting provider
          (Cloudflare) to deliver the site and protect it from abuse, and
          by our analytics provider to estimate an approximate, city-level
          location. We do not store IP addresses in our own database.
        </p>
      </Section>

      <Section number={3} title="The AI assistant">
        <p>
          When you ask a question, your question — together with the public
          bill information the assistant looked up to answer it (title,
          sponsor, status, official summary) — is sent to{' '}
          <ExternalLink href="https://openrouter.ai">
            OpenRouter
          </ExternalLink>
          , which routes it to the AI model that writes the answer. We
          restrict that routing to providers that process data in the
          United States. We also require that routing go only to
          providers that do not retain your question or use it to train
          models. OpenRouter and the model provider it routes to receive
          your question text but not your name or email address.
        </p>
        <p>
          If you are signed in, your conversations are saved to your
          account so you can return to them, and they are listed only to
          you. You can delete any single conversation, or all of them,
          from the history list in the ask panel.
        </p>
        <p>
          If you are not signed in, your conversation is never stored on
          our servers — it lives in your browser and disappears when you
          close the tab. To be exact: each question is sent to our server
          along with the conversation so far, so the assistant can follow
          the thread, but none of it is written to our database. The table
          that holds saved conversations requires an account, so an
          anonymous one cannot be recorded even by mistake.
        </p>
        <p>
          If our own records cannot answer your question, the assistant
          may look the answer up on the web. When that happens we send a
          rewritten, neutral search phrase — not your question in your own
          words — to our search provider, and the answer shows you exactly
          which parts did not come from our database. The
          no-retention requirement above covers the AI model providers; it
          does not extend to the search provider, which is why we rewrite
          the query rather than forwarding it.
        </p>
        <p>
          Question text is also included in our product analytics so we
          can understand what people want to know about legislation.
        </p>
        <p>
          To delete your whole account, email us at{' '}
          <ExternalLink href="mailto:hi@billsincongress.com">
            hi@billsincongress.com
          </ExternalLink>{' '}
          and we will remove it.
        </p>
      </Section>

      <Section number={4} title="If you create an account">
        <p>
          Creating an account is optional. If you sign up with email and
          password, we store your email address, a one-way encrypted
          (hashed) version of your password — we never store or see the
          password itself — and whether your email has been verified. If
          you sign in with Google, we receive your name, email address,
          and profile picture from Google; we never see your Google
          password.
        </p>
        <p>
          While you use your account, we also store the things you do
          with it: the bills you save and your bill-chat history. Once
          you are signed in, our analytics link your activity to your
          account (including your email address) so we can understand the
          journey from first visit to sign-up. We send email only for
          account purposes — today only the sign-up verification code;
          password-reset codes will join it once self-serve reset is built —
          through PostHog, the same provider that runs our analytics. To
          deliver one, PostHog receives your email address and the
          message, keeps a record of the send (including the code, which
          expires after 15 minutes) for troubleshooting, and records
          whether it was delivered or bounced. These
          emails contain no tracking pixels or tracked links. We do not
          send marketing email or newsletters.
        </p>
        <p>
          The site is free and has no paid features today, so we do not
          collect any payment information.
        </p>
      </Section>

      <Section number={5} title="Cookies and local storage">
        <p>
          We use a small number of cookies and browser-storage entries,
          all of them functional — none are advertising trackers:
        </p>
        <ul className="mt-4 border-t border-line">
          {cookies.map((c) => (
            <li
              key={c.name}
              className="border-b border-line py-3"
            >
              <p className="font-mono text-sm text-ink">{c.name}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">
                {c.purpose}{' '}
                <span className="text-ink-3">({c.lifespan})</span>
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section number={6} title="The services we rely on">
        <p>
          We don&rsquo;t share your data with anyone except the service
          providers that make the site run, and only to the extent needed
          for the job each one does:
        </p>
        <ul className="mt-4 border-t border-line">
          {providers.map((p) => (
            <li
              key={p.name}
              className="border-b border-line py-3"
            >
              <p className="font-medium text-ink">
                {p.name}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">
                {p.role}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4">
          All of these providers process data in the United States.
        </p>
      </Section>

      <Section number={7} title="What we never do">
        <ul className="list-disc space-y-2 pl-5">
          <li>We never sell or rent your data to anyone.</li>
          <li>
            We show no ads and use no advertising trackers or data
            brokers.
          </li>
          <li>
            We don&rsquo;t share your data with third parties beyond the
            service providers listed above, unless the law requires it.
          </li>
          <li>
            We don&rsquo;t ask for — and don&rsquo;t want — any sensitive
            personal information.
          </li>
        </ul>
      </Section>

      <Section number={8} title="How long we keep things">
        <p>
          Account data, saved bills, and signed-in chat history are kept
          for as long as your account exists. Sign-in sessions expire
          after at most 60 days of inactivity. Signed-out chat
          conversations are keyed to a cookie that expires after 60 days.
          Analytics data is retained by PostHog under its standard
          retention policies.
        </p>
      </Section>

      <Section number={9} title="Your choices and rights">
        <p>
          You can read everything on this site without an account. You
          can block or clear cookies at any time — the site keeps working
          (you would be signed out, and analytics simply stops). Self-serve
          password reset is not built yet — no reset email is sent today —
          so email us and we will reset it for you.
        </p>
        <p>
          To delete your account — along with your saved bills and chat
          history — or to request a copy of the data we hold about you,
          email{' '}
          <a
            href="mailto:hi@billsincongress.com"
            className="link focus-ring rounded-xs"
          >
            hi@billsincongress.com
          </a>{' '}
          and we&rsquo;ll take care of it.
        </p>
      </Section>

      <Section number={10} title="Children">
        <p>
          The site is an educational resource that anyone can read, but
          it is not directed at children under 13, and we ask that
          children under 13 not create accounts.
        </p>
      </Section>

      <Section number={11} title="Changes to this policy">
        <p>
          If our data practices change, we will update this page and the
          &ldquo;last updated&rdquo; date at the top. Because the project
          is open source, the{' '}
          <ExternalLink href="https://github.com/shreyashguptas/billsincongress">
            full history of this policy
          </ExternalLink>{' '}
          is publicly visible on GitHub.
        </p>
      </Section>
    </LegalPage>
  );
}

const summary = [
  'We never sell your data. No ads, no ad trackers, no data brokers.',
  'You can read every bill without an account.',
  'An account is just an email and password (or Google sign-in) — nothing more.',
  'AI questions are answered through OpenRouter, routed only to US providers that do not retain or train on them.',
  'Signed-in conversations are saved to your account and visible only to you; signed-out conversations are never stored on our servers.',
  'We email you only for account reasons — never marketing.',
  'No payment data: the site is free.',
];

const cookies = [
  {
    name: 'Sign-in session cookies',
    purpose:
      'Keep you signed in to your account so you don’t have to log in on every visit.',
    lifespan: 'up to 60 days',
  },
  {
    name: 'bic_bill_chat_session',
    purpose:
      'A random ID that enforces the daily AI-chat limit for signed-out visitors. Contains no personal information.',
    lifespan: '60 days',
  },
  {
    name: 'PostHog analytics (ph_*)',
    purpose:
      'Distinguishes one visitor from another so usage statistics are accurate.',
    lifespan: 'up to 1 year',
  },
  {
    name: 'Theme preference (local storage)',
    purpose: 'Remembers your light/dark mode choice. Never leaves your browser.',
    lifespan: 'until cleared',
  },
];

const providers = [
  {
    name: 'Convex',
    role: 'Our database and authentication backend. Stores accounts, saved bills, chat history, and the public bill data.',
  },
  {
    name: 'Cloudflare',
    role: 'Hosts and serves the website, and protects it from attacks. Processes IP addresses as part of delivering every request.',
  },
  {
    name: 'PostHog',
    role: 'Product analytics (US cloud): page views, clicks, session replay, performance, and error reports. Also delivers account emails (today, sign-up verification codes; password-reset codes once that flow is built), for which it receives your email address and the message.',
  },
  {
    name: 'OpenRouter',
    role: 'Routes your questions to the AI model that generates the answer, restricted to US providers that do not retain them or train on them. Receives your question and the relevant public bill details — not your identity.',
  },
  {
    name: 'Exa',
    role: 'Web search, used only when our own records cannot answer. Receives a rewritten neutral search phrase, never your question in your own words and never your identity.',
  },
  {
    name: 'Google',
    role: 'Only if you choose “Sign in with Google”: provides us your name, email, and profile picture.',
  },
];
