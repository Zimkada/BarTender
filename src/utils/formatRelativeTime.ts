/**
 * Format a date as relative time (e.g., "il y a 5 min", "il y a 2 heures")
 * @param date - ISO date string or Date object
 * @returns Formatted relative time string
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const targetDate = typeof date === 'string' ? new Date(date) : date;

  // Calculate difference in milliseconds
  const diffMs = now.getTime() - targetDate.getTime();

  // If future date, return "à l'instant"
  if (diffMs < 0) {
    return "à l'instant";
  }

  // Convert to seconds
  const diffSeconds = Math.floor(diffMs / 1000);

  // Less than 1 minute
  if (diffSeconds < 60) {
    return "à l'instant";
  }

  // Less than 1 hour (show minutes)
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `il y a ${diffMinutes} min`;
  }

  // Less than 24 hours (show hours)
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
  }

  // Less than 7 days (show days)
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  }

  // Less than 4 weeks (show weeks)
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) {
    return `il y a ${diffWeeks} semaine${diffWeeks > 1 ? 's' : ''}`;
  }

  // Less than 12 months (show months)
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `il y a ${diffMonths} mois`;
  }

  // Show years
  const diffYears = Math.floor(diffDays / 365);
  return `il y a ${diffYears} an${diffYears > 1 ? 's' : ''}`;
}
