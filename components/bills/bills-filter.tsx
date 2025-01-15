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

// Map of bill types to their full names
const BILL_TYPE_NAMES: { [key: string]: string } = {
  'hr': 'House Bill',
  'hres': 'House Resolution',
  'hjres': 'House Joint Resolution',
  'hconres': 'House Concurrent Resolution',
  's': 'Senate Bill',
  'sres': 'Senate Resolution',
  'sjres': 'Senate Joint Resolution',
  'sconres': 'Senate Concurrent Resolution'
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
  billNumberFilter: string;
  onStatusChange: (value: string) => void;
  onIntroducedDateChange: (value: string) => void;
  onLastActionDateChange: (value: string) => void;
  onSponsorChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onPolicyAreaChange: (value: string) => void;
  onBillTypeChange: (value: string) => void;
  onBillNumberChange: (value: string) => void;
  onClearAllFilters: () => void;
  isMobile: boolean;
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
  billNumberFilter,
  onStatusChange,
  onIntroducedDateChange,
  onLastActionDateChange,
  onSponsorChange,
  onTitleChange,
  onStateChange,
  onPolicyAreaChange,
  onBillTypeChange,
  onBillNumberChange,
  onClearAllFilters,
  isMobile,
}: BillsFilterProps) {
  const handleBillNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      onBillNumberChange(value);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="font-semibold">{isMobile ? 'Filter Bills' : 'Filters'}</h2>
        <Button
          onClick={onClearAllFilters}
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          Clear All
        </Button>
      </div>

      {/* Search Filters - Always immediate */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="titleFilter" className="text-sm font-medium">
            Bill Title
          </label>
          <Input
            id="titleFilter"
            type="text"
            placeholder="Search bill titles..."
            value={titleFilter}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="sponsorFilter" className="text-sm font-medium">
            Sponsor Name
          </label>
          <Input
            id="sponsorFilter"
            type="text"
            placeholder="Search by sponsor..."
            value={sponsorFilter}
            onChange={(e) => onSponsorChange(e.target.value)}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="billNumberFilter" className="text-sm font-medium">
            Bill Number
          </label>
          <Input
            id="billNumberFilter"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter bill number..."
            value={billNumberFilter}
            onChange={handleBillNumberChange}
            className="w-full"
          />
        </div>
      </div>

      {/* Dropdown Filters */}
      <div className="space-y-4">
        {/* Bill Type Filter - New Position */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Bill Type</label>
          <Select 
            value={billTypeFilter} 
            onValueChange={onBillTypeChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Bill Types" />
            </SelectTrigger>
            <SelectContent className={isMobile ? "max-h-[40vh]" : ""}>
              <SelectItem value="all">All Bill Types</SelectItem>
              {Object.entries(BILL_TYPE_NAMES).map(([type, fullName]) => (
                <SelectItem key={type} value={type}>
                  {fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Status</label>
          <Select
            value={statusFilter}
            onValueChange={onStatusChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className={isMobile ? "max-h-[40vh]" : ""}>
              {statusOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* State Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium">State</label>
          <Select 
            value={stateFilter} 
            onValueChange={onStateChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent className={isMobile ? "max-h-[40vh]" : ""}>
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
        <div className="space-y-2">
          <label className="text-sm font-medium">Category</label>
          <Select 
            value={policyAreaFilter} 
            onValueChange={onPolicyAreaChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent className={isMobile ? "max-h-[40vh]" : ""}>
              <SelectItem value="all">All Categories</SelectItem>
              {POLICY_AREAS.map((area) => (
                <SelectItem key={area} value={area}>
                  {area}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Filters */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Introduced Date</label>
          <Select 
            value={introducedDateFilter} 
            onValueChange={onIntroducedDateChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Dates" />
            </SelectTrigger>
            <SelectContent className={isMobile ? "max-h-[40vh]" : ""}>
              <SelectItem value="all">All Introduced Dates</SelectItem>
              <SelectItem value="week">Last Week</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Last Action Date</label>
          <Select 
            value={lastActionDateFilter} 
            onValueChange={onLastActionDateChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Dates" />
            </SelectTrigger>
            <SelectContent className={isMobile ? "max-h-[40vh]" : ""}>
              <SelectItem value="all">All Action Dates</SelectItem>
              <SelectItem value="week">Last Week</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(BillsFilter), { ssr: false }); 