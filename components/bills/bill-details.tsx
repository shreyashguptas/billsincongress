'use client';

import Link from 'next/link';
import type { Bill } from '@/lib/types/bill';
import { useEffect, useState } from 'react';
import { getStageDescription, getStagePercentage, getProgressDots } from '@/lib/utils/bill-stages';

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

  // Convert progress_stage to number
  const progressStage = typeof bill.progress_stage === 'string' 
    ? parseInt(bill.progress_stage, 10) 
    : bill.progress_stage;

  // Get stage information using utility functions
  const progressPercentage = getStagePercentage(progressStage);
  const displayDescription = getStageDescription(progressStage);
  const progressDots = getProgressDots(progressStage);

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
    <main className="container mx-auto px-4 py-4 sm:py-6 max-w-5xl">
      {/* Header Section */}
      <div className="bg-card rounded-lg shadow-lg p-4 sm:p-6 mb-3 sm:mb-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-xl sm:text-3xl font-semibold text-primary leading-tight">{bill.title}</h1>
          {bill.pdf_url && (
            <a
              href={bill.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-file-text"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" x2="8" y1="13" y2="13" />
                <line x1="16" x2="8" y1="17" y2="17" />
                <line x1="10" x2="8" y1="9" y2="9" />
              </svg>
              PDF
            </a>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          Introduced on {formatDate(bill.introduced_date)}
        </div>
      </div>

      {/* Status Section */}
      <div className="bg-card rounded-lg shadow-lg p-4 sm:p-6 mb-3 sm:mb-4">
        <h2 className="text-lg sm:text-xl font-semibold mb-4">Current Status</h2>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <span className="text-base font-medium">{displayDescription}</span>
            <span className="text-sm text-muted-foreground">{progressPercentage}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 ease-in-out rounded-full"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          {/* Mobile: Vertical stages */}
          <div className="block sm:hidden space-y-2 text-xs text-muted-foreground mt-2">
            {progressDots.map(({ stage, isComplete }) => (
              <div key={stage} className="flex items-center">
                <div className={`w-1.5 h-1.5 rounded-full mr-2 ${isComplete ? 'bg-primary' : 'bg-secondary'}`} />
                <span>{stage}</span>
              </div>
            ))}
          </div>
          {/* Desktop: Horizontal stages */}
          <div className="hidden sm:flex justify-between text-xs text-muted-foreground">
            {progressDots.map(({ stage }) => (
              <span key={stage}>{stage}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div className="bg-card rounded-lg shadow-lg p-4 sm:p-6 mb-3 sm:mb-4">
        <h2 className="text-lg sm:text-xl font-semibold mb-3">Summary</h2>
        <div className="prose prose-sm max-w-none text-base leading-relaxed text-muted-foreground">
          {summary}
        </div>
      </div>

      {/* Sponsor Information */}
      <div className="bg-card rounded-lg shadow-lg p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold mb-4">Sponsor Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Name</h3>
            <p className="text-base">{`${bill.sponsor_first_name} ${bill.sponsor_last_name}`}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Party</h3>
            <p className="text-base">{partyName}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">State</h3>
            <p className="text-base">{stateName}</p>
          </div>
        </div>
      </div>
    </main>
  );
} 