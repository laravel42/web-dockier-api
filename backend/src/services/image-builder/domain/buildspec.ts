import type { BuildInput } from "./orchestrator.js";

type BuildspecInput = Pick<BuildInput, "dockerfilePath" | "buildContext" | "tags" | "imageRepo"> & {
  runtime: string;
  sourceRef: string;
};

function sanitizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 128);
}

export function createBuildspecPreview(input: BuildspecInput): string {
  const dockerfilePath = input.dockerfilePath || "Dockerfile";
  const buildContext = input.buildContext || ".";
  const tags = input.tags && input.tags.length > 0 ? input.tags.map((tag) => sanitizeTag(tag)) : ["latest"];

  const buildCommands = tags.map((tag) => `docker build -f ${dockerfilePath} -t ${input.imageRepo}:${tag} ${buildContext}`);
  const pushCommands = tags.map((tag) => `docker push ${input.imageRepo}:${tag}`);

  return [
    "version: 0.2",
    "phases:",
    "  install:",
    "    commands:",
    `      - echo \"Preparing ${input.runtime} build for ref ${input.sourceRef}\"`,
    "      - docker --version",
    "  build:",
    "    commands:",
    ...buildCommands.map((line) => `      - ${line}`),
    "  post_build:",
    "    commands:",
    ...pushCommands.map((line) => `      - ${line}`),
    "artifacts:",
    "  files:",
    "    - '**/*'",
  ].join("\n");
}
