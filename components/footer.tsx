import { ModeToggle } from '@/components/theme/mode-toggle';
import { Github } from 'lucide-react';
import Link from 'next/link';
import { hubsOfKind } from '@/lib/hubs';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="container-editorial py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2 space-y-3">
            <p className="font-serif text-xl font-semibold tracking-tight">
              Bills<span className="text-accent">.</span>Congress
            </p>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              An independent record of legislation in the United States Congress.
              Sourced directly from the public Congress.gov API. Not affiliated
              with the U.S. government.
            </p>
          </div>

          <div>
            <p className="label-eyebrow mb-3">Browse</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/" className="text-muted-foreground hover:text-foreground">Home</Link></li>
              <li><Link href="/bills" className="text-muted-foreground hover:text-foreground">All bills</Link></li>
              <li><Link href="/learn" className="text-muted-foreground hover:text-foreground">How Congress works</Link></li>
              <li><Link href="/about" className="text-muted-foreground hover:text-foreground">About</Link></li>
            </ul>
            {/* Chamber and status hubs live in the footer so they are reachable
                from every page — including the homepage, which is the only page
                Google currently indexes. The full set, topics included, is on
                /bills. */}
            <p className="label-eyebrow mb-3 mt-6">By chamber &amp; stage</p>
            <ul className="space-y-2 text-sm">
              {[...hubsOfKind('chamber'), ...hubsOfKind('status')].map((hub) => (
                <li key={hub.path}>
                  <Link href={hub.path} className="text-muted-foreground hover:text-foreground">
                    {hub.heading}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label-eyebrow mb-3">Project</p>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://github.com/shreyashguptas/billsincongress"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Github className="h-3.5 w-3.5" />
                  Source on GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://api.congress.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Data: Congress.gov
                </a>
              </li>
              <li><Link href="/terms" className="text-muted-foreground hover:text-foreground">Terms of Service</Link></li>
              <li><Link href="/privacy" className="text-muted-foreground hover:text-foreground">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col-reverse gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground tabular">
            © {year} Bills.Congress · Public-domain government data
          </p>
          <ModeToggle />
        </div>
      </div>
    </footer>
  );
}
