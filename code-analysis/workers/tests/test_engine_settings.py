import pytest
from unittest.mock import patch, AsyncMock

from src.infrastructure.engine_settings import (
    CODEQL_LANGUAGES, DEFAULTS, ENGINES, SECRET_KEYS, get_all_settings, get_settings,
    sanitize, save_settings, with_defaults,
)


@pytest.mark.parametrize("engine", ENGINES)
def test_defaults_are_complete(engine):
    """A partially-populated settings object surfaces as an engine silently skipping work."""
    assert with_defaults(engine, {}) == DEFAULTS[engine]


def test_semgrep_disabled_by_default():
    assert DEFAULTS["semgrep"]["enabled"] is False


@pytest.mark.parametrize("engine", [e for e in ENGINES if e != "semgrep"])
def test_enabled_by_default_except_semgrep(engine):
    assert with_defaults(engine, {})["enabled"] is True


def test_stored_values_override_defaults_key_by_key():
    merged = with_defaults("codeql", {"languages": ["go"]})
    assert merged["languages"] == ["go"]
    assert merged["querySuite"] == "security-and-quality", "untouched keys keep their default"


@pytest.mark.parametrize("key", sorted(SECRET_KEYS))
def test_credential_keys_are_stripped(key):
    cleaned = sanitize({"hostUrl": "https://sonar", key: "leak"})
    assert key not in cleaned
    assert cleaned["hostUrl"] == "https://sonar"


@pytest.mark.asyncio
@patch("src.infrastructure.engine_settings.fetch_row", new_callable=AsyncMock)
async def test_missing_row_yields_defaults(mock_row):
    mock_row.return_value = None
    assert await get_settings("org-9", "codeql") == DEFAULTS["codeql"]


@pytest.mark.asyncio
@patch("src.infrastructure.engine_settings.fetch_row", new_callable=AsyncMock)
async def test_settings_lookup_is_tenant_scoped(mock_row):
    mock_row.return_value = {"config": {}}
    await get_settings("org-9", "bearer")
    sql, tenant, engine = mock_row.await_args[0]
    assert "organization_id = $1" in sql
    assert (tenant, engine) == ("org-9", "bearer")


@pytest.mark.asyncio
@patch("src.infrastructure.engine_settings.fetch_all", new_callable=AsyncMock)
async def test_get_all_fills_engines_with_no_row(mock_all):
    mock_all.return_value = [{"engine": "codeql", "config": {"languages": ["go"]}}]
    out = await get_all_settings("org-9")
    assert set(out) == set(ENGINES)
    assert out["codeql"]["languages"] == ["go"]
    assert out["bearer"] == DEFAULTS["bearer"]


@pytest.mark.asyncio
@patch("src.infrastructure.engine_settings.execute_query", new_callable=AsyncMock)
async def test_save_strips_secrets_before_writing(mock_exec):
    await save_settings("org-9", "bearer", {"skipPaths": ["**/vendor/**"], "token": "leak"})
    written = mock_exec.await_args[0][4]
    assert "token" not in written, "a credential must never reach the database"
    assert written["skipPaths"] == ["**/vendor/**"]


@pytest.mark.asyncio
@patch("src.infrastructure.engine_settings.execute_query", new_callable=AsyncMock)
async def test_save_upserts_on_tenant_and_engine(mock_exec):
    await save_settings("org-9", "codeql", {"languages": ["go"]})
    sql = mock_exec.await_args[0][0]
    assert "ON CONFLICT (organization_id, engine)" in sql


def test_codeql_language_catalogue_matches_the_engine():
    from src.services.codeql.service import SUPPORTED_LANGUAGES
    assert set(CODEQL_LANGUAGES) == SUPPORTED_LANGUAGES
