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
import { BILL_TYPE_OPTIONS } from '@/lib/constants/filters';
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
  statusFilter: string | null;
  introducedDateFilter: string | null;
  lastActionDateFilter: string | null;
  sponsorFilter: string;
  titleFilter: string;
  stateFilter: string | null;
  policyAreaFilter: string | null;
  billTypeFilter: string | null;
  onStatusChange: (value: string | null) => void;
  onIntroducedDateChange: (value: string | null) => void;
  onLastActionDateChange: (value: string | null) => void;
  onSponsorChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onStateChange: (value: string | null) => void;
  onPolicyAreaChange: (value: string | null) => void;
  onBillTypeChange: (value: string | null) => void;
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
  billTypeFilter,
  onStatusChange,
  onIntroducedDateChange,
  onLastActionDateChange,
  onSponsorChange,
  onTitleChange,
  onStateChange,
  onPolicyAreaChange,
  onBillTypeChange,
  onClearAllFilters,
}: BillsFilterProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {/* Bill Type Filter */}
        <Select value={billTypeFilter} onValueChange={onBillTypeChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Bill Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bill Types</SelectItem>
            {BILL_TYPE_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Policy Area Filter */}
        <Select value={policyAreaFilter} onValueChange={onPolicyAreaChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {POLICY_AREAS.map((area) => (
              <SelectItem key={area} value={area}>
                {area}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Introduced">Introduced</SelectItem>
            <SelectItem value="In Committee">In Committee</SelectItem>
            <SelectItem value="Passed One Chamber">Passed One Chamber</SelectItem>
            <SelectItem value="Passed Both Chambers">Passed Both Chambers</SelectItem>
            <SelectItem value="To President">To President</SelectItem>
            <SelectItem value="Became Law">Became Law</SelectItem>
          </SelectContent>
        </Select>

        {/* Introduced Date Filter */}
        <Select value={introducedDateFilter} onValueChange={onIntroducedDateChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Introduced Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Introduced Dates</SelectItem>
            <SelectItem value="week">Last Week</SelectItem>
            <SelectItem value="month">Last Month</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>

        {/* Last Action Date Filter */}
        <Select value={lastActionDateFilter} onValueChange={onLastActionDateChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Last Action Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Action Dates</SelectItem>
            <SelectItem value="week">Last Week</SelectItem>
            <SelectItem value="month">Last Month</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>

        {/* State Filter */}
        <Select value={stateFilter} onValueChange={onStateChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {Object.entries(STATE_NAMES).map(([abbr, name]) => (
              <SelectItem key={abbr} value={abbr}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* Title Search */}
        <Input
          placeholder="Search bill titles..."
          value={titleFilter}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-[300px]"
        />

        {/* Sponsor Search */}
        <Input
          placeholder="Search by sponsor name..."
          value={sponsorFilter}
          onChange={(e) => onSponsorChange(e.target.value)}
          className="w-[300px]"
        />

        {/* Clear All Filters Button */}
        <Button variant="outline" onClick={onClearAllFilters}>
          Clear All Filters
        </Button>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(BillsFilter), { ssr: false }); 