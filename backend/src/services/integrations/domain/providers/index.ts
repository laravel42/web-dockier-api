import type { PMProvider } from "../types.js";
import { asanaProvider } from "./asana.js";
import { basecampProvider } from "./basecamp.js";
import { clickupProvider } from "./clickup.js";
import { githubProvider } from "./github.js";
import { gitlabProvider } from "./gitlab.js";
import { jiraProvider } from "./jira.js";
import { linearProvider } from "./linear.js";
import { mondayProvider } from "./monday.js";
import { notionProvider } from "./notion.js";
import { todoistProvider } from "./todoist.js";

export const providers: Record<string, PMProvider> = {
  jira: jiraProvider,
  linear: linearProvider,
  asana: asanaProvider,
  clickup: clickupProvider,
  todoist: todoistProvider,
  monday: mondayProvider,
  notion: notionProvider,
  basecamp: basecampProvider,
  github: githubProvider,
  gitlab: gitlabProvider,
};
