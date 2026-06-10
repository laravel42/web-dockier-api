# Build from repo root: docker build -f backend/Dockerfile -t dockier-api .
FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 python3-pip git ca-certificates curl \
  && pip3 install semgrep --break-system-packages \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
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
