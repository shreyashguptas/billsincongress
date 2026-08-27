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

export interface AnswerScope {
  dataset: 'bills';
  filters: Record<string, unknown>;
  /** Reader-facing, e.g. "health bills in committee". */
  label: string;
}

const STAGE_LABEL: Record<number, string> = {
  20: 'just introduced',
  40: 'in committee',
  60: 'past one chamber',
  80: 'past both chambers',
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
  const stage = num(input.status);
  if (stage !== undefined) {
    filters.progressStage = stage;
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
