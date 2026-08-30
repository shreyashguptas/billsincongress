/**
 * The registry of every filter on /bills.
 *
 * Before this existed the same filter was described in five places — a state
 * hook, a URL writer, a URL reader, a dropdown, and two separate active-chip
 * rows — and they drifted. The chip in the filter bar said `Health`; the chip
 * in the empty state said `Policy area: Health`. A non-numeric `?congress=abc`
 * rendered `NaNth Congress`. `chamber` was plumbed all the way through the
 * service and Convex but never parsed from the URL, so it silently did not
 * exist for a year.
 *
 * So: one entry per filter, and everything downstream is derived from it. The
 * pills, the "all filters" panel, the empty-state chips, the URL writer, the
 * URL reader and the analytics vocabulary all read this list. A new filter is
 * added here and appears everywhere; it cannot be added to four places and
 * forgotten in the fifth.
 *
 * Two constraints on this file:
 *
 *  - It is pure. No React, no DOM, no Tailwind class strings — `lib/` is not in
 *    tailwind.config.ts's `content` globs, so any class named here would be
 *    purged from the stylesheet and silently do nothing.
 *  - `kind` is the analytics vocabulary and must not be renamed. Reader-facing
 *    labels are free to change; `filter_kind` values are joined against
 *    historical PostHog data and against `dashboard_drilldown_clicked`.
 */
import {
  BILL_TYPES,
  BILL_TYPE_GROUPS,
  CHAMBER_OF_BILL_TYPE,
  CHAMBER_OPTIONS,
  DATE_OPTIONS,
  LIVE_STATUS_OPTIONS,
  POLICY_AREAS,
  STATE_NAMES,
  STATE_OPTIONS,
  STATUS_OPTIONS,
  labelFor,
} from '@/lib/constants/filters';
import { formatCongressPicker } from '@/lib/congress';
import { topicSlug } from '@/lib/hubs';
import type { BillsFilterValues } from '@/app/bills/filter-signature';

export interface FilterOption {
  value: string;
  label: string;
  /** Optional right-hand number, e.g. a sponsor's bill count. */
  count?: number;
  /** Groups rows under a heading in the picker. */
  group?: string;
}

/** What `options()` needs that this module cannot know statically. */
export interface FilterOptionContext {
  /** Congresses with data, newest first or last — order is normalised here. */
  congressNumbers: number[];
  /** Loaded lazily on first open of the sponsor picker; empty until then. */
  sponsors: Array<{ name: string; party?: string; state?: string; billCount: number }>;
  /** The value currently applied, so it can never be missing from its own list. */
  currentValue: string;
  /** The chamber currently applied, so the kind list can narrow to it. */
  chamber: string;
}

/** Which visual tier a filter sits in. `scope` is the Congress switcher. */
export type FilterTier = 'base' | 'sm' | 'lg' | 'panel' | 'scope';

export interface FilterDefinition {
  /** Analytics `filter_kind`. Stable vocabulary — never rename. */
  kind: string;
  /** Which key of BillsFilterValues this drives. */
  field: keyof BillsFilterValues;
  /** URL search parameter name. */
  param: string;
  /** Short name on the pill face. */
  label: string;
  /** One plain-English sentence shown in the picker header. */
  helper: string;
  /** The first row of the picker, which clears the filter. */
  emptyLabel: string;
  /** True for filters holding an array of values. */
  multi: boolean;
  tier: FilterTier;
  /** True when Convex applies this in memory over a capped scan (see below). */
  scanLimited: boolean;
  options: (ctx: FilterOptionContext) => FilterOption[];
  /** The single human label for a set value — pill, chip and empty state. */
  describe: (value: string | string[]) => string;
  /** The hub page that covers this value, when one exists. */
  hubPath?: (value: string) => string | null;
}

/** A filter's value is "set" when it differs from its default. */
export function isSet(value: string | string[]): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== '' && value !== 'all';
}

/** Options with `currentValue` guaranteed present, even if unrecognised. */
function withCurrent(
  options: FilterOption[],
  currentValue: string,
  label: (v: string) => string,
): FilterOption[] {
  if (!isSet(currentValue)) return options;
  if (options.some((o) => o.value === currentValue)) return options;
  // A bookmarked URL can name a value the picker no longer offers — a retired
  // status, a policy area that emptied, a state abbreviation we do not know.
  // Dropping it would make opening the picker silently wipe the filter.
  return [...options, { value: currentValue, label: label(currentValue) }];
}

/** The clearing row every single-select picker opens with. */
const ANY = (label: string): FilterOption => ({ value: 'all', label });

export const FILTERS: FilterDefinition[] = [
  {
    kind: 'policy_area',
    field: 'policyArea',
    param: 'policyArea',
    label: 'Topic',
    helper:
      'What the bill is mainly about, as classified by the Congressional Research Service. Each bill gets exactly one.',
    emptyLabel: 'Any topic',
    multi: false,
    tier: 'base',
    scanLimited: false,
    options: (ctx) =>
      withCurrent(
        [
          ANY('Any topic'),
          ...POLICY_AREAS.map((a) => ({ value: a, label: a })),
        ],
        ctx.currentValue,
        (v) => v,
      ),
    describe: (v) => String(v),
    hubPath: (v) => (v && v !== 'all' ? `/bills/topic/${topicSlug(v)}` : null),
  },
  {
    kind: 'status',
    field: 'status',
    param: 'status',
    label: 'Outcome',
    helper:
      'How far the bill got. Most never leave committee; a few hundred of roughly 18,000 become law.',
    emptyLabel: 'Any outcome',
    multi: false,
    tier: 'base',
    scanLimited: false,
    options: (ctx) =>
      withCurrent(LIVE_STATUS_OPTIONS.slice(), ctx.currentValue, (v) =>
        labelFor(STATUS_OPTIONS, v),
      ),
    describe: (v) => labelFor(STATUS_OPTIONS, String(v)),
    hubPath: (v) =>
      ({
        '100': '/bills/enacted',
        '40': '/bills/in-committee',
        '60': '/bills/passed-one-chamber',
        '85': '/bills/vetoed',
        '20': '/bills/introduced',
      })[String(v)] ?? null,
  },
  {
    kind: 'chamber',
    field: 'chamber',
    param: 'chamber',
    label: 'Chamber',
    helper: 'Which body the bill was introduced in.',
    emptyLabel: 'Either chamber',
    multi: false,
    tier: 'base',
    scanLimited: true,
    options: (ctx) =>
      withCurrent(CHAMBER_OPTIONS.slice(), ctx.currentValue, (v) => v),
    describe: (v) => labelFor(CHAMBER_OPTIONS, String(v)),
    hubPath: (v) =>
      ({ house: '/bills/house', senate: '/bills/senate' })[String(v)] ?? null,
  },
  {
    kind: 'sponsor',
    field: 'sponsor',
    param: 'sponsor',
    label: 'Sponsor',
    helper: 'The member who introduced the bill. Pick more than one to combine them.',
    emptyLabel: 'Any sponsor',
    multi: true,
    tier: 'sm',
    scanLimited: true,
    options: (ctx) =>
      ctx.sponsors.map((s) => ({
        value: s.name,
        label: s.name,
        count: s.billCount,
        group: [s.party, s.state].filter(Boolean).join(' · ') || undefined,
      })),
    describe: (v) => {
      const names = Array.isArray(v) ? v : [v];
      if (names.length === 0) return '';
      return names.length === 1 ? names[0] : `${names.length} sponsors`;
    },
  },
  {
    kind: 'state',
    field: 'state',
    param: 'state',
    label: "Sponsor's state",
    helper: 'The state or territory the sponsoring member represents.',
    emptyLabel: 'Any state',
    multi: false,
    tier: 'lg',
    scanLimited: true,
    options: (ctx) =>
      withCurrent(
        [ANY('Any state'), ...STATE_OPTIONS],
        ctx.currentValue,
        (v) => STATE_NAMES[v] ?? v,
      ),
    describe: (v) => STATE_NAMES[String(v)] ?? String(v),
  },
  {
    kind: 'bill_type',
    field: 'billType',
    param: 'billType',
    label: 'Kind',
    helper:
      'Bills can become law. Simple and concurrent resolutions express a position without becoming law.',
    emptyLabel: 'Any kind',
    multi: false,
    tier: 'panel',
    scanLimited: true,
    options: (ctx) => {
      const rows: FilterOption[] = [ANY('Any kind')];
      for (const group of BILL_TYPE_GROUPS) {
        for (const option of group.options) {
          // Once a chamber is chosen, the other chamber's four kinds can only
          // ever return nothing, so they are not offered. Looked up rather than
          // inferred from the leading letter: that happens to work today only
          // because every House code starts with "h", which is a coincidence of
          // naming and not a rule anyone guaranteed.
          if (ctx.chamber !== 'all' && CHAMBER_OF_BILL_TYPE[option.value] !== ctx.chamber) {
            continue;
          }
          rows.push({ ...option, group: group.label });
        }
      }
      return withCurrent(
        rows,
        ctx.currentValue,
        (v) => BILL_TYPES[v as keyof typeof BILL_TYPES] ?? v,
      );
    },
    describe: (v) => BILL_TYPES[String(v) as keyof typeof BILL_TYPES] ?? String(v),
  },
  {
    kind: 'introduced_date',
    field: 'introducedDate',
    param: 'introducedDate',
    label: 'Introduced',
    helper: 'When the bill was first introduced.',
    emptyLabel: 'Any time',
    multi: false,
    tier: 'panel',
    scanLimited: true,
    options: (ctx) =>
      withCurrent(DATE_OPTIONS.slice(), ctx.currentValue, (v) => v),
    describe: (v) => labelFor(DATE_OPTIONS, String(v)),
  },
  {
    kind: 'last_action_date',
    field: 'lastActionDate',
    param: 'lastActionDate',
    label: 'Activity',
    helper: 'When anything last happened to the bill.',
    emptyLabel: 'Any time',
    multi: false,
    tier: 'panel',
    scanLimited: true,
    options: (ctx) =>
      withCurrent(DATE_OPTIONS.slice(), ctx.currentValue, (v) => v),
    describe: (v) => labelFor(DATE_OPTIONS, String(v)),
  },
  {
    kind: 'congress',
    field: 'congress',
    param: 'congress',
    label: 'Congress',
    helper: 'Which two-year Congress to look at.',
    emptyLabel: 'Current Congress',
    multi: false,
    tier: 'scope',
    scanLimited: false,
    options: (ctx) =>
      withCurrent(
        [
          ANY('Current Congress'),
          ...[...ctx.congressNumbers]
            .sort((a, b) => b - a)
            .map((c) => ({ value: String(c), label: formatCongressPicker(c) })),
        ],
        ctx.currentValue,
        (v) => v,
      ),
    // Guarded, unlike the old chip row, which rendered "NaNth Congress" for a
    // non-numeric value straight out of the URL.
    describe: (v) => {
      const n = Number.parseInt(String(v), 10);
      return Number.isNaN(n) ? `Congress ${v}` : formatCongressPicker(n);
    },
  },
  {
    kind: 'title',
    field: 'title',
    param: 'title',
    label: 'Search',
    helper: 'Words in the bill title, or a bill number.',
    emptyLabel: '',
    multi: false,
    tier: 'panel',
    scanLimited: false,
    options: () => [],
    describe: (v) => `“${String(v)}”`,
  },
  {
    kind: 'bill_number',
    field: 'billNumber',
    param: 'billNumber',
    label: 'Bill number',
    helper: 'An exact bill number.',
    emptyLabel: '',
    multi: false,
    tier: 'panel',
    scanLimited: false,
    options: () => [],
    describe: (v) => `Bill number ${v}`,
  },
];

/** Registry lookup by the BillsFilterValues key it drives. */
export const FILTER_BY_FIELD: Record<string, FilterDefinition> = Object.fromEntries(
  FILTERS.map((f) => [f.field, f]),
);

/** Every filter currently set, in registry order, with its display label. */
export function activeFilters(
  values: BillsFilterValues,
): Array<{ definition: FilterDefinition; value: string | string[]; label: string }> {
  const out = [];
  for (const definition of FILTERS) {
    const value = values[definition.field];
    if (!isSet(value)) continue;
    out.push({ definition, value, label: definition.describe(value) });
  }
  return out;
}

export function activeFilterCount(values: BillsFilterValues): number {
  return activeFilters(values).length;
}

/**
 * Filters that Convex applies in memory over a capped scan rather than through
 * an index, so a result set narrowed only by these can be truncated. The UI
 * says so rather than letting the list quietly stop short.
 */
export function scanLimitedActive(values: BillsFilterValues): string[] {
  return activeFilters(values)
    .filter((a) => a.definition.scanLimited)
    .map((a) => a.definition.kind);
}
