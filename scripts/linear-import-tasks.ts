#!/usr/bin/env tsx
/**
 * Import the critique remediation tasks into Linear.
 *
 * Reads docs/delivery/critique-remediation-tasks.md, creates one issue per task
 * in the target project, applies the agent/domain labels, and — the part that
 * pasting cannot do — wires the blocks/blocked-by relations from the dependency
 * lines, so nobody picks up A2 before A3 has landed.
 *
 *   pnpm linear:import                        # dry run: prints what it would create
 *   pnpm linear:import --apply                # create the issues
 *   pnpm linear:import --set Done A1 A2 A3    # move existing issues to a state
 *
 * Requires LINEAR_API_KEY (Linear → Settings → Security & access → Personal API keys).
 * Idempotent: an issue whose title already exists in the project is skipped, so a
 * partial run can be resumed safely.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.linear.app/graphql";
const PROJECT_SLUG_ID = "fa524631fcdd";
const TASKS_MD = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/delivery/critique-remediation-tasks.md",
);

const APPLY = process.argv.includes("--apply");

/** `--set <StateName> <TaskId...>` moves already-imported issues to a workflow state. */
const setIdx = process.argv.indexOf("--set");
const SET_STATE = setIdx !== -1 ? process.argv[setIdx + 1] : null;
const SET_IDS = setIdx !== -1 ? process.argv.slice(setIdx + 2).filter((a) => /^[A-G]\d$/.test(a)) : [];
const KEY = process.env.LINEAR_API_KEY;

interface Task {
  id: string;           // "A1"
  title: string;        // "Define the blast-radius tier contract"
  epic: string;         // "A — Destructive actions carry no guardrails"
  body: string;         // full markdown body for the Linear description
  agent: string;        // cursor | claude | openai
  dependsOn: string[];  // ["A1", "A3"]
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: KEY! },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  if (!json.data) throw new Error(`No data returned (HTTP ${res.status})`);
  return json.data;
}

/** Split the markdown into tasks. Headings are `## A1 — Title` under `# EPIC X — …`. */
function parseTasks(md: string): Task[] {
  const lines = md.split("\n");
  const tasks: Task[] = [];
  let epic = "";
  let current: { id: string; title: string; buf: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.buf.join("\n").trim();
    const agent = /^### Agent\s*\n+([^\n]+)/m.exec(body)?.[1]?.trim() ?? "cursor";
    const dependsRaw = /^### Depends on\s*\n+([\s\S]*?)(?=\n### |\n---|\n# |$)/m.exec(body)?.[1] ?? "";
    const dependsOn = [...dependsRaw.matchAll(/\b([A-G]\d)\b/g)].map((m) => m[1]!);
    tasks.push({ ...current, epic, body, agent, dependsOn: [...new Set(dependsOn)] });
    current = null;
  };

  for (const line of lines) {
    const epicMatch = /^# EPIC (.+)$/.exec(line);
    if (epicMatch) { flush(); epic = epicMatch[1]!.trim(); continue; }

    const taskMatch = /^## ([A-G]\d)\s+[—-]\s+(.+)$/.exec(line);
    if (taskMatch) { flush(); current = { id: taskMatch[1]!, title: taskMatch[2]!.trim(), buf: [] }; continue; }

    if (current) current.buf.push(line);
  }
  flush();
  return tasks;
}

function labelsFor(task: Task): string[] {
  const out = [`agent:${task.agent.split(/[\s(]/)[0]}`];
  const epicLetter = task.epic[0];
  // Domain labels mirror the playbook: ux / backend / testing.
  if (epicLetter === "D") out.push("backend");
  else if (epicLetter === "G") out.push("testing");
  else out.push("ux");
  return out;
}

async function main() {
  const tasks = parseTasks(readFileSync(TASKS_MD, "utf8"));
  if (tasks.length === 0) throw new Error("Parsed 0 tasks — check the markdown headings");

  console.log(`Parsed ${tasks.length} tasks across ${new Set(tasks.map((t) => t.epic)).size} epics`);
  const edges = tasks.flatMap((t) => t.dependsOn.map((d) => `${d} → ${t.id}`));
  console.log(`Dependency edges: ${edges.length}\n  ${edges.join("\n  ")}\n`);

  if (!APPLY && !SET_STATE) {
    for (const t of tasks) {
      console.log(`  [${t.id}] ${t.title}`);
      console.log(`        labels: ${labelsFor(t).join(", ")}${t.dependsOn.length ? ` · blocked by ${t.dependsOn.join(", ")}` : ""}`);
    }
    console.log(`\nDry run. Nothing created. Re-run with --apply to write to Linear.`);
    return;
  }

  if (!KEY) throw new Error("LINEAR_API_KEY is not set");

  // Linear scores query complexity as roughly page-size x nesting, so every read
  // below is kept flat and small and paginated rather than fetched in one shot.
  type Proj = { id: string; name: string; url: string };
  let project: Proj | undefined;
  let cursor: string | null = null;
  do {
    const page: { projects: { nodes: Proj[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
      await gql(
        `query($after:String){ projects(first:50, after:$after){ nodes { id name url } pageInfo { hasNextPage endCursor } } }`,
        { after: cursor },
      );
    project = page.projects.nodes.find((p) => p.url.includes(PROJECT_SLUG_ID));
    cursor = page.projects.pageInfo.hasNextPage ? page.projects.pageInfo.endCursor : null;
  } while (!project && cursor);
  if (!project) throw new Error(`No project matching ${PROJECT_SLUG_ID}`);

  // Team comes from a separate single-project read rather than nesting into the list.
  const { project: projTeams } = await gql<{ project: { teams: { nodes: { id: string; key: string }[] } } }>(
    `query($id:String!){ project(id:$id){ teams(first:1){ nodes { id key } } } }`,
    { id: project.id },
  );
  const team = projTeams.teams.nodes[0];
  if (!team) throw new Error(`Project ${project.name} has no team`);
  const teamId = team.id;
  console.log(`Project: ${project.name}\nTeam:    ${team.key}\n`);

  // ── `--set` path: move existing issues and exit before any creation. ──
  if (SET_STATE) {
    if (SET_IDS.length === 0) throw new Error("--set needs a state name and at least one task id, e.g. --set Done A1 A2");

    const { team: teamStates } = await gql<{ team: { states: { nodes: { id: string; name: string }[] } } }>(
      `query($id:String!){ team(id:$id){ states(first:50){ nodes { id name } } } }`,
      { id: teamId },
    );
    const target = teamStates.states.nodes.find((st) => st.name.toLowerCase() === SET_STATE.toLowerCase());
    if (!target) {
      throw new Error(`No state "${SET_STATE}". Available: ${teamStates.states.nodes.map((st) => st.name).join(", ")}`);
    }

    const byId = new Map<string, string>();
    let c: string | null = null;
    do {
      const page: { issues: { nodes: { id: string; title: string; identifier: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
        await gql(
          `query($id:ID!,$after:String){ issues(filter:{project:{id:{eq:$id}}}, first:50, after:$after){ nodes { id title identifier } pageInfo { hasNextPage endCursor } } }`,
          { id: project.id, after: c },
        );
      for (const i of page.issues.nodes) {
        const m = /^\[([A-G]\d)\]/.exec(i.title);
        if (m) byId.set(m[1]!, i.id);
      }
      c = page.issues.pageInfo.hasNextPage ? page.issues.pageInfo.endCursor : null;
    } while (c);

    for (const id of SET_IDS) {
      const issueId = byId.get(id);
      if (!issueId) { console.warn(`  ! ${id} not found in the project`); continue; }
      await gql(
        `mutation($id:String!,$stateId:String!){ issueUpdate(id:$id, input:{stateId:$stateId}){ success } }`,
        { id: issueId, stateId: target.id },
      );
      console.log(`  → ${id} set to ${target.name}`);
    }
    console.log(`\nDone: ${SET_IDS.length} issue(s) moved to ${target.name}.`);
    return;
  }

  // Labels scoped to the team, paginated.
  const labelId = new Map<string, string>();
  cursor = null;
  do {
    const page: { team: { labels: { nodes: { id: string; name: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } } =
      await gql(
        `query($id:String!,$after:String){ team(id:$id){ labels(first:50, after:$after){ nodes { id name } pageInfo { hasNextPage endCursor } } } }`,
        { id: teamId, after: cursor },
      );
    for (const l of page.team.labels.nodes) labelId.set(l.name, l.id);
    cursor = page.team.labels.pageInfo.hasNextPage ? page.team.labels.pageInfo.endCursor : null;
  } while (cursor);
  for (const name of new Set(tasks.flatMap(labelsFor))) {
    if (labelId.has(name)) continue;
    const { issueLabelCreate } = await gql<{ issueLabelCreate: { issueLabel: { id: string } } }>(
      `mutation($teamId:String!,$name:String!){ issueLabelCreate(input:{teamId:$teamId,name:$name}){ issueLabel { id } } }`,
      { teamId, name },
    );
    labelId.set(name, issueLabelCreate.issueLabel.id);
    console.log(`  + label ${name}`);
  }

  // Skip anything already imported so a partial run can be resumed.
  const existing = new Map<string, string>();
  cursor = null;
  do {
    const page: { issues: { nodes: { id: string; title: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
      await gql(
        `query($id:ID!,$after:String){ issues(filter:{project:{id:{eq:$id}}}, first:50, after:$after){ nodes { id title } pageInfo { hasNextPage endCursor } } }`,
        { id: project.id, after: cursor },
      );
    for (const i of page.issues.nodes) existing.set(i.title, i.id);
    cursor = page.issues.pageInfo.hasNextPage ? page.issues.pageInfo.endCursor : null;
  } while (cursor);

  const created = new Map<string, string>(); // task id -> issue id
  for (const t of tasks) {
    const title = `[${t.id}] ${t.title}`;
    if (existing.has(title)) {
      created.set(t.id, existing.get(title)!);
      console.log(`  = ${title} (already exists)`);
      continue;
    }
    const description = `> Epic ${t.epic}\n> Source: \`/impeccable critique\` snapshot in \`frontend/.impeccable/critique/\`\n\n${t.body}`;
    const { issueCreate } = await gql<{ issueCreate: { issue: { id: string; identifier: string } } }>(
      `mutation($input:IssueCreateInput!){ issueCreate(input:$input){ issue { id identifier } } }`,
      { input: { teamId, projectId: project.id, title, description, labelIds: labelsFor(t).map((n) => labelId.get(n)).filter(Boolean) } },
    );
    created.set(t.id, issueCreate.issue.id);
    console.log(`  + ${issueCreate.issue.identifier}  ${title}`);
  }

  // Relations last: every issue must exist before it can block another.
  let relations = 0;
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      const blocker = created.get(dep);
      const blocked = created.get(t.id);
      if (!blocker || !blocked) { console.warn(`  ! skipped relation ${dep} → ${t.id} (missing issue)`); continue; }
      await gql(
        `mutation($id:String!,$related:String!){ issueRelationCreate(input:{issueId:$id,relatedIssueId:$related,type:blocks}){ success } }`,
        { id: blocker, related: blocked },
      );
      relations++;
      console.log(`  ↳ ${dep} blocks ${t.id}`);
    }
  }

  console.log(`\nDone: ${created.size} issues, ${relations} dependency relations.`);
}

main().catch((err: unknown) => {
  console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
