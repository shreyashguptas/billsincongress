import { ModeToggle } from '@/components/theme/mode-toggle';
import { Github } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { InstallAppButton } from '@/components/pwa/install-app-button';
import { HubLinkTracker } from '@/app/bills/_hub/hub-view-tracker';
import { hubByPath, type HubDefinition } from '@/lib/hubs';

const linkClass =
  'focus-ring inline-flex items-center gap-1.5 rounded-sm text-sm text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline';

/**
 * The footer carries only what has no other home: who publishes the site and
 * that it is independent, the paid plan (a signed-out reader has no other
 * route to /pro), the legal pages, the source, and the two controls — install
 * and theme. Bills, Learn and About are in the header on every page.
 *
 * Three hubs stay: the two chambers and "became law", the ones readers
 * actually clicked here (House, law and Senate took ~70% of footer hub clicks
 * in the 90 days to 25 Sep 2026). They are also the crawl path from the
 * homepage: /bills/enacted links every other stage hub, and the full set of 40
 * is on /bills and in the sitemap.
 */
const FOOTER_HUBS = ['/bills/house', '/bills/senate', '/bills/enacted']
  .map(hubByPath)
  .filter((hub): hub is HubDefinition => hub !== null);

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-paper">
      {/* pb clears the ask launcher, which is fixed to the bottom-right on
          every page and would otherwise sit on top of the last row. */}
      <div className="container-editorial pb-24 pt-12 sm:pt-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <Logo size="lg" />
            <div className="mt-5 space-y-1.5">
              <p className="text-balance font-serif text-[19px] leading-[28px] text-ink">
                An independent record of every bill in the U.S. Congress.
              </p>
              <p className="text-sm text-ink-3">Not affiliated with the U.S. government.</p>
            </div>
            <HubLinkTracker placement="footer" className="mt-5">
              <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {FOOTER_HUBS.map((hub) => (
                  <li key={hub.path}>
                    <Link href={hub.path} className={linkClass}>
                      {hub.heading}
                    </Link>
                  </li>
                ))}
              </ul>
            </HubLinkTracker>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Renders only where installing is possible (see the component). */}
            <InstallAppButton />
            <ModeToggle />
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <li>
                <Link href="/pro" className={linkClass}>
                  Pro
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={linkClass}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className={linkClass}>
                  Terms
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/shreyashguptas/billsincongress"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  <Github className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Source
                </a>
              </li>
            </ul>
          </nav>
          <p className="font-mono text-xs text-ink-3">
            © {year} Bills in Congress · Data from{' '}
            <a
              href="https://www.congress.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring rounded-sm underline decoration-line-strong underline-offset-2 hover:text-ink"
            >
              Congress.gov
            </a>
            , public domain
          </p>
        </div>
      </div>
    </footer>
  );
}
