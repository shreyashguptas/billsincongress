import Link from 'next/link';
import { sharedViewport } from '../shared-metadata';
import type { Metadata, Viewport } from 'next';
import { Section, ExternalLink } from '@/components/legal/section';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Bills.Congress collects, uses, and protects your data — in plain English.',
  alternates: { canonical: '/privacy' },
};

const LAST_UPDATED = 'August 26, 2026';

export default function PrivacyPage() {
  return (
    <article className="animate-fade-in">
      <header className="border-b border-border">
        <div className="container-editorial py-12 sm:py-16">
          <p className="label-eyebrow mb-3">Legal</p>
          <h1 className="font-serif text-display-md sm:text-display-lg font-semibold leading-[1.05] tracking-tight max-w-3xl">
            Privacy Policy
          </h1>
          <p className="mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            We run this site to make Congress easier to read — not to collect
            data about you. This page explains, in plain English, exactly what
            we collect, why we collect it, and what we will never do with it.
          </p>
          <p className="mt-4 font-mono text-xs text-muted-foreground tabular">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </header>

      <section className="container-editorial py-14">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-8 space-y-10">
            <Section number={1} title="Who we are">
              <p>
                Bills.Congress (billsincongress.com) is an independent,
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

            <div className="rule" />

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
                Your IP address is processed by our hosting provider
                (Cloudflare) to deliver the site and protect it from abuse, and
                by our analytics provider to estimate an approximate, city-level
                location. We do not store IP addresses in our own database.
              </p>
            </Section>

            <div className="rule" />

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
                our servers at all — it lives in your browser and disappears
                when you close the tab.
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

            <div className="rule" />

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
                account purposes — verification codes and password resets — via{' '}
                <ExternalLink href="https://resend.com">Resend</ExternalLink>.
                We do not send marketing email or newsletters.
              </p>
              <p>
                The site is free and has no paid features today, so we do not
                collect any payment information.
              </p>
            </Section>

            <div className="rule" />

            <Section number={5} title="Cookies and local storage">
              <p>
                We use a small number of cookies and browser-storage entries,
                all of them functional — none are advertising trackers:
              </p>
              <ul className="space-y-3 mt-4">
                {cookies.map((c) => (
                  <li
                    key={c.name}
                    className="border-b border-border pb-3 last:border-0"
                  >
                    <p className="font-mono text-sm text-foreground">{c.name}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                      {c.purpose}{' '}
                      <span className="text-foreground/70">({c.lifespan})</span>
                    </p>
                  </li>
                ))}
              </ul>
            </Section>

            <div className="rule" />

            <Section number={6} title="The services we rely on">
              <p>
                We don&rsquo;t share your data with anyone except the service
                providers that make the site run, and only to the extent needed
                for the job each one does:
              </p>
              <ul className="space-y-3 mt-4">
                {providers.map((p) => (
                  <li
                    key={p.name}
                    className="border-b border-border pb-3 last:border-0"
                  >
                    <p className="font-serif text-base font-semibold tracking-tight">
                      {p.name}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                      {p.role}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-4">
                All of these providers process data in the United States.
              </p>
            </Section>

            <div className="rule" />

            <Section number={7} title="What we never do">
              <ul className="space-y-2 list-disc pl-5">
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

            <div className="rule" />

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

            <div className="rule" />

            <Section number={9} title="Your choices and rights">
              <p>
                You can read everything on this site without an account. You
                can block or clear cookies at any time — the site keeps working
                (you would be signed out, and analytics simply stops). You can
                change your password through the password-reset flow.
              </p>
              <p>
                To delete your account — along with your saved bills and chat
                history — or to request a copy of the data we hold about you,
                email{' '}
                <a
                  href="mailto:hi@billsincongress.com"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  hi@billsincongress.com
                </a>{' '}
                and we&rsquo;ll take care of it.
              </p>
            </Section>

            <div className="rule" />

            <Section number={10} title="Children">
              <p>
                The site is an educational resource that anyone can read, but
                it is not directed at children under 13, and we ask that
                children under 13 not create accounts.
              </p>
            </Section>

            <div className="rule" />

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
          </div>

          {/* Sidebar — plain-English summary */}
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 border-l border-border pl-6 space-y-6">
              <div>
                <p className="label-eyebrow mb-2">The short version</p>
                <p className="font-serif text-xl font-semibold tracking-tight leading-tight">
                  We collect as little as possible, and we never sell it.
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
                Questions? Email{' '}
                <a
                  href="mailto:hi@billsincongress.com"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  hi@billsincongress.com
                </a>
                . See also our{' '}
                <Link
                  href="/terms"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Terms of Service
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
    role: 'Product analytics (US cloud): page views, clicks, session replay, performance, and error reports.',
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
    name: 'Resend',
    role: 'Delivers account emails: verification codes and password resets.',
  },
  {
    name: 'Google',
    role: 'Only if you choose “Sign in with Google”: provides us your name, email, and profile picture.',
  },
];
