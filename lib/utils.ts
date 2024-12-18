import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Cleans sponsor name by removing bracketed information
 * Example: "Rep. McCarthy, Kevin (R-CA-20)" -> "Rep. McCarthy, Kevin"
 */
export function cleanSponsorName(name: string): string {
  return name.replace(/\s*\([^)]*\)/, '').trim();
}

/**
 * Expands bill type abbreviation to full name
 * Keeps original abbreviation for ID purposes
 */
export const BILL_TYPE_EXPANSIONS: Record<string, string> = {
  'hr': 'House Bill',
  's': 'Senate Bill',
  'hjres': 'House Joint Resolution',
  'sjres': 'Senate Joint Resolution',
  'hconres': 'House Concurrent Resolution',
  'sconres': 'Senate Concurrent Resolution',
  'hres': 'House Simple Resolution',
  'sres': 'Senate Simple Resolution'
};

export function expandBillType(type: string): string {
  return BILL_TYPE_EXPANSIONS[type.toLowerCase()] || type;
}
