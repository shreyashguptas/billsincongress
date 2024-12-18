import { ModeToggle } from '@/components/theme/mode-toggle';
import { Github } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4">
        <div className="flex h-24 flex-col items-center justify-between gap-4 md:flex-row md:gap-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Built with transparency and accountability in mind.{' '}
              <Link
                href="/about"
                className="font-medium underline underline-offset-4"
              >
                Learn more
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/shreyashguptas/billsincongress"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <Github className="h-5 w-5" />
              <span className="sr-only">GitHub repository</span>
            </Link>
            <div className="h-4 w-[1px] bg-border" />
            <ModeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}