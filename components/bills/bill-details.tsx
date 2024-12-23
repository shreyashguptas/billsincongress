'use client';

import Link from 'next/link';
import type { Bill } from '@/lib/types/bill';
import { useEffect, useState } from 'react';

// Map of state abbreviations to full names
const STATE_NAMES: Record<string, string> = {
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
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia'
} as const;

// Map of party abbreviations to full names
const PARTY_NAMES: Record<string, string> = {
  R: 'Republican',
  D: 'Democrat',
  I: 'Independent',
  ID: 'Independent Democrat',
  IR: 'Independent Republican',
  L: 'Libertarian',
  G: 'Green Party',
  // Fallback for unknown parties
  '': 'No Party Affiliation'
} as const;

interface BillDetailsProps {
  bill: Bill;
}

export default function BillDetails({ bill }: BillDetailsProps) {
  const [summary, setSummary] = useState<string>(bill.latest_summary || 'No summary available.');
  
  useEffect(() => {
    try {
      if (bill.latest_summary) {
        const tmp = document.createElement('div');
        tmp.innerHTML = bill.latest_summary;
        setSummary(tmp.textContent || tmp.innerText || 'No summary available.');
      }
    } catch (error: unknown) {
      console.error('Error parsing bill summary:', error);
      setSummary('Error loading summary.');
    }
  }, [bill.latest_summary]);

  // Calculate progress percentage based on stage (20-100)
  const getProgressPercentage = (stage: number): number => {
    // Ensure stage is between 20 and 100
    const validStage = Math.max(20, Math.min(100, stage));
    return ((validStage - 20) / 80) * 100;
  };

  // Convert progress_stage to number and calculate percentage
  const progressStage = typeof bill.progress_stage === 'string' 
    ? parseInt(bill.progress_stage, 10) 
    : bill.progress_stage;
  const progressPercentage = getProgressPercentage(progressStage || 20);
  const stateName = STATE_NAMES[bill.sponsor_state as keyof typeof STATE_NAMES] || bill.sponsor_state;
  const partyName = PARTY_NAMES[bill.sponsor_party as keyof typeof PARTY_NAMES] || bill.sponsor_party;

  // Format date in UTC
  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00Z');
    
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    }).format(date);
  };

  return (
       <main className="container mx-auto px-4 py-4 sm:py-8 max-w-5xl">
      {/* Header Section */}
      <div className="bg-card rounded-lg shadow-lg p-4 sm:p-8 mb-4 sm:mb-8">
        <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-4 text-primary leading-tight">{bill.title}</h1>
        <div className="text-sm sm:text-base text-muted-foreground mb-2 sm:mb-4">
          Introduced on {formatDate(bill.introduced_date)}
        </div>
      </div>

      {/* Status Section */}
      <div className="bg-card rounded-lg shadow-lg p-4 sm:p-8 mb-4 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6">Current Status</h2>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
            <span className="text-base sm:text-lg font-medium mb-1 sm:mb-0">{bill.progress_description}</span>
            <span className="text-sm sm:text-base text-muted-foreground">{progressPercentage.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-3 sm:h-4 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 ease-in-out rounded-full"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          {/* Mobile: Vertical stages */}
          <div className="block sm:hidden space-y-2 text-sm text-muted-foreground mt-2">
            {['Introduced', 'Committee', 'One Chamber', 'Both Chambers', 'To President', 'Signed', 'Law'].map((stage, index) => (
              <div key={stage} className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${index * (100/6) <= progressPercentage ? 'bg-primary' : 'bg-secondary'}`} />
                <span>{stage}</span>
              </div>
            ))}
          </div>
          {/* Desktop: Horizontal stages */}
          <div className="hidden sm:flex justify-between text-sm text-muted-foreground mt-2">
            <span>Introduced</span>
            <span>Committee</span>
            <span>One Chamber</span>
            <span>Both Chambers</span>
            <span>To President</span>
            <span>Signed</span>
            <span>Law</span>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div className="bg-card rounded-lg shadow-lg p-4 sm:p-8 mb-4 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-semibold mb-2 sm:mb-4">Summary</h2>
        <div className="prose prose-sm sm:prose-base max-w-none">
          {summary}
        </div>
      </div>

      {/* Sponsor Information */}
      <div className="bg-card rounded-lg shadow-lg p-4 sm:p-8">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6">Sponsor Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="space-y-1 sm:space-y-2">
            <h3 className="text-base sm:text-lg font-medium text-muted-foreground">Name</h3>
            <p className="text-lg sm:text-xl">{`${bill.sponsor_first_name} ${bill.sponsor_last_name}`}</p>
          </div>
          <div className="space-y-1 sm:space-y-2">
            <h3 className="text-base sm:text-lg font-medium text-muted-foreground">Party</h3>
            <p className="text-lg sm:text-xl">{partyName}</p>
          </div>
          <div className="space-y-1 sm:space-y-2">
            <h3 className="text-base sm:text-lg font-medium text-muted-foreground">State</h3>
            <p className="text-lg sm:text-xl">{stateName}</p>
          </div>
        </div>
      </div>

      {/* Additional Details */}
      <div className="mt-6 sm:mt-8 flex justify-end">
        <Link
          href="/bills"
          className="inline-flex w-full sm:w-auto items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-4"
        >
          Back to Bills
        </Link>
      </div>
    </main>
  );
} 