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