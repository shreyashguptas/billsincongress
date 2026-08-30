export const BILL_TYPES = {
  'hr': 'House Bill',
  'hres': 'House Resolution',
  'hjres': 'House Joint Resolution',
  'hconres': 'House Concurrent Resolution',
  's': 'Senate Bill',
  'sres': 'Senate Resolution',
  'sjres': 'Senate Joint Resolution',
  'sconres': 'Senate Concurrent Resolution'
} as const;

export const BILL_TYPE_OPTIONS = Object.entries(BILL_TYPES).map(([value, label]) => ({
  value,
  label
}));

export const POLICY_AREAS = [
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

export const STATE_NAMES: Record<string, string> = {
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
  // Non-state jurisdictions that send a voting or non-voting member to the
  // House. Their sponsors' bills were unreachable by the state filter until
  // these were added.
  PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands',
  AS: 'American Samoa', MP: 'Northern Mariana Islands',
};

/**
 * States as picker options, ordered by NAME rather than by abbreviation.
 * Ordering by the key put District of Columbia after Wyoming, which reads as
 * a bug in an alphabetical list.
 */
export const STATE_OPTIONS = Object.entries(STATE_NAMES)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: '20',  label: 'Introduced' },
  { value: '40',  label: 'In committee' },
  { value: '60',  label: 'Passed one chamber' },
  { value: '80',  label: 'Passed both chambers' },
  { value: '85',  label: 'Vetoed' },
  { value: '90',  label: 'To President' },
  { value: '95',  label: 'Signed by President' },
  { value: '100', label: 'Became law' },
];

export const DATE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'week', label: 'Last week' },
  { value: 'month', label: 'Last month' },
  { value: '3months', label: 'Last 3 months' },
  { value: '6months', label: 'Last 6 months' },
  { value: 'year', label: 'Last year' },
];

/** Label a filter value the same way the control that set it does. Falls back to
 *  the raw value rather than hiding an unrecognised one. */
export const labelFor = (
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
) => options.find((o) => o.value === value)?.label ?? value;

/**
 * Statuses offered in the picker, in reader-interest order rather than
 * pipeline order — "did it become law" is the question people arrive with.
 *
 * Stages 80 (passed both chambers), 90 (to President) and 95 (signed) are
 * absent because they are empty or near-empty in every Congress we carry — 90
 * and 95 hold nothing at all, 80 holds two bills, both in the 117th — since the
 * ingest pipeline records those transitions as "became law" instead.
 * `lib/hubs.ts` documents the same measurement and builds no hub pages for them.
 *
 * They stay in `STATUS_OPTIONS` above, because a bookmarked `?status=90` must
 * still be labelled rather than shown as a bare number.
 */
export const LIVE_STATUS_OPTIONS = [
  { value: 'all', label: 'Any outcome' },
  { value: '100', label: 'Became law' },
  { value: '85', label: 'Vetoed' },
  { value: '60', label: 'Passed one chamber' },
  { value: '40', label: 'Still in committee' },
  { value: '20', label: 'Just introduced' },
];

/** The chamber a bill originated in. Distinct from bill type, which is one of
 *  four kinds within a chamber. */
export const CHAMBER_OPTIONS = [
  { value: 'all', label: 'Either chamber' },
  { value: 'house', label: 'House' },
  { value: 'senate', label: 'Senate' },
];

/**
 * Bill types grouped by what they actually do, because "House Concurrent
 * Resolution" tells a non-expert nothing. Ordinary bills are ~84% of the
 * corpus and come first.
 */
export const BILL_TYPE_GROUPS: Array<{
  label: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    label: 'Bills',
    options: [
      { value: 'hr', label: 'House Bill' },
      { value: 's', label: 'Senate Bill' },
    ],
  },
  {
    label: 'Joint resolutions (can become law)',
    options: [
      { value: 'hjres', label: 'House Joint Resolution' },
      { value: 'sjres', label: 'Senate Joint Resolution' },
    ],
  },
  {
    label: 'Simple and concurrent resolutions',
    options: [
      { value: 'hres', label: 'House Resolution' },
      { value: 'hconres', label: 'House Concurrent Resolution' },
      { value: 'sres', label: 'Senate Resolution' },
      { value: 'sconres', label: 'Senate Concurrent Resolution' },
    ],
  },
];

/** Which chamber each bill type belongs to, so picking a chamber can narrow the
 *  kind list instead of offering four impossible combinations. */
export const CHAMBER_OF_BILL_TYPE: Record<string, 'house' | 'senate'> = {
  hr: 'house', hres: 'house', hjres: 'house', hconres: 'house',
  s: 'senate', sres: 'senate', sjres: 'senate', sconres: 'senate',
};
