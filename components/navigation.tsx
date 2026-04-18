'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, X } from 'lucide-react';
import { routes } from '@/lib/constants/routes';

export function Navigation() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {/* Eyebrow strip — date + tagline (newspaper convention) */}
      <div className="hidden md:block border-b border-border/60">
        <div className="container-editorial flex h-7 items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>{today}</span>
          <span className="font-medium">An independent record of the U.S. Congress</span>
        </div>
      </div>

      <div className="container-editorial flex h-14 sm:h-16 items-center justify-between gap-4">
        {/* Mobile menu */}
        <div className="flex md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[88%] max-w-sm border-r border-border bg-background p-0">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <span className="font-serif text-lg font-semibold tracking-tight">
                  Bills in Congress
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="flex flex-col px-2 py-4">
                {routes.map((route) => {
                  const active = pathname === route.href;
                  return (
                    <Link
                      key={route.href}
                      href={route.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center justify-between rounded-sm px-3 py-3 text-base font-sans border-l-2 border-transparent',
                        active
                          ? 'border-l-accent text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      )}
                    >
                      {route.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* Masthead title */}
        <Link
          href="/"
          className="flex items-baseline gap-2 group"
          aria-label="Bills in Congress — Home"
        >
          <span className="font-serif text-xl sm:text-2xl font-semibold tracking-tight text-foreground leading-none">
            Bills<span className="text-accent">.</span>Congress
          </span>
          <span className="hidden lg:inline label-eyebrow">
            Tracker
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {routes.map((route) => {
            const active = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  'relative px-3 py-2 font-medium transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {route.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-px bg-foreground" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
