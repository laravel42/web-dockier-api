# Build from repo root: docker build -f backend/Dockerfile -t dockier-api .
# rebuild: 2026-06-10 — env sync restart
FROM node:22-bookworm-slim AS base

# semgrep is pinned: it is the scan engine the product ships, so an unpinned
# install makes every rebuild a silent upgrade and an upstream regression
# arrives on its own. Keep in step with the root package.json postinstall.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 python3-pip git ca-certificates curl \
  && pip3 install semgrep==1.160.0 --break-system-packages \
  && rm -rf /var/lib/apt/lists/*

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
