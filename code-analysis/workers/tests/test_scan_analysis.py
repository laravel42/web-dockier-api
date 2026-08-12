import pytest

from src.infrastructure.scan_analysis import (
    dedupe_findings, finding_dedupe_key, to_repo_relative_path, SEVERITY_RANK,
)


def _f(rule_id="r", file_path="app.py", line=1, end_line=None, severity="warning"):
    return {"rule_id": rule_id, "file_path": file_path, "line": line,
            "end_line": end_line if end_line is not None else line,
            "severity": severity, "message": "m", "snippet": ""}


# --- path normalization ---------------------------------------------------

def test_relative_paths_pass_through():
    assert to_repo_relative_path("src/app.py") == "src/app.py"


def test_absolute_path_is_made_relative_to_repo(tmp_path):
    (tmp_path / "src").mkdir()
    target = tmp_path / "src" / "app.py"
    target.write_text("x")
    assert to_repo_relative_path(str(target), str(tmp_path)) == "src/app.py"


def test_repo_root_itself_becomes_empty(tmp_path):
    assert to_repo_relative_path(str(tmp_path), str(tmp_path)) == ""


def test_repo_marker_fallback_when_no_repo_dir():
    """Engines running in a container report /repo/... paths."""
    assert to_repo_relative_path("/some/where/repo/src/app.py") == "src/app.py"


def test_absolute_path_outside_repo_is_left_alone(tmp_path):
    assert to_repo_relative_path("/elsewhere/app.py", str(tmp_path)) == "/elsewhere/app.py"


def test_backslashes_are_normalized():
    assert to_repo_relative_path("src\\app.py") == "src/app.py"


def test_empty_path_is_preserved():
    assert to_repo_relative_path("") == ""


# --- dedupe ---------------------------------------------------------------

def test_identical_findings_collapse_to_one():
    result = dedupe_findings([_f(), _f(), _f()])
    assert len(result) == 1


def test_findings_differing_in_any_key_field_are_kept():
    findings = [
        _f(rule_id="a"), _f(rule_id="b"),
        _f(file_path="other.py"),
        _f(line=2),
        _f(line=1, end_line=9),
    ]
    assert len(dedupe_findings(findings)) == 5


def test_highest_severity_wins_on_collision():
    result = dedupe_findings([_f(severity="info"), _f(severity="error"), _f(severity="warning")])
    assert len(result) == 1
    assert result[0]["severity"] == "error"


def test_first_occurrence_wins_on_severity_tie():
    a, b = _f(severity="warning"), _f(severity="warning")
    a["message"], b["message"] = "from semgrep", "from codeql"
    result = dedupe_findings([a, b])
    assert len(result) == 1
    assert result[0]["message"] == "from semgrep"


def test_unknown_severity_never_outranks_a_known_one():
    result = dedupe_findings([_f(severity="error"), _f(severity="banana")])
    assert result[0]["severity"] == "error"


def test_dedupe_normalizes_paths_so_engines_agree(tmp_path):
    """
    Semgrep echoes the absolute scratch path; CodeQL emits a relative SARIF URI.
    The same issue must collapse despite arriving in two different shapes.
    """
    (tmp_path / "app.py").write_text("x")
    from_semgrep = _f(file_path=str(tmp_path / "app.py"), severity="warning")
    from_codeql = _f(file_path="app.py", severity="error")

    result = dedupe_findings([from_semgrep, from_codeql], repo_dir=str(tmp_path))
    assert len(result) == 1
    assert result[0]["file_path"] == "app.py"
    assert result[0]["severity"] == "error"


def test_empty_input():
    assert dedupe_findings([]) == []


def test_severity_rank_ordering():
    assert SEVERITY_RANK["error"] > SEVERITY_RANK["warning"] > SEVERITY_RANK["info"]


# --- semgrep rule id normalization ----------------------------------------

from src.infrastructure.scan_analysis import normalize_semgrep_rule_id


def test_machine_path_is_stripped_from_rule_ids():
    noisy = ("Users.someone.projects.web-dockier-api.code-analysis.rules.opengrep"
             ".javascript.browser.security.insecure-document-method")
    assert normalize_semgrep_rule_id(noisy) == \
        "javascript.browser.security.insecure-document-method"


def test_catalogue_ids_pass_through_unchanged():
    plain = "javascript.browser.security.insecure-document-method"
    assert normalize_semgrep_rule_id(plain) == plain


@pytest.mark.parametrize("value", ["", None])
def test_empty_rule_ids_are_preserved(value):
    assert normalize_semgrep_rule_id(value) == value


def test_normalization_is_idempotent():
    noisy = "a.b.code-analysis.rules.opengrep.python.lang.security.audit"
    once = normalize_semgrep_rule_id(noisy)
    assert normalize_semgrep_rule_id(once) == once
