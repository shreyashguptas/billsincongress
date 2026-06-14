'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCongressPicker } from '@/lib/congress';
import { billsService } from '@/lib/services/bills-service';
import { SponsorCombobox } from '@/components/bills/sponsor-combobox';
import {
  BILL_TYPES,
  STATUS_OPTIONS,
  DATE_OPTIONS,
  STATE_NAMES,
  POLICY_AREAS,
} from '@/lib/constants/filters';

export interface FilterQuickAccessProps {
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
  filtersActive: boolean;
}

type QuickPillOption = { value: string; label: string };

function QuickSelectPill({
  label,
  value,
  options,
  onChange,
  active,
}: {
  label: string;
  value: string;
  options: QuickPillOption[];
  onChange: (v: string) => void;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors',
        active
          ? 'border-foreground/30 bg-secondary text-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-foreground/30'
      )}
    >
      {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none">{label}</span>
      <span className="pointer-events-none text-[9px] text-muted-foreground">&#9662;</span>
    </div>
  );
}

export function FilterQuickAccess({
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
  filtersActive,
}: FilterQuickAccessProps) {
  const [availableCongressNumbers, setAvailableCongressNumbers] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    billsService
      .getAvailableCongressNumbers()
      .then((numbers) => {
        if (!cancelled) setAvailableCongressNumbers(numbers);
      })
      .catch((e) => {
        console.error('Error fetching congress numbers:', e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = useMemo(
    () => STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter,
    [statusFilter],
  );
  const introducedDateLabel = useMemo(
    () => DATE_OPTIONS.find((o) => o.value === introducedDateFilter)?.label ?? introducedDateFilter,
    [introducedDateFilter],
  );
  const lastActionDateLabel = useMemo(
    () => DATE_OPTIONS.find((o) => o.value === lastActionDateFilter)?.label ?? lastActionDateFilter,
    [lastActionDateFilter],
  );
  const billTypeLabel = useMemo(
    () => BILL_TYPES[billTypeFilter as keyof typeof BILL_TYPES] ?? billTypeFilter,
    [billTypeFilter],
  );
  const congressLabel = useMemo(() => {
    if (congressFilter === 'all') return null;
    const num = Number.parseInt(congressFilter, 10);
    if (Number.isNaN(num)) return congressFilter;
    return formatCongressPicker(num);
  }, [congressFilter]);

  const statusOptions = useMemo<QuickPillOption[]>(
    () => STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );
  const congressOptions = useMemo<QuickPillOption[]>(() => {
    const opts: QuickPillOption[] = [{ value: 'all', label: 'All Congresses' }];
    availableCongressNumbers.forEach((c) => {
      opts.push({ value: c.toString(), label: formatCongressPicker(c) });
    });
    return opts;
  }, [availableCongressNumbers]);
  const policyAreaOptions = useMemo<QuickPillOption[]>(
    () => [{ value: 'all', label: 'All policy areas' }, ...POLICY_AREAS.map((a) => ({ value: a, label: a }))],
    [],
  );
  const stateOptions = useMemo<QuickPillOption[]>(
    () => [{ value: 'all', label: 'All states' }, ...Object.entries(STATE_NAMES).map(([abbr, name]) => ({ value: abbr, label: name }))],
    [],
  );
  const dateOptions = useMemo<QuickPillOption[]>(
    () => DATE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );
  const billTypeOptions = useMemo<QuickPillOption[]>(
    () => [{ value: 'all', label: 'All bill types' }, ...Object.entries(BILL_TYPES).map(([value, label]) => ({ value, label }))],
    [],
  );

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (statusFilter !== 'all') chips.push({ key: 'status', label: statusLabel, onRemove: () => onStatusChange('all') });
    if (congressFilter !== 'all' && congressLabel) chips.push({ key: 'congress', label: congressLabel, onRemove: () => onCongressChange('all') });
    if (billTypeFilter !== 'all') chips.push({ key: 'billType', label: billTypeLabel, onRemove: () => onBillTypeChange('all') });
    if (policyAreaFilter !== 'all') chips.push({ key: 'policyArea', label: policyAreaFilter, onRemove: () => onPolicyAreaChange('all') });
    if (stateFilter !== 'all') chips.push({ key: 'state', label: STATE_NAMES[stateFilter] ?? stateFilter, onRemove: () => onStateChange('all') });
    if (introducedDateFilter !== 'all') chips.push({ key: 'introducedDate', label: introducedDateLabel, onRemove: () => onIntroducedDateChange('all') });
    if (lastActionDateFilter !== 'all') chips.push({ key: 'lastActionDate', label: lastActionDateLabel, onRemove: () => onLastActionDateChange('all') });
    if (titleFilter.trim()) chips.push({ key: 'title', label: titleFilter, onRemove: () => onTitleChange('') });
    if (billNumberFilter.trim()) chips.push({ key: 'billNumber', label: `#${billNumberFilter}`, onRemove: () => onBillNumberChange('') });
    sponsorFilter.forEach((name) => {
      chips.push({ key: `sponsor-${name}`, label: name, onRemove: () => onSponsorChange(sponsorFilter.filter((n) => n !== name)) });
    });
    return chips;
  }, [
    statusFilter, statusLabel, congressFilter, congressLabel, billTypeFilter, billTypeLabel,
    policyAreaFilter, stateFilter, introducedDateFilter, introducedDateLabel,
    lastActionDateFilter, lastActionDateLabel, titleFilter, billNumberFilter, sponsorFilter,
    onStatusChange, onCongressChange, onBillTypeChange, onPolicyAreaChange, onStateChange,
    onIntroducedDateChange, onLastActionDateChange, onTitleChange, onBillNumberChange, onSponsorChange,
  ]);

  const handleBillNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) onBillNumberChange(val);
  };

  return (
    <div>
      {/* Inline text inputs — title, bill number */}
      <div className="flex gap-1.5 mb-2">
        <input
          type="text"
          placeholder="Search title…"
          value={titleFilter}
          onChange={(e) => onTitleChange(e.target.value)}
          className="flex-1 min-w-0 h-7 rounded-sm border border-border bg-card px-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/30"
        />
        <input
          type="text"
          inputMode="numeric"
          placeholder="Bill #"
          value={billNumberFilter}
          onChange={handleBillNumberChange}
          className="w-16 shrink-0 h-7 rounded-sm border border-border bg-card px-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/30"
        />
      </div>

      {/* Sponsor typeahead */}
      <div className="mb-2">
        <SponsorCombobox value={sponsorFilter} onChange={onSponsorChange} />
      </div>

      {/* Dropdown pills — wrap to fit, no horizontal scroll */}
      <div className="flex gap-1.5 flex-wrap pb-1.5">
        <QuickSelectPill label="Status" value={statusFilter} options={statusOptions} onChange={onStatusChange} active={statusFilter !== 'all'} />
        <QuickSelectPill label="Congress" value={congressFilter} options={congressOptions} onChange={onCongressChange} active={congressFilter !== 'all'} />
        <QuickSelectPill label="Policy area" value={policyAreaFilter} options={policyAreaOptions} onChange={onPolicyAreaChange} active={policyAreaFilter !== 'all'} />
        <QuickSelectPill label="State" value={stateFilter} options={stateOptions} onChange={onStateChange} active={stateFilter !== 'all'} />
        <QuickSelectPill label="Introduced" value={introducedDateFilter} options={dateOptions} onChange={onIntroducedDateChange} active={introducedDateFilter !== 'all'} />
        <QuickSelectPill label="Last action" value={lastActionDateFilter} options={dateOptions} onChange={onLastActionDateChange} active={lastActionDateFilter !== 'all'} />
        <QuickSelectPill label="Type" value={billTypeFilter} options={billTypeOptions} onChange={onBillTypeChange} active={billTypeFilter !== 'all'} />
      </div>

      {/* Active chips + Clear all */}
      {filtersActive && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex max-w-full items-center gap-1 rounded-sm border border-border bg-secondary/60 py-0.5 pl-2.5 pr-1 text-xs text-foreground"
            >
              <span className="truncate">{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                aria-label={`Remove ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClearAllFilters}
            className="text-xs font-medium text-foreground underline underline-offset-4 decoration-border transition-colors hover:decoration-foreground"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
