import type { RepoConfig } from "../types.js";

export function generateGoDockerfile(config: RepoConfig): string {
  const goVer = config.goVersion || "1.22";
  const lines: string[] = [];

  lines.push(`FROM public.ecr.aws/docker/library/golang:${goVer}-alpine AS builder`);
  lines.push("WORKDIR /app");
  lines.push("COPY go.mod go.sum* ./");
  lines.push("RUN go mod download");
  lines.push("COPY . .");
  lines.push("RUN CGO_ENABLED=0 go build -o app .");

  lines.push("");
  lines.push("FROM public.ecr.aws/docker/library/alpine:latest");
  lines.push("RUN apk --no-cache add ca-certificates");
  lines.push("WORKDIR /app");
  lines.push("COPY --from=builder /app/app .");
  lines.push(`ENV PORT=${config.port}`);
  lines.push(`EXPOSE ${config.port}`);
  lines.push('CMD ["./app"]');

  return lines.join("\n") + "\n";
}
