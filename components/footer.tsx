import { ModeToggle } from '@/components/theme/mode-toggle';
import { Github } from 'lucide-react';
import Link from 'next/link';
import { hubsOfKind } from '@/lib/hubs';
import { Logo } from '@/components/brand/logo';
import { InstallAppButton } from '@/components/pwa/install-app-button';

const linkClass = 'focus-ring rounded-sm text-sm text-ink-2 transition-colors hover:text-ink';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-paper">
      {/* pb clears the ask launcher, which is fixed to the bottom-right on
          every page and would otherwise sit on top of the last link column. */}
      <div className="container-editorial pb-24 pt-14 sm:pt-16">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="space-y-4 md:col-span-2">
            <Logo size="lg" />
            <p className="max-w-md text-sm leading-relaxed text-ink-2">
              An independent record of legislation in the United States Congress, sourced from the public
              Congress.gov API. Not affiliated with the U.S. government.
            </p>
            {/* Renders only where installing is possible (see the component). */}
            <InstallAppButton />
          </div>

          <div>
            <p className="label-eyebrow mb-3">Browse</p>
            <ul className="space-y-2.5">
              <li><Link href="/bills" className={linkClass}>All bills</Link></li>
              <li><Link href="/learn" className={linkClass}>How Congress works</Link></li>
            </ul>
            {/* Chamber and status hubs live in the footer so they are reachable
                from every page — including the homepage, which is the only page
                Google currently indexes. The full set, topics included, is on
                /bills. */}
            <p className="label-eyebrow mb-3 mt-7">By chamber &amp; stage</p>
            <ul className="space-y-2.5">
              {[...hubsOfKind('chamber'), ...hubsOfKind('status')].map((hub) => (
                <li key={hub.path}>
                  <Link href={hub.path} className={linkClass}>
                    {hub.heading}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label-eyebrow mb-3">Project</p>
            <ul className="space-y-2.5">
              <li><Link href="/about" className={linkClass}>About</Link></li>
              <li>
                <a
                  href="https://github.com/shreyashguptas/billsincongress"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${linkClass} inline-flex items-center gap-1.5`}
                >
                  <Github className="h-3.5 w-3.5" aria-hidden="true" />
                  Source on GitHub
                </a>
              </li>
              <li>
                <a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Data: Congress.gov
                </a>
              </li>
              <li><Link href="/pro" className={linkClass}>Pro: bill alerts</Link></li>
              <li><Link href="/terms" className={linkClass}>Terms of Service</Link></li>
              <li><Link href="/privacy" className={linkClass}>Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col-reverse items-start gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-ink-3">© {year} Bills in Congress · Public-domain government data</p>
          <ModeToggle />
        </div>
      </div>
    </footer>
  );
}
