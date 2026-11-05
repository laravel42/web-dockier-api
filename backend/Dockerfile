# Build from repo root: docker build -f backend/Dockerfile -t dockier-api .
# rebuild: 2026-06-10 — env sync restart
FROM node:22-bookworm-slim AS base

# semgrep is pinned: it is the scan engine the product ships, so an unpinned
# install makes every rebuild a silent upgrade and an upstream regression
# arrives on its own. Keep in step with the root package.json postinstall.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 python3-pip git ca-certificates curl unzip \
  && pip3 install semgrep==1.160.0 --break-system-packages \
  && rm -rf /var/lib/apt/lists/*

# sonar-scanner, for the same reason semgrep is here: runSonarScanner() shells
# out to this binary, and findSonarScanner() returns null without it — so the
# SonarQube branch logs "binary not found, skipping" and reports zero findings.
# Silently, as a passing scan. The engine would then work only on a developer
# machine that happens to have it installed.
#
# Pinned for the same reason as semgrep. The CLI embeds its own JRE, so this
# needs no Java in the image. TARGETARCH is set by buildkit; the two values map
# onto SonarSource's artifact names, which differ from Docker's.
ARG TARGETARCH
ARG SONAR_SCANNER_VERSION=8.3.1.16491
RUN set -eu; \
  case "${TARGETARCH:-amd64}" in \
    amd64) sonar_arch=linux-x64 ;; \
    arm64) sonar_arch=linux-aarch64 ;; \
    *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL -o /tmp/sonar-scanner.zip \
    "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SONAR_SCANNER_VERSION}-${sonar_arch}.zip"; \
  unzip -q /tmp/sonar-scanner.zip -d /opt; \
  mv "/opt/sonar-scanner-${SONAR_SCANNER_VERSION}-${sonar_arch}" /opt/sonar-scanner; \
  rm /tmp/sonar-scanner.zip; \
  ln -s /opt/sonar-scanner/bin/sonar-scanner /usr/local/bin/sonar-scanner; \
  sonar-scanner --version

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
# Must match `packageManager` in the root package.json. A mismatch only breaks
# in here, not locally: the lockfile is installed with --frozen-lockfile, so a
# pnpm version that writes a different lockfile format fails the image build
# while every local install keeps working.
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY backend/package.json ./backend/

RUN pnpm install --filter @dockier/backend-fastify --frozen-lockfile

COPY backend ./backend
COPY code-analysis ./code-analysis

WORKDIR /app/backend
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "dist/server.js"]
