/** Matches DeployCard timestamp formatting. */
export const CARD_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function formatCardDateTime(value: string | Date | number): string {
  return new Date(value).toLocaleString(undefined, CARD_DATE_TIME_OPTIONS);
}
