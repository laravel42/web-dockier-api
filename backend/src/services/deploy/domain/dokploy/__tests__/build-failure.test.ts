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
