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
  I: 'Independent'
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

  // Calculate progress percentage based on status
  const getProgressPercentage = (status: string): number => {
    const stages = [
      'Introduced',
      'In Committee',
      'Passed One Chamber',
      'Passed Both Chambers',
      'To President',
      'Signed by President',
      'Became Law'
    ] as const;
    const currentIndex = stages.indexOf(status as typeof stages[number]);
    return currentIndex >= 0 ? ((currentIndex + 1) / stages.length) * 100 : 0;
  };

  const progressPercentage = getProgressPercentage(bill.progress_description);
  const stateName = STATE_NAMES[bill.sponsor_state as keyof typeof STATE_NAMES] || bill.sponsor_state;
  const partyName = PARTY_NAMES[bill.sponsor_party as keyof typeof PARTY_NAMES] || bill.sponsor_party;

  return (
    <main className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header Section */}
      <div className="bg-card rounded-lg shadow-lg p-8 mb-8">
        <h1 className="text-4xl font-bold mb-4 text-primary">{bill.title}</h1>
        <div className="text-muted-foreground mb-4">
          Introduced on {new Date(bill.introduced_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </div>
      </div>

      {/* Status Section */}
      <div className="bg-card rounded-lg shadow-lg p-8 mb-8">
        <h2 className="text-2xl font-semibold mb-6">Current Status</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-medium">{bill.progress_description}</span>
            <span className="text-muted-foreground">{progressPercentage.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-4 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 ease-in-out rounded-full"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-muted-foreground mt-2">
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
      <div className="bg-card rounded-lg shadow-lg p-8 mb-8">
        <h2 className="text-2xl font-semibold mb-4">Summary</h2>
        <div className="prose prose-lg max-w-none">
          {summary}
        </div>
      </div>

      {/* Sponsor Information */}
      <div className="bg-card rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-semibold mb-6">Sponsor Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-muted-foreground">Name</h3>
            <p className="text-xl">{`${bill.sponsor_first_name} ${bill.sponsor_last_name}`}</p>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-muted-foreground">Party</h3>
            <p className="text-xl">{partyName}</p>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-muted-foreground">State</h3>
            <p className="text-xl">{stateName}</p>
          </div>
        </div>
      </div>

      {/* Additional Details */}
      <div className="mt-8 flex justify-end">
        <Link
          href="/bills"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-4"
        >
          Back to Bills
        </Link>
      </div>
    </main>
  );
} 