import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import { ThemeProvider } from '@/components/theme-provider';
import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { AnswerProvider } from '@/components/answers/answer-provider';
import { AnswerPanel } from '@/components/answers/answer-panel';
import { WelcomeNewUser } from '@/components/auth/welcome-new-user';
import { PostHogAuthSync } from '@/components/analytics/posthog-auth-sync';
import { ConvexClientProvider } from '@/components/convex-client-provider';
import { sharedViewport, sharedThemeColor } from './shared-metadata';
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from '@/lib/seo';
import { JsonLd } from '@/components/seo/json-ld';

// Sitewide identity for search engines: who publishes this site and how its
// search works. Bill pages add Legislation + BreadcrumbList nodes of their own.
const SITE_GRAPH = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512x512.png`,
      description:
        'An independent record of legislation in the United States Congress, sourced from the public Congress.gov API. Not affiliated with the U.S. government.',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#org` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/bills?title={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      // Declares the whole bill corpus as a structured dataset — eligible for
      // Google Dataset Search and a strong "authoritative data source" signal.
      // `creator` is the data's origin (U.S. Congress); `publisher` is us, the
      // aggregator. Data are U.S. Government works (public domain), sourced from
      // Congress.gov. A real `distribution` (DataDownload) can be added later if a
      // public data export / API ships.
      '@type': 'Dataset',
      '@id': `${SITE_URL}/#dataset`,
      name: 'United States Congressional Bills',
      description:
        'A structured, continually updated record of every bill introduced in the United States Congress — including sponsor, current status and legislative stage, full text, subjects, and complete action history — covering recent Congresses. Sourced from the official Congress.gov API.',
      url: `${SITE_URL}/bills`,
      keywords: [
        'United States Congress',
        'legislation',
        'bills',
        'lawmaking',
        'Congress.gov',
        'legislative tracking',
      ],
      isAccessibleForFree: true,
      creator: {
        '@type': 'GovernmentOrganization',
        name: 'United States Congress',
        url: 'https://www.congress.gov',
      },
      publisher: { '@id': `${SITE_URL}/#org` },
      isBasedOn: 'https://api.congress.gov',
      sameAs: 'https://www.congress.gov',
      creditText:
        'Bill data are U.S. Government works (public domain), sourced from Congress.gov.',
      license: 'https://creativecommons.org/publicdomain/mark/1.0/',
      spatialCoverage: { '@type': 'Place', name: 'United States' },
      temporalCoverage: '2021-01-03/..',
      variableMeasured: [
        'bill title',
        'sponsor',
        'legislative status',
        'progress stage',
        'policy area',
        'actions',
        'full text',
      ],
    },
  ],
};

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  axes: ['opsz', 'SOFT'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  ...sharedViewport,
  themeColor: sharedThemeColor,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    'A clear, independent view of every bill moving through the United States Congress.',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-64x64.png', sizes: '64x64', type: 'image/png' },
      { url: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon.png'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: SITE_NAME,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No Suspense boundary above the page: the response must not flush before
  // page data resolves, so notFound() can still produce a real 404 status and
  // metadata lands in <head> instead of being streamed into <body>.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <JsonLd data={SITE_GRAPH} />
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              {/*
                AnswerProvider holds the conversation, and AnswerPanel is a
                SIBLING of {children} — never inside it. Client-side navigation
                swaps the page underneath while the conversation survives, which
                is the whole point of the persistent panel (spec §6.2). Moving
                the panel inside <main> would silently destroy it on every link
                click.
              */}
              <AnswerProvider>
                <a
                  href="#main"
                  className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-foreground focus:text-background focus:px-3 focus:py-2 focus:text-sm"
                >
                  Skip to content
                </a>
                {/*
                  `ask-shell` is the element the docked panel pushes, via a
                  padding-right in globals.css. It has to be this node: it is
                  the only one wrapping header, main and footer together, so
                  the sticky header squeezes with the page instead of running
                  underneath the panel. Padding, never a transform — a
                  transform does not reflow and would make this a containing
                  block for every fixed descendant.
                */}
                <div className="ask-shell flex min-h-screen flex-col">
                  <Navigation />
                  {/* tabIndex so focus can be moved here when the panel
                      steps aside for a bill the reader tapped in an answer. */}
                  <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
                    {children}
                  </main>
                  <Footer />
                </div>
                <AnswerPanel />
                <WelcomeNewUser />
                <PostHogAuthSync />
              </AnswerProvider>
            </ThemeProvider>
          </ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
