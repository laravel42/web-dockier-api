"""
Resolve what to clone, and with which credentials, from the database.

The intake payload is `{scanId, tenantId, options, correlationId}` — it carries
no clone URL. The TypeScript worker reads the repo and branch from the `scans`
row and the token from `git_connections` scoped to the tenant, and this must do
the same or it cannot consume the same queue.
"""

from typing import Any, Dict, Optional
from urllib.parse import quote, urlparse, urlunparse

from src.infrastructure.db_client import fetch_row

DEFAULT_ENDPOINTS = {
    "github": "https://github.com",
    "gitlab": "https://gitlab.com",
    "bitbucket": "https://bitbucket.org",
}

# Each provider wants the token presented differently in an https clone URL.
TOKEN_USERNAMES = {
    "github": "x-access-token",
    "gitlab": "oauth2",
    "bitbucket": "x-token-auth",
}


async def get_scan_target(scan_id: str) -> Optional[Dict[str, Any]]:
    row = await fetch_row(
        "SELECT id, organization_id, project_id, connection_id, repo, branch, commit_sha "
        "FROM scans WHERE id = $1",
        scan_id,
    )
    return dict(row) if row else None


async def get_connection(connection_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
    """Fetch clone credentials, scoped to the tenant.

    The tenant filter is not decoration: without it a caller who guessed a
    connection id could clone another organization's private repository.
    """
    row = await fetch_row(
        "SELECT id, provider, personal_token, endpoint FROM git_connections "
        "WHERE id = $1 AND organization_id = $2",
        connection_id, tenant_id,
    )
    return dict(row) if row else None


def build_clone_url(provider: str, endpoint: str, repo: str, token: Optional[str]) -> str:
    """Compose an https clone URL, embedding the token as the provider expects.

    The token is percent-encoded: PATs can contain characters that would
    otherwise terminate the userinfo section and produce a malformed URL.
    """
    base = (endpoint or DEFAULT_ENDPOINTS.get(provider, "")).rstrip("/")
    if not base:
        raise ValueError(f"No endpoint configured for provider {provider!r}")

    repo_path = repo.strip("/")
    if not repo_path.endswith(".git"):
        repo_path += ".git"

    parsed = urlparse(f"{base}/{repo_path}")
    if parsed.scheme != "https":
        raise ValueError(f"Refusing non-https clone endpoint: {base!r}")

    if token:
        username = TOKEN_USERNAMES.get(provider, "x-access-token")
        parsed = parsed._replace(netloc=f"{username}:{quote(token, safe='')}@{parsed.netloc}")

    return urlunparse(parsed)


async def resolve_clone_url(scan: Dict[str, Any], tenant_id: str) -> str:
    connection = await get_connection(scan["connection_id"], tenant_id)
    if connection is None:
        raise ValueError(
            f"git connection {scan['connection_id']!r} not found for tenant {tenant_id!r}"
        )
    return build_clone_url(
        connection["provider"], connection["endpoint"], scan["repo"], connection["personal_token"]
    )
