export const statusFilters = [
  { value: 'all', label: 'All Status' },
  { value: 'introduced', label: 'Introduced' },
  { value: 'committee', label: 'In Committee' },
  { value: 'passed_house', label: 'Passed House' },
  { value: 'passed_senate', label: 'Passed Senate' },
  { value: 'enacted', label: 'Enacted' },
] as const;

export const categoryFilters = [
  { value: 'all', label: 'All Categories' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'environment', label: 'Environment' },
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
] as const;

export const sortOptions = [
  { value: 'latest', label: 'Latest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'popular', label: 'Most Popular' },
] as const;