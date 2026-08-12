"""
Cross-engine finding normalization and deduplication.

Port of the relevant half of
backend/src/services/code-analysis/domain/scan-analysis.ts.

Four engines scan the same tree, and they overlap heavily — Semgrep and CodeQL
both report SQL injection, SonarQube and the regex rules both report hardcoded
secrets. Without collapsing them the same vulnerability is persisted once per
engine, and the KPI counts are inflated by however many scanners happened to run.
"""

import os
from typing import Any, Dict, List, Optional

# Which severity wins when the same issue is reported at different levels.
SEVERITY_RANK = {"error": 3, "warning": 2, "info": 1}

# `semgrep --config <absolute dir>` namespaces every rule with that directory,
# dots for slashes, so a finding is stored as
#   Users.someone.projects.web-dockier-api.code-analysis.rules.opengrep.javascript.…
# while the catalogue the UI lists — and writes rule overrides against — calls
# the same rule `javascript.…`. The two never compared equal, so disabling a rule
# silently had no effect. Migration 0062 repaired the stored rows; this keeps new
# ones correct. Kept as a literal rather than derived from the rules directory:
# ids produced on another machine must normalize the same way here.
RULES_DIR_MARKER = ".code-analysis.rules.opengrep."


def normalize_semgrep_rule_id(check_id: str) -> str:
    """Strip the scanning machine's filesystem path out of a semgrep rule id."""
    if not check_id:
        return check_id
    idx = check_id.find(RULES_DIR_MARKER)
    if idx < 0:
        return check_id
    return check_id[idx + len(RULES_DIR_MARKER):]


def to_repo_relative_path(file_path: str, repo_dir: Optional[str] = None) -> str:
    """Reduce an engine's path to a repo-relative one.

    Engines report a mix: Semgrep echoes the absolute scratch path it was given,
    CodeQL emits SARIF URIs already relative to the source root. A finding whose
    path still carries `/tmp/tmpab12cd/` is both unusable in the UI and
    undedupable, because the scratch directory differs per engine and per run.
    """
    if not file_path:
        return file_path

    normalized = file_path.replace("\\", "/")
    is_absolute = normalized.startswith("/") or (
        len(normalized) > 2 and normalized[1] == ":" and normalized[2] == "/"
    )
    if not is_absolute:
        return normalized

    if repo_dir:
        resolved_repo = os.path.realpath(repo_dir).replace("\\", "/")
        resolved_file = os.path.realpath(file_path).replace("\\", "/")
        if resolved_file == resolved_repo:
            return ""
        if resolved_file.startswith(f"{resolved_repo}/"):
            return os.path.relpath(resolved_file, resolved_repo).replace("\\", "/")

    marker = "/repo/"
    idx = normalized.find(marker)
    if idx >= 0:
        return normalized[idx + len(marker):]

    return normalized


def finding_dedupe_key(finding: Dict[str, Any], repo_dir: Optional[str] = None) -> tuple:
    """Stable key for the same issue location: rule + file + line span."""
    return (
        finding.get("rule_id") or "",
        to_repo_relative_path(finding.get("file_path") or "", repo_dir),
        int(finding.get("line") or 0),
        int(finding.get("end_line") or finding.get("line") or 0),
    )


def dedupe_findings(
    findings: List[Dict[str, Any]], repo_dir: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Collapse duplicates from overlapping scanners, keeping the highest severity.

    Ties keep the first occurrence, so ordering is stable for a given engine
    ordering. Paths are normalized on the way through, so the returned findings
    are repo-relative regardless of which engine produced them.
    """
    by_key: Dict[tuple, Dict[str, Any]] = {}

    for finding in findings:
        normalized = {
            **finding,
            "file_path": to_repo_relative_path(finding.get("file_path") or "", repo_dir),
        }
        key = finding_dedupe_key(normalized, repo_dir)
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = normalized
            continue

        new_rank = SEVERITY_RANK.get(str(normalized.get("severity", "")).lower(), 0)
        old_rank = SEVERITY_RANK.get(str(existing.get("severity", "")).lower(), 0)
        if new_rank > old_rank:
            by_key[key] = normalized

    return list(by_key.values())
