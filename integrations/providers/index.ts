import type { PMProvider } from "../types";
import { jiraProvider } from "./jira";
import { linearProvider } from "./linear";
import { asanaProvider } from "./asana";
import { clickupProvider } from "./clickup";
import { todoistProvider } from "./todoist";
import { mondayProvider } from "./monday";
import { notionProvider } from "./notion";
import { basecampProvider } from "./basecamp";
import { githubProvider } from "./github";
import { gitlabProvider } from "./gitlab";

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
