'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { billsService, type SponsorOption } from '@/lib/services/bills-service';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

const POLICY_AREAS = [
  'Agriculture and Food', 'Animals', 'Armed Forces and National Security',
  'Arts, Culture, Religion', 'Civil Rights and Liberties, Minority Issues',
  'Commerce', 'Congress', 'Crime and Law Enforcement',
  'Economics and Public Finance', 'Education', 'Emergency Management',
  'Energy', 'Environmental Protection', 'Families',
  'Finance and Financial Sector', 'Foreign Trade and International Finance',
  'Government Operations and Politics', 'Health',
  'Housing and Community Development', 'Immigration', 'International Affairs',
  'Labor and Employment', 'Law', 'Native Americans', 'Private Legislation',
  'Public Lands and Natural Resources', 'Science, Technology, Communications',
  'Social Sciences and History', 'Social Welfare', 'Sports and Recreation',
  'Taxation', 'Transportation and Public Works', 'Water Resources Development',
];

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

const BILL_TYPE_NAMES: Record<string, string> = {
  hr: 'House Bill',
  hres: 'House Resolution',
  hjres: 'House Joint Resolution',
  hconres: 'House Concurrent Resolution',
  s: 'Senate Bill',
  sres: 'Senate Resolution',
  sjres: 'Senate Joint Resolution',
  sconres: 'Senate Concurrent Resolution',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: '20',  label: 'Introduced' },
  { value: '40',  label: 'In committee' },
  { value: '60',  label: 'Passed one chamber' },
  { value: '80',  label: 'Passed both chambers' },
  { value: '90',  label: 'To President' },
  { value: '95',  label: 'Signed by President' },
  { value: '100', label: 'Became law' },
];

const DATE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'week', label: 'Last week' },
  { value: 'month', label: 'Last month' },
  { value: '3months', label: 'Last 3 months' },
  { value: '6months', label: 'Last 6 months' },
  { value: 'year', label: 'Last year' },
];

interface BillsFilterProps {
  statusFilter: string;
  introducedDateFilter: string;
  lastActionDateFilter: string;
  sponsorFilter: string[];
  titleFilter: string;
  stateFilter: string;
  policyAreaFilter: string;
  billTypeFilter: string;
  billNumberFilter: string;
  congressFilter: string;
  onStatusChange: (v: string) => void;
  onIntroducedDateChange: (v: string) => void;
  onLastActionDateChange: (v: string) => void;
  onSponsorChange: (v: string[]) => void;
  onTitleChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onPolicyAreaChange: (v: string) => void;
  onBillTypeChange: (v: string) => void;
  onBillNumberChange: (v: string) => void;
  onCongressChange: (v: string) => void;
  onClearAllFilters: () => void;
  isMobile: boolean;
}

function FilterField({
  label,
  active,
  children,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
        {active && <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />}
      </label>
      {children}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="font-serif text-base font-semibold tracking-tight border-b border-border pb-1.5">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/**
 * Typeahead multi-select for bill sponsors.
 *
 * Loads the full list of distinct sponsors once (deduped across congresses in
 * the `listAllSponsors` Convex query). The input is a plain text field that
 * filters the dropdown by case-insensitive substring on name / state / party.
 * Selections are rendered as removable tags beneath the input so the user can
 * see exactly who's active without re-opening the dropdown.
 */
function SponsorCombobox({
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

function BillsFilter({
  statusFilter,
  introducedDateFilter,
  lastActionDateFilter,
  sponsorFilter,
  titleFilter,
  stateFilter,
  policyAreaFilter,
  billTypeFilter,
  billNumberFilter,
  congressFilter,
  onStatusChange,
  onIntroducedDateChange,
  onLastActionDateChange,
  onSponsorChange,
  onTitleChange,
  onStateChange,
  onPolicyAreaChange,
  onBillTypeChange,
  onBillNumberChange,
  onCongressChange,
  onClearAllFilters,
  isMobile,
}: BillsFilterProps) {
  const handleBillNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      onBillNumberChange(value);
    }
  };

  const [availableCongressNumbers, setAvailableCongressNumbers] = useState<number[]>([]);

  useEffect(() => {
    const fetchCongressNumbers = async () => {
      try {
        const numbers = await billsService.getAvailableCongressNumbers();
        setAvailableCongressNumbers(numbers);
      } catch (e) {
        console.error('Error fetching congress numbers:', e);
      }
    };
    fetchCongressNumbers();
  }, []);

  const isActive = (v: string | null | undefined, def: string) => {
    if (v === null || v === undefined) return false;
    return v !== def && v !== '';
  };

  const anyActive =
    isActive(titleFilter, '') ||
    sponsorFilter.length > 0 ||
    isActive(billNumberFilter, '') ||
    isActive(congressFilter, 'all') ||
    isActive(billTypeFilter, 'all') ||
    isActive(statusFilter, 'all') ||
    isActive(stateFilter, 'all') ||
    isActive(policyAreaFilter, 'all') ||
    isActive(introducedDateFilter, 'all') ||
    isActive(lastActionDateFilter, 'all');

  const sheetMaxHeight = isMobile ? 'max-h-[40vh]' : '';

  return (
    <div className="space-y-7">
      {/* Header — only on desktop. Mobile sheet has its own header. */}
      {!isMobile && (
        <div className="flex items-baseline justify-between border-b border-border pb-2">
          <p className="font-serif text-lg font-semibold tracking-tight">Filter</p>
          <button
            onClick={onClearAllFilters}
            className={cn(
              'text-xs font-medium underline underline-offset-4 decoration-border transition-colors',
              anyActive
                ? 'text-foreground hover:decoration-foreground'
                : 'text-muted-foreground/50 pointer-events-none'
            )}
            aria-disabled={!anyActive}
          >
            Clear all
          </button>
        </div>
      )}

      <FilterGroup title="Search">
        <FilterField label="Title" active={isActive(titleFilter, '')}>
          <Input
            type="text"
            placeholder="e.g. infrastructure"
            value={titleFilter}
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </FilterField>

        <FilterField label="Sponsor" active={sponsorFilter.length > 0}>
          <SponsorCombobox value={sponsorFilter} onChange={onSponsorChange} />
        </FilterField>

        <FilterField label="Bill number" active={isActive(billNumberFilter, '')}>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 1234"
            value={billNumberFilter}
            onChange={handleBillNumberChange}
          />
        </FilterField>
      </FilterGroup>

      <FilterGroup title="Identification">
        <FilterField label="Congress" active={isActive(congressFilter, 'all')}>
          <Select value={congressFilter} onValueChange={onCongressChange}>
            <SelectTrigger>
              <SelectValue placeholder="All Congresses" />
            </SelectTrigger>
            <SelectContent className={sheetMaxHeight}>
              <SelectItem value="all">All Congresses</SelectItem>
              {availableCongressNumbers.map((c) => (
                <SelectItem key={c} value={c.toString()}>
                  {c}th Congress
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Bill type" active={isActive(billTypeFilter, 'all')}>
          <Select value={billTypeFilter} onValueChange={onBillTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="All bill types" />
            </SelectTrigger>
            <SelectContent className={sheetMaxHeight}>
              <SelectItem value="all">All bill types</SelectItem>
              {Object.entries(BILL_TYPE_NAMES).map(([type, name]) => (
                <SelectItem key={type} value={type}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Status" active={isActive(statusFilter, 'all')}>
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className={sheetMaxHeight}>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterGroup>

      <FilterGroup title="Subject">
        <FilterField label="Sponsor state" active={isActive(stateFilter, 'all')}>
          <Select value={stateFilter} onValueChange={onStateChange}>
            <SelectTrigger>
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent className={sheetMaxHeight}>
              <SelectItem value="all">All states</SelectItem>
              {Object.entries(STATE_NAMES).map(([abbr, name]) => (
                <SelectItem key={abbr} value={abbr}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Policy area" active={isActive(policyAreaFilter, 'all')}>
          <Select value={policyAreaFilter} onValueChange={onPolicyAreaChange}>
            <SelectTrigger>
              <SelectValue placeholder="All policy areas" />
            </SelectTrigger>
            <SelectContent className={sheetMaxHeight}>
              <SelectItem value="all">All policy areas</SelectItem>
              {POLICY_AREAS.map((area) => (
                <SelectItem key={area} value={area}>{area}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterGroup>

      <FilterGroup title="Dates">
        <FilterField label="Introduced" active={isActive(introducedDateFilter, 'all')}>
          <Select value={introducedDateFilter} onValueChange={onIntroducedDateChange}>
            <SelectTrigger>
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent className={sheetMaxHeight}>
              {DATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Last action" active={isActive(lastActionDateFilter, 'all')}>
          <Select value={lastActionDateFilter} onValueChange={onLastActionDateChange}>
            <SelectTrigger>
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent className={sheetMaxHeight}>
              {DATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterGroup>

      {isMobile && (
        <button
          onClick={onClearAllFilters}
          className={cn(
            'text-sm font-medium underline underline-offset-4 decoration-border',
            anyActive ? 'text-foreground' : 'text-muted-foreground/50 pointer-events-none'
          )}
          aria-disabled={!anyActive}
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

export default dynamic(() => Promise.resolve(BillsFilter), { ssr: false });
