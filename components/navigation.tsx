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
        <SectionTabs isActive={isActive} />

        <div className="flex items-center justify-end gap-1 sm:gap-2">
          <HeaderSearch />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

/**
 * The four sections from md up, with one ink rule that belongs to the nav
 * rather than to any link. It rests under the current section, glides to
 * whichever one the pointer or keyboard is on, and returns when it leaves —
 * so the reader always sees where they are and where a click would take them.
 *
 * The rule is measured, not guessed: its width is the label's own width and it
 * sits just under the text, not on the header's bottom border. On first paint
 * it grows out from the centre of the current label; it only ever slides once
 * it is already showing, so it never sweeps in from the left edge. The whole
 * nav is the hover region, so crossing the gap between two labels does not
 * send it home and back.
 */
function SectionTabs({ isActive }: { isActive: (href: string) => boolean }) {
  const pathname = usePathname();
  const navRef = React.useRef<HTMLElement>(null);
  const labelRefs = React.useRef<Record<string, HTMLSpanElement | null>>({});
  const [boxes, setBoxes] = React.useState<Record<string, { left: number; width: number }>>({});
  const [hovered, setHovered] = React.useState<string | null>(null);
  // A click holds the rule on its target until the new page's pathname lands,
  // even if the pointer has already left the nav.
  const [pending, setPending] = React.useState<string | null>(null);
  // Whether the rule is at full width. It starts collapsed so the first
  // appearance is a grow from the centre, and collapses again whenever there is
  // no section to mark, so the next appearance grows in place rather than
  // sliding over from wherever it was last.
  const [grown, setGrown] = React.useState(false);

  React.useEffect(() => setPending(null), [pathname]);

  React.useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const origin = nav.getBoundingClientRect().left;
      const next: Record<string, { left: number; width: number }> = {};
      for (const route of routes) {
        const el = labelRefs.current[route.href];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next[route.href] = { left: r.left - origin, width: r.width };
      }
      setBoxes(next);
    };
    measure();
    // Labels change width when the web font swaps in and when the nav appears
    // at md; both show up as a resize of the nav.
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, []);

  const active = routes.find((r) => isActive(r.href))?.href ?? null;
  const target = hovered ?? pending ?? active;
  const box = target ? boxes[target] : undefined;
  const visible = Boolean(box);

  React.useEffect(() => {
    if (!visible) {
      setGrown(false);
      return;
    }
    // Two frames: one to paint the collapsed rule at its new place with no
    // transition, one to let it grow.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setGrown(true));
    });
    return () => cancelAnimationFrame(id);
  }, [visible]);

  // Where the rule last was, so leaving for a page with no section (/pro,
  // /account) shrinks it into its own centre instead of jumping.
  const [rest, setRest] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (box) setRest(target);
  }, [box, target]);
  const drawn = box ?? (rest ? boxes[rest] : undefined);
  // Only a collapsed rule that is about to appear moves without a transition.
  const animate = grown || !visible;

  return (
    <nav
      ref={navRef}
      aria-label="Main"
      onMouseLeave={() => setHovered(null)}
      className="relative hidden items-center gap-2 md:flex"
    >
      {routes.map((route) => {
        const current = route.href === active;
        return (
          <Link
            key={route.href}
            href={route.href}
            aria-current={current ? 'page' : undefined}
            onMouseEnter={() => setHovered(route.href)}
            onFocus={() => setHovered(route.href)}
            onBlur={() => setHovered(null)}
            onClick={(e) => {
              // A modified click opens a new tab or window; this tab stays put,
              // so holding the rule on the target would strand it there.
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              setPending(route.href);
            }}
            className={cn(
              'focus-ring rounded-sm px-3 py-2.5 text-[15px] font-medium transition-colors duration-200',
              current || route.href === target ? 'text-ink' : 'text-ink-2',
            )}
          >
            <span
              ref={(el) => {
                labelRefs.current[route.href] = el;
              }}
            >
              {route.label}
            </span>
          </Link>
        );
      })}
      {drawn && (
        <span
          aria-hidden="true"
          className={cn(
            // 50% + 10px is about 5px under the labels' baseline (none of the four has a descender).
            'pointer-events-none absolute left-0 top-[calc(50%+10px)] h-0.5 rounded-full bg-ink',
            animate &&
              'transition-[transform,width] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          )}
          style={{
            width: drawn.width,
            transform: `translateX(${drawn.left}px) scaleX(${visible && grown ? 1 : 0})`,
          }}
        />
      )}
    </nav>
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
