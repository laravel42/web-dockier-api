"""
Per-tenant engine configuration, read from and written to `engine_settings`.

The engines previously took their configuration from the process environment,
which meant a host or a timeout was a deploy decision rather than a tenant one.
It is now stored per tenant.

Two rules this module enforces, because the alternative fails quietly:

  * **Defaults are complete.** A tenant with no row gets a fully-populated
    settings object, never a partial one. Half-configured settings would surface
    as an engine silently skipping work.
  * **Secrets never land here.** The table has a CHECK constraint rejecting
    credential-shaped keys, and `sanitize()` strips them before a write so the
    caller gets a clear error rather than a constraint violation. Tokens stay in
    the secret store.
"""

import uuid
from typing import Any, Dict, List

from src.infrastructure.db_client import execute_query, fetch_all, fetch_row

# Kept in step with the CHECK constraint in migration 0066.
SECRET_KEYS = {"token", "secret", "password", "apiKey", "api_key", "privateKey"}

DEFAULTS: Dict[str, Dict[str, Any]] = {
    "semgrep": {
        "enabled": False,
        # Seconds a single rule may spend on one file, and the whole scan.
        "ruleTimeoutSeconds": 30,
        "scanTimeoutSeconds": 1800,
        # Files above this are not analysed. Minified bundles blow past it.
        "maxTargetBytes": 2_000_000,
        "extraExcludes": [],
    },
    "regex": {
        "enabled": True,
        # The two pattern scanners that share the regex engine's tree walk.
        "customRules": True,
        "sensitiveData": True,
        "maxFileBytes": 2 * 1024 * 1024,
        "extraExcludes": [],
    },
}

ENGINES = list(DEFAULTS)


def sanitize(config: Dict[str, Any]) -> Dict[str, Any]:
    """Drop credential-shaped keys before anything reaches the database."""
    return {k: v for k, v in (config or {}).items() if k not in SECRET_KEYS}


def with_defaults(engine: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Merge a stored config over its defaults so callers always get every key."""
    return {**DEFAULTS.get(engine, {}), **(config or {})}


async def get_settings(tenant_id: str, engine: str) -> Dict[str, Any]:
    row = await fetch_row(
        "SELECT config FROM engine_settings WHERE organization_id = $1 AND engine = $2",
        tenant_id, engine,
    )
    return with_defaults(engine, row["config"] if row else {})


async def get_all_settings(tenant_id: str) -> Dict[str, Dict[str, Any]]:
    rows = await fetch_all(
        "SELECT engine, config FROM engine_settings WHERE organization_id = $1", tenant_id
    )
    stored = {r["engine"]: r["config"] for r in rows}
    return {engine: with_defaults(engine, stored.get(engine, {})) for engine in ENGINES}


async def save_settings(tenant_id: str, engine: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Upsert a tenant's config for one engine, returning what was stored."""
    clean = sanitize(config)
    await execute_query(
        "INSERT INTO engine_settings (id, organization_id, engine, config, updated_at) "
        "VALUES ($1, $2, $3, $4, NOW()) "
        "ON CONFLICT (organization_id, engine) "
        "DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()",
        str(uuid.uuid4()), tenant_id, engine, clean,
    )
    return with_defaults(engine, clean)
