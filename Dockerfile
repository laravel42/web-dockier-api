# ============================================================
# Dockier App Container
# Includes: Encore backend, React frontend (serve), PostgreSQL 18,
#           Semgrep CLI, seed data
# Traefik runs as a separate container (see docker-compose.yml)
# ============================================================

# ── Stage 1: Build frontend ──────────────────────────────────
FROM node:22-bookworm AS frontend-build

WORKDIR /build
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
COPY frontend/ .
RUN pnpm build

# ── Stage 2: Build backend ───────────────────────────────────
FROM node:22-bookworm AS backend-build

WORKDIR /build
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.json encore.app ./
COPY lib/ lib/
COPY auth/ auth/
COPY users/ users/
COPY roles/ roles/
COPY projects/ projects/
COPY deploy/ deploy/
COPY notifications/ notifications/
COPY integrations/ integrations/
COPY code-analysis/ code-analysis/
COPY git-integration/ git-integration/
COPY image-builder/ image-builder/
COPY prisma/ prisma/

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── Stage 3: Runtime ─────────────────────────────────────────
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Install Node.js 22, Python (for Semgrep), PostgreSQL 18, and utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    python3 \
    python3-pip \
    python3-venv \
    git \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm serve \
    && rm -rf /var/lib/apt/lists/*

# Encore CLI
RUN curl -L https://encore.dev/install.sh | bash \
    && ln -sf /root/.encore/bin/encore /usr/local/bin/encore

# PostgreSQL 18
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-18 postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*

# Semgrep CLI
RUN python3 -m venv /opt/semgrep \
    && /opt/semgrep/bin/pip install --no-cache-dir semgrep \
    && ln -s /opt/semgrep/bin/semgrep /usr/local/bin/semgrep

# Configure PostgreSQL
RUN echo "local all postgres trust" > /etc/postgresql/18/main/pg_hba.conf \
    && echo "host all all 127.0.0.1/32 trust" >> /etc/postgresql/18/main/pg_hba.conf \
    && echo "host all all ::1/128 trust" >> /etc/postgresql/18/main/pg_hba.conf \
    && echo "listen_addresses = 'localhost'" >> /etc/postgresql/18/main/postgresql.conf

WORKDIR /app

# Copy backend source + node_modules
COPY --from=backend-build /build/ /app/backend/

# Copy frontend dist
COPY --from=frontend-build /build/dist /app/frontend/dist

# Copy seed data and entrypoint
COPY docker/seed.sql docker/seed.sql
COPY docker/entrypoint.sh docker/entrypoint.sh

RUN chmod +x /app/docker/entrypoint.sh

# Backend API on 4000, Frontend static on 3000
EXPOSE 4000 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD curl -f http://localhost:4000 2>/dev/null || exit 1

ENTRYPOINT ["/app/docker/entrypoint.sh"]
