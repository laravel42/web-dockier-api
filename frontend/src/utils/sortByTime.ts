type Timestamped = { createdAt: string; updatedAt?: string };

export function getSortTimestamp(item: Timestamped, field: "created" | "updated"): number {
  const raw = field === "updated" ? (item.updatedAt ?? item.createdAt) : item.createdAt;
  return new Date(raw).getTime();
}

export function compareByTime(a: Timestamped, b: Timestamped, field: "created" | "updated"): number {
  // Negative when `a` is newer — use as `.sort((a, b) => compareByTime(a, b, field))` for newest first.
  return getSortTimestamp(b, field) - getSortTimestamp(a, field);
}
