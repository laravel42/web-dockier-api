// ─── Go Stack Detection & Dockerfile Generator ───

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DetectedStack } from "./types";

export function detectGo(appDir: string, subDir: string): Extract<DetectedStack, { runtime: "go" }> | null {
  if (!existsSync(join(appDir, "go.mod"))) return null;
  return { runtime: "go", subDir };
}

export function goDockerfile(repoDir: string): string {
  let goVer = "1.22";
  try {
    const goMod = readFileSync(join(repoDir, "go.mod"), "utf-8");
    const m = goMod.match(/^go\s+(\d+\.\d+)/m);
    if (m) goVer = m[1];
  } catch {}

  return [
    `FROM public.ecr.aws/docker/library/golang:${goVer}-alpine AS builder`,
    "WORKDIR /app",
    "COPY go.mod go.sum* ./",
    "RUN go mod download",
    "COPY . .",
    "RUN CGO_ENABLED=0 go build -o app .",
    "",
    "FROM public.ecr.aws/docker/library/alpine:3.19",
    "RUN apk --no-cache add ca-certificates",
    "WORKDIR /app",
    "COPY --from=builder /app/app .",
    "ENV PORT=8080",
    "EXPOSE 8080",
    'CMD ["./app"]',
    "",
  ].join("\n");
}
