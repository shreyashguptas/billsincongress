'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { cn, formatCount } from '@/lib/utils';
import { searchOptions } from '@/lib/option-search';
import { analytics } from '@/lib/analytics';
import type { FilterOption } from '@/lib/bills/filter-registry';
import { SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { SurfaceMode } from '@/hooks/use-surface-mode';

/** Lists shorter than this are faster to scan than to search. */
const SEARCHABLE_THRESHOLD = 8;
/** Rows rendered at once. 778 sponsors in the DOM is a scroll-performance bug. */
const ROW_CAP = 100;

export interface OptionListProps {
  /** Analytics `filter_kind`. */
  kind: string;
  /** Human name, used as the picker heading and the listbox's accessible name. */
  title: string;
  /** One plain-English sentence under the heading. */
  helper: string;
  options: FilterOption[];
  /** Current value: a string for single-select, an array for multi. */
  value: string | string[];
  multi: boolean;
  onChange: (next: string | string[]) => void;
  /** Which shell is hosting this. Only affects sizing and the close behaviour. */
  layout: SurfaceMode;
  close: () => void;
  /** Set when the option list could not be loaded at all. */
  error?: string | null;
  onRetry?: () => void;
  loading?: boolean;
  /** Rendered under the list — used for the "read the guide" hub link. */
  footer?: React.ReactNode;
}

/**
 * The body of every filter picker, written once and rendered by both shells.
 *
 * The accessibility model is deliberate. Rows are `role="option"` divs rather
 * than buttons, and the listbox owns a single `aria-activedescendant`: with 778
 * sponsors, focusable rows would put 778 stops in the tab order, and a
 * focusable `<a>` inside a `role="option"` is invalid besides. Keyboard
 * movement therefore moves a marker, not focus, which is what a listbox is
 * supposed to do.
 *
 * What this replaces: seven `opacity-0` native `<select>` elements stretched
 * over styled divs. Those gave an unstyleable OS menu, no visible focus ring,
 * no search in a 33- or 51-row list, and a value that was legible only while
 * the OS menu was open.
 */
export function OptionList({
  kind,
  title,
  helper,
  options,
  value,
  multi,
  onChange,
  layout,
  close,
  error,
  onRetry,
  loading,
  footer,
}: OptionListProps) {
  const listboxId = useId();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchable = options.length > SEARCHABLE_THRESHOLD;

  const selected = useMemo(
    () => new Set(Array.isArray(value) ? value : value === 'all' ? [] : [value]),
    [value]
  );

  const { items, total, truncated } = useMemo(
    () =>
      searchOptions(options, query, {
        keyOf: (o) => `${o.label} ${o.group ?? ''}`,
        idOf: (o) => o.value,
        limit: ROW_CAP,
      }),
    [options, query]
  );

  /**
   * Take focus into the picker on open.
   *
   * The shell deliberately does not do this for us. On a pointer device focus
   * goes to the search field if there is one, so you can type immediately. On
   * touch it goes to the LIST rather than the field, because focusing a text
   * input summons the on-screen keyboard, and a bottom sheet whose height is
   * measured in dvh does not shrink to make room for it — half the options
   * would be behind the keyboard before the reader had typed anything.
   *
   * Focusing the list also matters for short, unsearchable pickers: without it
   * focus stays on the trigger, the listbox's key handler never fires, and
   * Arrow Down does nothing at all.
   */
  useEffect(() => {
    if (searchable && layout === 'pointer') searchRef.current?.focus();
    else listRef.current?.focus();
    // Run once per open. The picker is unmounted when closed, so mount is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker inside the list as it shrinks under a query.
  useEffect(() => {
    setActiveIndex((i) => (items.length === 0 ? 0 : Math.min(i, items.length - 1)));
  }, [items.length]);

  // Scroll the marked row into view. Without this the highlight silently walks
  // off the bottom of a 288px popover after about seven key presses.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // One event per settled query, not per keystroke.
  const settled = useRef<string>('');
  useEffect(() => {
    if (!searchable) return;
    const q = query.trim();
    if (q === settled.current) return;
    const timer = setTimeout(() => {
      settled.current = q;
      if (q !== '') {
        analytics.billsFilterSearchUsed({
          filter_kind: kind,
          query_length: q.length,
          result_count: total,
          selected: false,
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, searchable, kind, total]);

  const commit = (option: FilterOption) => {
    if (multi) {
      const next = selected.has(option.value)
        ? (Array.isArray(value) ? value : []).filter((v) => v !== option.value)
        : [...(Array.isArray(value) ? value : []), option.value];
      onChange(next);
      // Stay open: picking several sponsors is the point of a multi-select.
      return;
    }
    onChange(option.value);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(Math.max(0, items.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = items[activeIndex];
      if (option) commit(option);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Backspace' && multi && query === '') {
      const current = Array.isArray(value) ? value : [];
      if (current.length > 0) onChange(current.slice(0, -1));
    }
  };

  const hasValue = Array.isArray(value) ? value.length > 0 : value !== 'all' && value !== '';

  /*
   * The bottom sheet is a Radix Dialog, and a dialog has to be NAMED — an
   * `aria-label` on the content does not satisfy it, so a screen-reader user
   * opening a picker on a phone was landing in an unnamed dialog. Rendering the
   * visible heading AS the dialog title (rather than adding a hidden second
   * copy) gives it a name without saying everything twice.
   *
   * Conditional on the shell: Dialog.Title outside a Dialog root throws, and a
   * popover neither needs nor can host one.
   */
  const Heading = layout === 'touch' ? SheetTitle : 'p';
  const Helper = layout === 'touch' ? SheetDescription : 'p';
  const activeId = items[activeIndex] ? `${listboxId}-${activeIndex}` : undefined;

  let lastGroup: string | undefined;

  return (
    <>
      {/* Grab handle — touch only. A sheet with no handle reads as stuck. */}
      {layout === 'touch' && (
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" aria-hidden="true" />
      )}

      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-3">
        <div className="min-w-0">
          <Heading className="font-serif text-base font-semibold tracking-tight text-foreground">
            {title}
          </Heading>
          <Helper className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {helper}
          </Helper>
        </div>
        {hasValue && (
          <button
            type="button"
            onClick={() => {
              onChange(multi ? [] : 'all');
              if (!multi) close();
            }}
            className="shrink-0 text-xs font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {searchable && (
        <div className="relative shrink-0 border-b border-border px-4 py-2">
          <label htmlFor={searchId} className="sr-only">
            Search {title.toLowerCase()}
          </label>
          <Search
            className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            id={searchId}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Search ${title.toLowerCase()}…`}
            className="h-9 w-full rounded-sm border border-control bg-card pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground/10 touchable:h-11 touchable:text-base"
          />
        </div>
      )}

      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={title}
        aria-multiselectable={multi || undefined}
        // Also on the listbox, not only on the search field: whichever of the
        // two holds focus is the element a screen reader reads the highlighted
        // row from, and on touch that is always this one.
        aria-activedescendant={activeId}
        // Always focusable and always handling keys: on touch the list takes
        // focus even when a search field exists, so it has to be operable.
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain focus:outline-none"
      >
        {loading && (
          <p className="px-4 py-3 text-sm text-muted-foreground">Loading…</p>
        )}

        {error && (
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-1.5 text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Nothing matches “{query}”.
          </p>
        )}

        {items.map((option, i) => {
          const isSelected = selected.has(option.value);
          const heading = option.group && option.group !== lastGroup ? option.group : null;
          if (option.group) lastGroup = option.group;
          return (
            <div key={option.value}>
              {heading && (
                <p className="label-eyebrow !mb-0 px-4 pb-1 pt-3 text-muted-foreground">
                  {heading}
                </p>
              )}
              <div
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={isSelected}
                data-active={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(option)}
                className={cn(
                  'flex h-10 cursor-pointer items-center gap-2 px-4 text-sm transition-colors touchable:h-12',
                  i === activeIndex ? 'bg-secondary' : 'bg-transparent',
                  isSelected ? 'font-medium text-foreground' : 'text-foreground'
                )}
              >
                <Check
                  className={cn('h-4 w-4 shrink-0', isSelected ? 'visible' : 'invisible')}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.count !== undefined && (
                  <span className="shrink-0 font-mono text-xs tabular text-muted-foreground">
                    {formatCount(option.count)}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {truncated && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Showing the first{' '}
            <span className="font-mono tabular">{formatCount(items.length)}</span> of{' '}
            <span className="font-mono tabular">{formatCount(total)}</span> — keep typing
            to narrow.
          </p>
        )}
      </div>

      {/* A query that narrows 900 rows to 0 is otherwise silent. */}
      <p aria-live="polite" className="sr-only">
        {query.trim() === '' ? '' : `${total} ${total === 1 ? 'match' : 'matches'}`}
      </p>

      {multi && Array.isArray(value) && value.length > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            <span className="font-mono tabular text-foreground">{value.length}</span>{' '}
            selected
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Clear
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-sm border border-control bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/40"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {footer}
    </>
  );
}
