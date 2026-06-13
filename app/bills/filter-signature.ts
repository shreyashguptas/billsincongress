/**
 * Canonical signature of a bills filter set. Shared by the server page (to
 * record which filters it applied) and the client component (to decide whether
 * the server-rendered results already match the hydrated filter state).
 */
export interface BillsFilterValues {
  status: string;
  introducedDate: string;
  lastActionDate: string;
  sponsor: string[];
  title: string;
  state: string;
  policyArea: string;
  billType: string;
  billNumber: string;
  congress: string;
}

export const DEFAULT_FILTER_VALUES: BillsFilterValues = {
  status: 'all',
  introducedDate: 'all',
  lastActionDate: 'all',
  sponsor: [],
  title: '',
  state: 'all',
  policyArea: 'all',
  billType: 'all',
  billNumber: '',
  congress: 'all',
};

export function filterSignature(f: BillsFilterValues): string {
  return [
    f.status, f.introducedDate, f.lastActionDate, f.sponsor.join(','),
    f.title, f.state, f.policyArea, f.billType, f.billNumber, f.congress,
  ].join('|');
}
