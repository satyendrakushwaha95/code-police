export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + '...';
}

export function generateTitle(firstMessage: string): string {
  // Generate a conversation title from the first user message
  const clean = firstMessage.replace(/\n/g, ' ').trim();
  return truncateText(clean, 50) || 'New Chat';
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function classNames(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
