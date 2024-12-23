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

// Map of policy areas
const POLICY_AREAS = [
  'Agriculture and Food',
  'Animals',
  'Armed Forces and National Security',
  'Arts, Culture, Religion',
  'Civil Rights and Liberties, Minority Issues',
  'Commerce',
  'Congress',
  'Crime and Law Enforcement',
  'Economics and Public Finance',
  'Education',
  'Emergency Management',
  'Energy',
  'Environmental Protection',
  'Families',
  'Finance and Financial Sector',
  'Foreign Trade and International Finance',
  'Government Operations and Politics',
  'Health',
  'Housing and Community Development',
  'Immigration',
  'International Affairs',
  'Labor and Employment',
  'Law',
  'Native Americans',
  'Private Legislation',
  'Public Lands and Natural Resources',
  'Science, Technology, Communications',
  'Social Sciences and History',
  'Social Welfare',
  'Sports and Recreation',
  'Taxation',
  'Transportation and Public Works',
  'Water Resources Development'
];

// Map of state abbreviations to full names
const STATE_NAMES: { [key: string]: string } = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
};

interface BillsFilterProps {
  statusFilter: string;
  introducedDateFilter: string;
  lastActionDateFilter: string;
  sponsorFilter: string;
  titleFilter: string;
  stateFilter: string;
  policyAreaFilter: string;
  onStatusChange: (value: string) => void;
  onIntroducedDateChange: (value: string) => void;
  onLastActionDateChange: (value: string) => void;
  onSponsorChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onPolicyAreaChange: (value: string) => void;
  onClearAllFilters: () => void;
}

function BillsFilter({
  statusFilter,
  introducedDateFilter,
  lastActionDateFilter,
  sponsorFilter,
  titleFilter,
  stateFilter,
  policyAreaFilter,
  onStatusChange,
  onIntroducedDateChange,
  onLastActionDateChange,
  onSponsorChange,
  onTitleChange,
  onStateChange,
  onPolicyAreaChange,
  onClearAllFilters,
}: BillsFilterProps) {
  const hasActiveFilters = 
    statusFilter !== 'all' ||
    introducedDateFilter !== 'all' ||
    lastActionDateFilter !== 'all' ||
    sponsorFilter !== '' ||
    titleFilter !== '' ||
    stateFilter !== 'all' ||
    policyAreaFilter !== 'all';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <Select value={policyAreaFilter} onValueChange={onPolicyAreaChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Categories" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] overflow-y-auto">
            <SelectItem value="all">All Categories</SelectItem>
            {POLICY_AREAS.map((area) => (
              <SelectItem key={area} value={area}>
                {area}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Introduced">Introduced</SelectItem>
            <SelectItem value="In Committee">In Committee</SelectItem>
            <SelectItem value="Passed One Chamber">Passed One Chamber</SelectItem>
            <SelectItem value="Passed Both Chambers">Passed Both Chambers</SelectItem>
            <SelectItem value="To President">To President</SelectItem>
            <SelectItem value="Signed by President">Signed by President</SelectItem>
            <SelectItem value="Became Law">Became Law</SelectItem>
          </SelectContent>
        </Select>

        <Select value={introducedDateFilter} onValueChange={onIntroducedDateChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by introduced date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Introduced Date</SelectItem>
            <SelectItem value="week">Last Week</SelectItem>
            <SelectItem value="month">Last Month</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>

        <Select value={lastActionDateFilter} onValueChange={onLastActionDateChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by last action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Last Action Date</SelectItem>
            <SelectItem value="week">Last Week</SelectItem>
            <SelectItem value="month">Last Month</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>

        <Select value={stateFilter} onValueChange={onStateChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {Object.entries(STATE_NAMES).map(([abbr, fullName]) => (
              <SelectItem key={abbr} value={abbr}>
                {fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button 
            variant="outline" 
            onClick={onClearAllFilters}
            className="whitespace-nowrap"
          >
            Clear All Filters
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Input
          type="text"
          placeholder="Search by bill title"
          value={titleFilter}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-[300px]"
        />
        <Input
          type="text"
          placeholder="Search by sponsor name"
          value={sponsorFilter}
          onChange={(e) => onSponsorChange(e.target.value)}
          className="w-[300px]"
        />
      </div>
    </div>
  );
}

// Export as default for dynamic import
export default BillsFilter; 