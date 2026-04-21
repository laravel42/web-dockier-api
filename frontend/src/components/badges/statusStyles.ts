export const STATUS_STYLES: Record<string, string> = {
  success:   "bg-emerald-500/15 text-emerald-400",
  failed:    "bg-red-500/15 text-red-400",
  building:  "bg-amber-500/15 text-amber-400",
  deploying: "bg-blue-500/15 text-blue-400",
  pending:   "bg-gray-500/15 text-gray-400",
  destroyed: "bg-gray-500/10 text-gray-500",
};

export function getStatusColor(status: string): string {
  return STATUS_STYLES[status] || STATUS_STYLES.pending;
}
