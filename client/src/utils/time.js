// "Updated 2 min ago" style relative times.
export function timeAgo(date, now = Date.now()) {
  if (!date) return 'unknown';
  const seconds = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
