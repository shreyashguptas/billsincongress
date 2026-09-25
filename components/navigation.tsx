'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { routes } from '@/lib/constants/routes';
import { UserMenu } from '@/components/auth/user-menu';
import { Logo } from '@/components/brand/logo';

/**
 * The site header: logo, the four sections, a bill search and the account
 * slot. One row, h-14 / sm:h-16 plus its border — lib/ask-panel.ts mirrors
 * those heights (HEADER_H_PX) because the ask sheet sits directly beneath it,
 * and lib/ask-css-contract.test.ts reads the classes back off this file.
 */
export function Navigation() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="container-editorial grid h-14 sm:h-16 grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-1">
          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" hideClose className="w-[88%] max-w-sm border-r border-line p-0">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <Logo />
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav aria-label="Main" className="flex flex-col px-2 py-3">
                {routes.map((route) => (
                  <Link
                    key={route.href}
                    href={route.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(route.href) ? 'page' : undefined}
                    className={cn(
                      'focus-ring flex min-h-11 items-center rounded-md px-3 text-base',
                      isActive(route.href) ? 'bg-sunken font-medium text-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink',
                    )}
                  >
                    {route.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          <Logo className="hidden md:inline-flex" />
        </div>

        {/* Centre: the logo on phones, the sections from md up. */}
        <Logo className="md:hidden" />
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {routes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              aria-current={isActive(route.href) ? 'page' : undefined}
              className={cn(
                'focus-ring relative rounded-sm py-2 text-[15px] font-medium transition-colors',
                isActive(route.href) ? 'text-ink' : 'text-ink-2 hover:text-ink',
              )}
            >
              {route.label}
              {isActive(route.href) && (
                <span aria-hidden="true" className="absolute inset-x-0 -bottom-[13px] h-0.5 bg-ink sm:-bottom-[17px]" />
              )}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-1 sm:gap-2">
          <HeaderSearch />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

/**
 * Search from anywhere. A full field from lg up; an icon that opens /bills
 * below that, where the search box is the first thing on the page. Submitting
 * lands on /bills?title=…, the same URL the bills page's own search writes.
 */
function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    analytics.headerSearchSubmitted(q.length);
    router.push(q ? `/bills?title=${encodeURIComponent(q)}` : '/bills');
    setQuery('');
  }

  return (
    <>
      <form role="search" onSubmit={onSubmit} className="relative hidden lg:block">
        <label htmlFor="header-search" className="sr-only">
          Search bills
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <Input
          id="header-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bills, or S. 2878"
          className="w-64 pl-9 text-sm xl:w-72"
        />
      </form>
      <Button asChild variant="ghost" size="icon" className="lg:hidden">
        <Link href="/bills" aria-label="Search bills">
          <Search className="h-5 w-5" />
        </Link>
      </Button>
    </>
  );
}
