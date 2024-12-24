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
import { BILL_TYPES } from '@/lib/constants/filters';
import dynamic from 'next/dynamic';
import { BillStageDescriptions, BillStageOrder } from '@/lib/utils/bill-stages';
import { BillStages } from '@/lib/utils/bill-stages';

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
  billTypeFilter: string;
  onStatusChange: (value: string) => void;
  onIntroducedDateChange: (value: string) => void;
  onLastActionDateChange: (value: string) => void;
  onSponsorChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onPolicyAreaChange: (value: string) => void;
  onBillTypeChange: (value: string) => void;
  onClearAllFilters: () => void;
}

interface StatusOption {
  value: string;
  label: string;
}

const statusOptions: StatusOption[] = [
  { value: 'all', label: 'All Statuses' },
  { value: '20', label: 'Introduced' },
  { value: '40', label: 'In Committee' },
  { value: '60', label: 'Passed One Chamber' },
  { value: '80', label: 'Passed Both Chambers' },
  { value: '90', label: 'To President' },
  { value: '95', label: 'Signed by President' },
  { value: '100', label: 'Became Law' },
];

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
        {/* Status Filter */}
        <div className="relative">
          <Select
            value={statusFilter}
            onValueChange={onStatusChange}
          >
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="w-[180px] min-w-[180px]"
              align="start"
              sideOffset={4}
              side="bottom"
            >
              {statusOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bill Type Filter */}
        <div className="relative">
          <Select 
            value={billTypeFilter} 
            onValueChange={onBillTypeChange}
          >
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="All Bill Types" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="w-[180px] min-w-[180px]"
              align="start"
              sideOffset={4}
              side="bottom"
            >
              <SelectItem value="all">All Bill Types</SelectItem>
              {Object.entries(BILL_TYPES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* State Filter */}
        <div className="relative">
          <Select 
            value={stateFilter} 
            onValueChange={onStateChange}
          >
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="w-[180px] min-w-[180px]"
              align="start"
              sideOffset={4}
              side="bottom"
            >
              <SelectItem value="all">All States</SelectItem>
              {Object.entries(STATE_NAMES).map(([abbr, name]) => (
                <SelectItem key={abbr} value={abbr}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Policy Area Filter */}
        <div className="relative">
          <Select 
            value={policyAreaFilter} 
            onValueChange={onPolicyAreaChange}
          >
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="w-[180px] min-w-[180px]"
              align="start"
              sideOffset={4}
              side="bottom"
            >
              <SelectItem value="all">All Categories</SelectItem>
              {POLICY_AREAS.map((area) => (
                <SelectItem key={area} value={area}>
                  {area}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Introduced Date Filter */}
        <div className="relative">
          <Select 
            value={introducedDateFilter} 
            onValueChange={onIntroducedDateChange}
          >
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="Introduced Date" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="w-[180px] min-w-[180px]"
              align="start"
              sideOffset={4}
              side="bottom"
            >
              <SelectItem value="all">All Introduced Dates</SelectItem>
              <SelectItem value="week">Last Week</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Last Action Date Filter */}
        <div className="relative">
          <Select 
            value={lastActionDateFilter} 
            onValueChange={onLastActionDateChange}
          >
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="Last Action Date" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="w-[180px] min-w-[180px]"
              align="start"
              sideOffset={4}
              side="bottom"
            >
              <SelectItem value="all">All Action Dates</SelectItem>
              <SelectItem value="week">Last Week</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* Title Search */}
        <Input
          placeholder="Search bill titles..."
          value={titleFilter}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-[300px] h-10"
        />

        {/* Sponsor Search */}
        <Input
          placeholder="Search by sponsor name..."
          value={sponsorFilter}
          onChange={(e) => onSponsorChange(e.target.value)}
          className="w-[300px] h-10"
        />

        {/* Clear All Filters Button */}
        <Button variant="outline" onClick={onClearAllFilters} className="h-10">
          Clear All Filters
        </Button>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(BillsFilter), { ssr: false }); 