/**
 * Formats a date string to a localized format
 * @param dateString - The date string to format
 * @returns Formatted date string in the format "Month Day, Year"
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00Z');
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
} 