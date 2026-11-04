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
import { MAX_SEARCH_TEXT_LENGTH } from '@/lib/bill-query';
import { UserMenu } from '@/components/auth/user-menu';
import { Logo } from '@/components/brand/logo';
import { LengthLimitNote, useLengthLimit } from '@/components/brand/length-limit';
import { FeedbackDialog, HeaderFeedback, useFeedbackBox } from '@/components/feedback/feedback-box';
import { HeaderAsk } from '@/components/answers/header-ask';

/**
 * The site header: logo, the four sections, a bill search and the account
 * slot. One row, h-14 / sm:h-16 plus its border — lib/ask-panel.ts mirrors
 * those heights (HEADER_H_PX) because the ask sheet sits directly beneath it,
 * and lib/ask-css-contract.test.ts reads the classes back off this file.
 *
 * Its md / lg / xl are the header's own width, not the window's: `header-md:`,
 * `header-lg:` and `header-xl:` (tailwind.config.ts) are container queries on
 * this element. The docked ask panel takes up to 640px off the right, so on a
 * 1440px screen the header can be 1024px wide while `xl:` still sees 1440 —
 * which laid out the 288px search field and pushed "Sign up" under the panel.
 * Heights stay on `sm:` because `--header-h` in globals.css is a media query.
 *
 * It is sticky except in a window under 500px tall (`short:`), where a pinned
 * header would take a quarter of the screen or more: there it scrolls away
 * with the page, and Ask, which lives in it at that size, goes with it.
 */
export function Navigation() {
  const [open, setOpen] = React.useState(false);
  const feedback = useFeedbackBox('menu');
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    // Solid paper, not translucent: a see-through header turned muddy grey over
    // the home page's dark stage, and its backdrop blur was repainted on every
    // scroll frame.
    <header className="sticky top-0 z-40 w-full short:relative border-b border-line bg-paper [container-name:site-header] [container-type:inline-size]">
      {/*
        Phones: menu, logo beside it, then search and account at the far edge —
        auto | minmax(0,1fr) | auto, so nothing can push the row past the screen.
        A centred logo needs two equal side columns, and the account side (search
        plus "Sign up") is three times the menu button, so below ~470px it could
        never actually be centred and overflowed at 320. From header-md the
        sections take the centre and the two sides are equal again.
      */}
      <div className="container-editorial grid h-14 sm:h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 header-md:grid-cols-[1fr_auto_1fr] header-md:gap-4">
        <div className="flex items-center gap-1">
          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 header-md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" hideClose className="flex w-[88%] max-w-sm flex-col gap-0 border-r border-line p-0">
              {/*
                The same row as the header it covers — same height, same padding,
                the close button exactly where the menu button was and the logo
                where it was — so opening the menu changes the icon and nothing
                else moves. It is also the handle a mouse drags the menu closed by.
              */}
              <div
                data-sheet-grab=""
                className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 sm:h-16 sm:px-6"
              >
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </Button>
                <Logo />
              </div>
              <nav aria-label="Main" className="flex flex-col px-2 py-3">
                {routes.map((route, i) => (
                  <Link
                    key={route.href}
                    href={route.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(route.href) ? 'page' : undefined}
                    style={{ animationDelay: `${60 + i * 30}ms` }}
                    className={cn(
                      'menu-item-in focus-ring flex min-h-11 items-center rounded-md px-3 text-base',
                      isActive(route.href) ? 'bg-sunken font-medium text-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink',
                    )}
                  >
                    {route.label}
                  </Link>
                ))}
              </nav>
              {/* Phones have no room for the header's Feedback button, so it lives here. */}
              <div className="menu-item-in mx-2 border-t border-line px-0 pt-3" style={{ animationDelay: `${60 + routes.length * 30}ms` }}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    feedback.setOpen(true);
                  }}
                  className="focus-ring flex min-h-11 w-full items-center rounded-md px-3 text-left text-base text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  Send feedback
                </button>
              </div>
            </SheetContent>
          </Sheet>
          <FeedbackDialog box={feedback} />
          <Logo className="hidden header-md:inline-flex" />
        </div>

        {/* Beside the menu on phones; the sections take the centre from md up. */}
        <Logo fit className="min-w-0 justify-self-start header-md:hidden" />
        <SectionTabs isActive={isActive} />

        <div className="flex items-center justify-end gap-1 sm:gap-2 header-lg:gap-3">
          <HeaderFeedback className="hidden header-lg:inline-flex" />
          {/* Phones, tablets and short windows; the corner pill everywhere else. */}
          <HeaderAsk />
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
      className="relative hidden items-center gap-2 header-md:flex"
    >
      {routes.map((route) => {
        const current = route.href === active;
        return (
          <Link
            key={route.href}
            href={route.href}
            aria-current={current ? 'page' : undefined}
            // Pointer, mouse only: a tap also fires mouseenter, which would park
            // the rule on the tapped tab before the page has even changed.
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') setHovered(route.href);
            }}
            onFocus={() => setHovered(route.href)}
            onBlur={() => setHovered(null)}
            onClick={(e) => {
              // A modified click opens a new tab or window; this tab stays put,
              // so holding the rule on the target would strand it there.
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              setPending(route.href);
            }}
            className={cn(
              'focus-ring rounded-sm px-3 py-2.5 text-ui font-medium transition-colors duration-200 touchable:py-3',
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
              'transition-[transform,width] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
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
 * Search from anywhere. A full field from a header-lg width up; an icon that
 * opens /bills below that, where the search box is the first thing on the page. Submitting
 * lands on /bills?title=…, the same URL the bills page's own search writes.
 */
function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const noteId = React.useId();
  const { limit, nudging, onNudgeEnd } = useLengthLimit(MAX_SEARCH_TEXT_LENGTH, 'header_search');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    analytics.headerSearchSubmitted(q.length);
    router.push(q ? `/bills?title=${encodeURIComponent(q)}` : '/bills');
    setQuery('');
  }

  return (
    <>
      <form
        role="search"
        onSubmit={onSubmit}
        onAnimationEnd={onNudgeEnd}
        className={cn('relative hidden header-lg:block', nudging && 'animate-nudge')}
      >
        <label htmlFor="header-search" className="sr-only">
          Search bills
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <Input
          id="header-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(limit(e, query))}
          aria-describedby={noteId}
          placeholder="Search bills, or S. 2878"
          className="w-52 pl-9 text-sm header-xl:w-72"
        />
        {/* Floats under the box: the header has no room below it. */}
        <LengthLimitNote
          id={noteId}
          length={query.length}
          max={MAX_SEARCH_TEXT_LENGTH}
          className="absolute right-0 top-full z-40 whitespace-nowrap"
          shownClassName="rounded-sm border border-line bg-raised px-2 py-1 shadow-float"
        />
      </form>
      <Button asChild variant="ghost" size="icon" className="header-lg:hidden">
        <Link href="/bills" aria-label="Search bills">
          <Search className="h-5 w-5" />
        </Link>
      </Button>
    </>
  );
}
