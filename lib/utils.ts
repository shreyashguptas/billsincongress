import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  
  // Use UTC to ensure consistent rendering between server and client
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
} 