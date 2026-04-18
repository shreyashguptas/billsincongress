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
import { useState, useEffect } from 'react';
import { billsService } from '@/lib/services/bills-service';
import { cn } from '@/lib/utils';

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
  sponsorFilter: string;
  titleFilter: string;
  stateFilter: string;
  policyAreaFilter: string;
  billTypeFilter: string;
  billNumberFilter: string;
  congressFilter: string;
  onStatusChange: (v: string) => void;
  onIntroducedDateChange: (v: string) => void;
  onLastActionDateChange: (v: string) => void;
  onSponsorChange: (v: string) => void;
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
    isActive(sponsorFilter, '') ||
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

        <FilterField label="Sponsor" active={isActive(sponsorFilter, '')}>
          <Input
            type="text"
            placeholder="Member's name"
            value={sponsorFilter}
            onChange={(e) => onSponsorChange(e.target.value)}
          />
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
