export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'N/A';
  }

  // Parse the date in UTC to avoid timezone shifts
  const date = new Date(dateString + 'T00:00:00Z');
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date);
} 