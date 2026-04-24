export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatMessageTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatLastSeen(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'last seen just now';
  if (diffMins < 60) return `last seen ${diffMins} min ago`;
  if (diffMins < 1440) return `last seen ${Math.floor(diffMins / 60)}h ago`;
  return `last seen ${d.toLocaleDateString()}`;
}
