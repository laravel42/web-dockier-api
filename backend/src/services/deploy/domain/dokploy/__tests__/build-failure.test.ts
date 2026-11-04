import { describe, expect, it } from "vitest";

import { classifyBuildFailure } from "../stages/build-failure.js";
import type { RuntimeHint } from "../stages/trigger-deploy.js";

// A Nuxt app whose repo has no `start` script and for which we derived none —
// exactly the shape that used to produce the misleading start-command message.
const nuxtHint: RuntimeHint = {
  buildType: "railpack",
  framework: "nuxt",
  kind: "server",
  startCommandApplied: false,
  repoHasStartScript: false,
};

// Real railpack failure output, trimmed to the relevant lines.
const oomLog = `
Railpack 0.41.0

Steps
▸ install
  $ npm install

▸ build
  $ npm run build

Deploy
$ node .output/server/index.mjs

<--- Last few GCs --->
[1:0x7f8] 118456 ms: Mark-Compact 938.1 (960.4) -> 937.3 (960.4) MB

FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
Aborted (core dumped)
#22 ERROR: process "npm run build" did not complete successfully: exit code: 134
❌ Railpack build failed
`;

describe("classifyBuildFailure", () => {
  it("reports an out-of-memory build failure, not a missing start command", () => {
    const diagnosis = classifyBuildFailure(oomLog, nuxtHint);
    expect(diagnosis.kind).toBe("oom");
    expect(diagnosis.step).toBe("npm run build");
  });

  it("does not claim a missing start command when railpack resolved a deploy command", () => {
    const text = "Deploy\n$ node .output/server/index.mjs\nAn error have occurred: deploy failed";
    expect(classifyBuildFailure(text, nuxtHint).kind).not.toBe("missing-start");
  });

  it("still diagnoses a missing start command with no build error and no deploy command", () => {
    const text = "An error have occurred: Command failed with exit code 1";
    expect(classifyBuildFailure(text, nuxtHint).kind).toBe("missing-start");
  });

  it("treats a 137 exit (kernel OOM kill) as out of memory without heap text", () => {
    const text = '#22 ERROR: process "npm run build" did not complete successfully: exit code: 137';
    expect(classifyBuildFailure(text, nuxtHint).kind).toBe("oom");
  });

  it("lets build evidence outrank the platform-adapter hint", () => {
    const diagnosis = classifyBuildFailure(oomLog, { ...nuxtHint, platformAdapter: true });
    expect(diagnosis.kind).toBe("oom");
  });
});

// Real railpack output from a Laravel repo whose pnpm-workspace.yaml declares
// no `packages` field while its pnpm-lock.yaml pins pnpm 9. Trimmed.
const pnpmWorkspaceLog = `
#30 pnpm add -g node-gyp
#30 DONE 5.1s

#31 pnpm install --frozen-lockfile --prefer-offline
#31 0.810  ERROR  packages field missing or empty
#31 0.812 For help, run: pnpm help install
#31 ERROR: process "pnpm install --frozen-lockfile --prefer-offline" did not complete successfully: exit code: 1
❌ Railpack build failed
`;

describe("classifyBuildFailure — pnpm workspace manifest", () => {
  it("names the failing install step", () => {
    const diagnosis = classifyBuildFailure(pnpmWorkspaceLog, nuxtHint);
    expect(diagnosis.kind).toBe("pnpm-workspace");
    expect(diagnosis.step).toBe("pnpm install --frozen-lockfile --prefer-offline");
  });

  it("outranks the repo-shape heuristics, so it never reads as a missing start command", () => {
    // nuxtHint declares no start script, which is what used to win here.
    expect(classifyBuildFailure(pnpmWorkspaceLog, nuxtHint).kind).not.toBe("missing-start");
    expect(classifyBuildFailure(pnpmWorkspaceLog, { ...nuxtHint, platformAdapter: true }).kind).toBe(
      "pnpm-workspace",
    );
  });

  it("recognises pnpm's error code spelling as well as its message", () => {
    const text = "ERR_PNPM_INVALID_WORKSPACE_CONFIGURATION  Expected object but found array";
    expect(classifyBuildFailure(text, nuxtHint).kind).toBe("pnpm-workspace");
  });

  it("yields to out-of-memory evidence, which is the more immediate cause", () => {
    expect(classifyBuildFailure(`${pnpmWorkspaceLog}\n${oomLog}`, nuxtHint).kind).toBe("oom");
  });
});
