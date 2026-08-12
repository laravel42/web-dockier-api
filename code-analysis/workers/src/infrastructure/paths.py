"""Filesystem locations shared by the engines."""

import os

# code-analysis/rules/opengrep relative to this file:
# src/infrastructure/paths.py -> workers/ -> code-analysis/ -> rules/opengrep
_DEFAULT_RULES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "rules", "opengrep")
)


def get_rules_dir() -> str:
    """Directory holding the Opengrep/Semgrep rule corpus.

    Overridable with OPENGREP_RULES_DIR for deployments that mount the rules
    somewhere else.
    """
    return os.getenv("OPENGREP_RULES_DIR", _DEFAULT_RULES_DIR)
