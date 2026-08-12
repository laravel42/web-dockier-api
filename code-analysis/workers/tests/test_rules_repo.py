import pytest
from unittest.mock import patch, AsyncMock

from src.infrastructure.rules_repo import (
    compile_rules, load_custom_rules, load_disabled_rule_ids, matches_extension,
)


def _row(rule_id="r1", pattern=r"md5\(", enabled=True, extensions=None, severity="error"):
    return {"rule_id": rule_id, "severity": severity, "message": "m",
            "pattern": pattern, "extensions": extensions or [], "enabled": enabled}


@pytest.mark.asyncio
@patch("src.infrastructure.rules_repo.fetch_all", new_callable=AsyncMock)
async def test_loads_system_and_tenant_rules(mock_fetch):
    mock_fetch.return_value = [_row("sys"), _row("tenant")]
    rules = await load_custom_rules("org-1")

    assert [r["rule_id"] for r in rules] == ["sys", "tenant"]
    sql, rule_type, tenant = mock_fetch.await_args[0]
    assert "custom_rules" in sql and rule_type == "custom" and tenant == "org-1"


@pytest.mark.asyncio
@patch("src.infrastructure.rules_repo.fetch_all", new_callable=AsyncMock)
async def test_disabled_rules_are_not_returned(mock_fetch):
    mock_fetch.return_value = [_row("on", enabled=True), _row("off", enabled=False)]
    assert [r["rule_id"] for r in await load_custom_rules("org-1")] == ["on"]


@pytest.mark.asyncio
@patch("src.infrastructure.rules_repo.fetch_all", new_callable=AsyncMock)
async def test_overrides_are_read_from_the_tool_specific_table(mock_fetch):
    mock_fetch.return_value = [{"rule_id": "js/xss"}]

    assert await load_disabled_rule_ids("org-1", "semgrep") == {"js/xss"}
    assert "opengrep_rules" in mock_fetch.await_args[0][0]

    await load_disabled_rule_ids("org-1", "sonarqube")
    assert "sonarqube_rules" in mock_fetch.await_args[0][0]


@pytest.mark.asyncio
@patch("src.infrastructure.rules_repo.fetch_all", new_callable=AsyncMock)
async def test_no_tenant_means_no_overrides(mock_fetch):
    assert await load_disabled_rule_ids(None, "semgrep") == set()
    mock_fetch.assert_not_awaited()


@pytest.mark.asyncio
@patch("src.infrastructure.rules_repo.fetch_all", new_callable=AsyncMock)
async def test_unknown_tool_has_no_override_table(mock_fetch):
    assert await load_disabled_rule_ids("org-1", "codeql") == set()
    mock_fetch.assert_not_awaited()


def test_invalid_pattern_is_skipped_not_fatal():
    """One bad tenant-authored regex must not stop every other rule from running."""
    compiled = compile_rules([_row("good", r"md5\("), _row("bad", r"([unclosed"), _row("also-good", r"sha1")])
    assert [c[0] for c in compiled] == ["good", "also-good"]


def test_patterns_are_case_insensitive():
    compiled = compile_rules([_row("r", r"md5\(")])
    assert compiled[0][1].search("MD5(")


def test_extensions_are_normalized_with_a_leading_dot():
    compiled = compile_rules([_row("r", "x", extensions=["php", ".JS"])])
    assert compiled[0][4] == [".php", ".js"]


@pytest.mark.parametrize("path,exts,expected", [
    ("a.php", [".php"], True),
    ("a.js", [".php"], False),
    ("a.php", [], True),          # empty means "every file"
    ("a.PHP", [".php"], True),
])
def test_matches_extension(path, exts, expected):
    assert matches_extension(path, exts) is expected
