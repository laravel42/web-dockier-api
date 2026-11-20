// Only providers the backend stores (encrypted, per organization). A catalog entry without a backend
// would collect secrets that nothing uses, so do not add one until the service supports it.

export interface IntegrationDef {
  type: string;
  name: string;
  category: string;
  description: string;
  fields: Array<{ key: string; label: string; placeholder: string; secret?: boolean; options?: "dynamic" | Array<{ value: string; label: string }> }>;
}

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  { type: "jira", name: "Jira", category: "Project Management", description: "Issue tracking and project management", fields: [{ key: "host", label: "Jira URL", placeholder: "https://myorg.atlassian.net" }, { key: "email", label: "Email", placeholder: "user@example.com" }, { key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }] },
  { type: "linear", name: "Linear", category: "Project Management", description: "Issue tracking for modern software teams", fields: [{ key: "apiKey", label: "API Key", placeholder: "lin_api_••••••", secret: true }] },
];

const categoryBadgeBase =
  "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium shrink-0";

/** Dark-mode-friendly tone badges for integration catalog categories. */
export const CATEGORY_COLORS: Record<string, string> = {
  "Project Management": `${categoryBadgeBase} border-violet-500/45 bg-violet-500/30 text-violet-300`,
};

export function categoryBadgeCls(category: string): string {
  return (
    CATEGORY_COLORS[category] ??
    `${categoryBadgeBase} border-border/60 bg-secondary-50/30 text-text-muted`
  );
}
