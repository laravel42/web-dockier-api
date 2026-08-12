import importlib
import os
import sys
import pytest
from unittest.mock import patch

from src.infrastructure.secret_manager import clear_secret_cache, get_cloudflare_secret


def test_config_import_does_not_require_database_url(monkeypatch):
    """
    config.py raised at import time when DATABASE_URL was unset, taking down the
    whole app — including engines that never touch Postgres — and making the
    test suite uncollectable.
    """
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sys.modules.pop("src.infrastructure.config", None)
    config = importlib.import_module("src.infrastructure.config")

    assert config.MAX_WORKERS == 4
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        config.get_db_url()


def test_db_url_is_resolved_when_present(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://x/y")
    sys.modules.pop("src.infrastructure.config", None)
    config = importlib.import_module("src.infrastructure.config")
    assert config.get_db_url() == "postgresql://x/y"


@pytest.mark.asyncio
async def test_secret_is_read_from_the_environment(monkeypatch):
    clear_secret_cache()
    monkeypatch.setenv("SONAR_TOKEN", "tok")
    assert await get_cloudflare_secret("SONAR_TOKEN") == "tok"


@pytest.mark.asyncio
async def test_missing_secret_raises(monkeypatch):
    clear_secret_cache()
    monkeypatch.delenv("NOPE", raising=False)
    with pytest.raises(ValueError, match="NOPE"):
        await get_cloudflare_secret("NOPE")


@pytest.mark.asyncio
async def test_secrets_are_cached(monkeypatch):
    """Called twice per SonarQube job; the old version made an HTTP round trip each time."""
    clear_secret_cache()
    monkeypatch.setenv("SONAR_HOST_URL", "https://sonar")
    assert await get_cloudflare_secret("SONAR_HOST_URL") == "https://sonar"

    monkeypatch.delenv("SONAR_HOST_URL")
    assert await get_cloudflare_secret("SONAR_HOST_URL") == "https://sonar"


@pytest.mark.asyncio
async def test_secret_manager_makes_no_network_calls(monkeypatch):
    """The Cloudflare branch was dead code that could not return anything."""
    clear_secret_cache()
    monkeypatch.setenv("X", "y")
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "acct")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "tok")

    import src.infrastructure.secret_manager as sm
    assert not hasattr(sm, "httpx"), "secret manager should not import an HTTP client"
    assert await get_cloudflare_secret("X") == "y"
