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
};

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