/**
 * Turn the bills-list filter state into a pre-applied catalog scope
 * (spec §6.3).
 *
 * The reader has already told us exactly what they care about. Handing the
 * model the rows, rather than a sentence describing them, is what stops it
 * re-deriving a slightly different set and answering about the wrong one.
 *
 * Input is `BillsFilterValues` from `app/bills/filter-signature.ts` — the shape
 * the list page actually holds, sentinel `'all'` values and all. Do not invent
 * a parallel filter type here; the mapping to the catalog's filter names is the
 * whole job of this file.
 *
 * Pure module so it carries unit tests.
 */
import type { BillsFilterValues } from '@/app/bills/filter-signature';
import type { HubDefinition } from './hubs';

export interface AnswerScope {
  dataset: 'bills';
  filters: Record<string, unknown>;
  /** Reader-facing, e.g. "health bills in committee". */
  label: string;
}

/**
 * The stage codes the answer catalog will accept, mirroring `VALID_STAGES` in
 * `convex/catalog/filters.ts`. Kept in step by a contract assertion in
 * `lib/answer-scope.test.ts`, which imports the catalog's own list and compares.
 *
 * This exists because the two lists silently disagreed. The bills list offers a
 * "Vetoed" filter (stage 85, see `lib/constants/filters.ts`) that the catalog
 * rejected, so "Ask about these" on a vetoed list produced a scope the server
 * threw away — and answered about every bill in the Congress instead, with a
 * label promising otherwise. A scope that cannot be applied must not be built.
 */
export const CATALOG_STAGES = [20, 40, 60, 80, 85, 90, 95, 100];

const STAGE_LABEL: Record<number, string> = {
  20: 'just introduced',
  40: 'in committee',
  60: 'past one chamber',
  80: 'past both chambers',
  85: 'vetoed',
  90: 'awaiting the president',
  95: 'signed',
  100: 'now law',
};

/** The list page uses `'all'` and `''` as "not set". Normalise both away. */
function value(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim();
  return v === '' || v === 'all' ? undefined : v;
}

function num(raw: string | undefined): number | undefined {
  const v = value(raw);
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function scopeFromFilters(input: Partial<BillsFilterValues>): AnswerScope | null {
  const filters: Record<string, unknown> = {};
  const parts: string[] = [];

  const congress = num(input.congress);
  if (congress !== undefined) filters.congress = congress;

  const policyArea = value(input.policyArea);
  if (policyArea) {
    filters.policyArea = policyArea;
    parts.push(`${policyArea.toLowerCase()} bills`);
  }

  // `status` holds the stage CODE as a string — see lib/services/bills-service.ts.
  // A stage the catalog will not accept is dropped from the FILTERS but kept in
  // the LABEL, so the reader's words survive while the server is only ever
  // handed a filter set it can actually apply.
  const stage = num(input.status);
  if (stage !== undefined) {
    if (CATALOG_STAGES.includes(stage)) filters.progressStage = stage;
    parts.push(STAGE_LABEL[stage] ?? '');
  }

  const sponsors = (input.sponsor ?? []).filter((s) => s.trim() !== '');
  if (sponsors.length > 0) {
    filters.sponsorFilter = sponsors;
    parts.push(`sponsored by ${sponsors.join(' or ')}`);
  }

  const state = value(input.state);
  if (state) {
    filters.sponsorState = state;
    parts.push(`from ${state}`);
  }

  const chamber = value(input.chamber);
  if (chamber) {
    filters.chamber = chamber;
    parts.push(chamber === 'house' ? 'in the House' : 'in the Senate');
  }

  const billType = value(input.billType);
  if (billType) filters.billType = billType;

  const billNumber = value(input.billNumber);
  if (billNumber) filters.billNumber = billNumber;

  const title = value(input.title);
  if (title) {
    filters.titleFilter = title;
    parts.push(`matching "${title}"`);
  }

  // congress alone is not a scope worth pre-applying — that is the whole list.
  const meaningful = Object.keys(filters).filter((k) => k !== 'congress');
  if (meaningful.length === 0) return null;

  if (parts.length === 0) parts.push('bills');
  const label = parts.filter(Boolean).join(' ');
  return { dataset: 'bills', filters, label };
}

/**
 * The pre-applied scope for a hub page (`/bills/house`, `/bills/enacted`,
 * `/bills/topic/health`).
 *
 * Hubs had no ask affordance at all before the persistent panel, so this is the
 * first time a question asked from one carries what the reader is looking at.
 *
 * `HubDefinition.filter.progressStage` is typed as a STRING (see `lib/hubs.ts`)
 * while the catalog's filter is a number, and a mismatched type is rejected
 * outright rather than coerced — so the coercion here is load-bearing, not
 * tidying.
 */
export function scopeFromHub(hub: HubDefinition): AnswerScope | null {
  const filters: Record<string, unknown> = {};

  if (hub.filter.chamber) filters.chamber = hub.filter.chamber;
  if (hub.filter.policyArea) filters.policyArea = hub.filter.policyArea;

  if (hub.filter.progressStage !== undefined) {
    const stage = Number.parseInt(hub.filter.progressStage, 10);
    if (CATALOG_STAGES.includes(stage)) filters.progressStage = stage;
  }

  if (Object.keys(filters).length === 0) return null;
  return { dataset: 'bills', filters, label: hub.heading.toLowerCase() };
}
