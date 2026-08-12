# Dockier SAST workers.
#
# Build context is `code-analysis/`, not `code-analysis/workers/`, because the
# image needs the Opengrep rule corpus in `code-analysis/rules/` alongside the
# worker source:
#
#     docker build -f workers/Dockerfile code-analysis/
#
# The point of containerising this is containment, not packaging. The engines
# (semgrep, sonar-scanner, codeql) execute against source from repositories the
# platform does not control, so the image holds as little of value as possible:
# no cloud credentials, a non-root user, and writable state confined to one
# scratch directory. See docker-compose.yml for the runtime restrictions.
#
# Engine binaries live in their own stage so a Python dependency bump does not
# re-download ~500MB of CodeQL.

# ── Stage 1: engine binaries ───────────────────────────────────────────────
FROM debian:bookworm-slim AS engines

ARG CODEQL_BUNDLE_TAG=codeql-bundle-v2.20.3
ARG SONAR_SCANNER_VERSION=6.2.1.4610

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl unzip tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

# The bundle ships the CLI plus the standard query packs, so `database analyze`
# can resolve `codeql/<lang>-queries` without a network fetch at scan time.
RUN set -eux; \
    curl -fsSL -o codeql-bundle.tar.gz \
      "https://github.com/github/codeql-action/releases/download/${CODEQL_BUNDLE_TAG}/codeql-bundle-linux64.tar.gz"; \
    tar -xzf codeql-bundle.tar.gz; \
    rm codeql-bundle.tar.gz; \
    test -x /opt/codeql/codeql

RUN set -eux; \
    curl -fsSL -o sonar.zip \
      "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SONAR_SCANNER_VERSION}-linux-x64.zip"; \
    unzip -q sonar.zip; \
    mv "sonar-scanner-${SONAR_SCANNER_VERSION}-linux-x64" /opt/sonar-scanner; \
    rm sonar.zip; \
    test -x /opt/sonar-scanner/bin/sonar-scanner

# ── Stage 2: python dependencies ───────────────────────────────────────────
FROM python:3.11-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY workers/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 3: runtime ───────────────────────────────────────────────────────
FROM python:3.11-slim

# git to clone; a JRE because both sonar-scanner and CodeQL's extractors need one.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates git openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /usr/sbin/nologin --uid 10001 scanner

COPY --from=deps /install /usr/local
COPY --from=engines /opt/codeql /opt/codeql
COPY --from=engines /opt/sonar-scanner /opt/sonar-scanner

ENV PATH="/opt/codeql:/opt/sonar-scanner/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/home/scanner \
    TMPDIR=/scratch \
    OPENGREP_RULES_DIR=/opt/dockier-rules/opengrep

WORKDIR /app
COPY --chown=scanner:scanner workers/src/ ./src/
COPY --chown=scanner:scanner rules/ /opt/dockier-rules/

# Every path the process writes to. Everything else can be mounted read-only.
RUN mkdir -p /scratch && chown scanner:scanner /scratch /home/scanner

USER scanner

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/sast/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
