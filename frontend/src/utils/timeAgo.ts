const HAS_TIMEZONE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

/** Parse API/Postgres timestamps as UTC when no timezone is present. */
export function parseApiTimestamp(dateStr: string): Date {
  const trimmed = dateStr.trim();
  if (!trimmed) return new Date(Number.NaN);

  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return new Date(n < 1e12 ? n * 1000 : n);
  }

  let normalized = trimmed.includes(" ") && !trimmed.includes("T")
    ? trimmed.replace(" ", "T")
    : trimmed;

  const shortOffset = normalized.match(/([+-]\d{2})$/);
  if (shortOffset) {
    normalized = `${normalized.slice(0, -shortOffset[1].length)}${shortOffset[1]}:00`;
  } else if (!HAS_TIMEZONE.test(normalized)) {
    normalized = `${normalized}Z`;
  }

  return new Date(normalized);
}

/** Relative time label, e.g. "3m ago", "2d ago". */
export function timeAgo(dateStr: string): string {
  if (!dateStr) return "";

  const date = parseApiTimestamp(dateStr);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "";

  const diff = Date.now() - ms;
  if (diff < 0) {
    if (diff > -60_000) return "just now";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";

  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
