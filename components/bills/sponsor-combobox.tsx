'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { billsService, type SponsorOption } from '@/lib/services/bills-service';

export function SponsorCombobox({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [allSponsors, setAllSponsors] = useState<SponsorOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await billsService.fetchAllSponsors();
        if (!cancelled) setAllSponsors(rows);
      } catch {
        // swallow — empty dropdown is already the fallback
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [isOpen]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = allSponsors.filter((s) => !selectedSet.has(s.name));
    if (!q) return base;
    const tokens = q.split(/\s+/).filter(Boolean);
    return base.filter((s) => {
      const haystack = `${s.name} ${s.party ?? ''} ${s.state ?? ''}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [allSponsors, selectedSet, query]);

  // Keep highlight in range as the filtered list changes.
  useEffect(() => {
    setHighlight((h) => {
      if (matches.length === 0) return 0;
      return Math.min(h, matches.length - 1);
    });
  }, [matches.length]);

  const addSponsor = (name: string) => {
    if (selectedSet.has(name)) return;
    onChange([...value, name]);
    setQuery('');
    setHighlight(0);
    // Stay open so the user can add more; re-focus input.
    inputRef.current?.focus();
  };

  const removeSponsor = (name: string) => {
    onChange(value.filter((n) => n !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setHighlight((h) => Math.min(matches.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      if (!isOpen) return;
      e.preventDefault();
      const target = matches[highlight];
      if (target) addSponsor(target.name);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
      // Quick-remove the last tag when the input is empty.
      removeSponsor(value[value.length - 1]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        placeholder={
          isLoading
            ? 'Loading sponsors…'
            : value.length > 0
              ? 'Add another sponsor'
              : "Member's name"
        }
        value={query}
        disabled={isLoading && allSponsors.length === 0}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />

      {isOpen && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-y-auto rounded-sm border border-border bg-popover text-popover-foreground shadow-sm"
          role="listbox"
        >
          {matches.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-muted-foreground">
              {isLoading ? 'Loading…' : 'No sponsors match.'}
            </div>
          ) : (
            matches.map((s, i) => {
              const meta = [s.party, s.state].filter(Boolean).join(' · ');
              return (
                <button
                  key={s.name}
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => addSponsor(s.name)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                    i === highlight ? 'bg-secondary' : 'bg-transparent'
                  )}
                >
                  <span className="min-w-0 truncate">
                    <span className="text-foreground">{s.name}</span>
                    {meta && (
                      <span className="ml-2 text-xs text-muted-foreground">{meta}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">
                    {s.billCount.toLocaleString()}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {value.map((name) => (
            <li key={name}>
              <span className="inline-flex max-w-full items-center gap-1 rounded-sm border border-border bg-secondary/60 py-0.5 pl-2 pr-1 text-xs text-foreground">
                <span className="truncate">{name}</span>
                <button
                  type="button"
                  onClick={() => removeSponsor(name)}
                  aria-label={`Remove ${name}`}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
