"""
Rule configuration read from the database (decision §7.4).

The regex engine previously carried two hardcoded patterns in `rules.py` while
DESCRIPTION.md advertised "30+ custom regex rules". Both were true of different
codebases: the 36 system rules live in `custom_rules` (organization_id = ''),
seeded by the backend's seedCustomRules().

The rule *content* deliberately stays there rather than being duplicated here.
Two copies of 36 regexes would drift, and a rule that fires in one scanner but
not the other is worse than a rule that exists in neither.
"""

import re
from typing import Any, Dict, List, Optional, Set

from src.infrastructure.db_client import fetch_all

# rule_overrides live in one table per tool, keyed by tenant.
OVERRIDE_TABLES = {"semgrep": "opengrep_rules", "sonarqube": "sonarqube_rules"}


async def load_custom_rules(tenant_id: Optional[str], rule_type: str = "custom") -> List[Dict[str, Any]]:
    """System rules (organization_id = '') plus this tenant's own, as the API does."""
    rows = await fetch_all(
        "SELECT rule_id, severity, message, pattern, extensions, enabled "
        "FROM custom_rules "
        "WHERE type = $1 AND organization_id IN ('', COALESCE($2, '')) "
        "ORDER BY rule_id",
        rule_type,
        tenant_id,
    )
    return [dict(r) for r in rows if r["enabled"]]


async def load_disabled_rule_ids(tenant_id: Optional[str], tool: str) -> Set[str]:
    """Rule ids the tenant has switched off for semgrep or sonarqube.

    Absence of a row means enabled: the tables record deviations from the
    default, not the full catalogue.
    """
    table = OVERRIDE_TABLES.get(tool)
    if not table or not tenant_id:
        return set()

    rows = await fetch_all(
        f"SELECT rule_id FROM {table} WHERE organization_id = $1 AND enabled = false",
        tenant_id,
    )
    return {r["rule_id"] for r in rows}


def compile_rules(rules: List[Dict[str, Any]]) -> List[tuple]:
    """Compile DB rows into (rule_id, pattern, message, severity, extensions).

    A rule with an invalid pattern is skipped with a warning rather than taking
    the whole scan down — one bad tenant-authored regex must not stop every
    other rule from running.
    """
    compiled = []
    for r in rules:
        try:
            pattern = re.compile(r["pattern"], re.IGNORECASE)
        except re.error as e:
            print(f"[!] rules: skipping {r['rule_id']!r}, invalid pattern: {e}")
            continue
        compiled.append((
            r["rule_id"],
            pattern,
            r["message"],
            r["severity"],
            [e.lower() if e.startswith(".") else f".{e.lower()}" for e in (r.get("extensions") or [])],
        ))
    return compiled


def matches_extension(file_path: str, extensions: List[str]) -> bool:
    """An empty extension list means the rule applies to every file."""
    if not extensions:
        return True
    import os
    return os.path.splitext(file_path)[1].lower() in extensions
