import type { PMProvider } from "../types.js";
import { jiraProvider } from "./jira.js";
import { linearProvider } from "./linear.js";

// Only what PM_PROVIDERS accepts: a stored integration is the only way to reach a provider.
export const providers: Record<string, PMProvider> = {
  jira: jiraProvider,
  linear: linearProvider,
};
