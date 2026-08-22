"""
Which files and directories a scan must ignore.

Port of backend/src/services/code-analysis/domain/scan-skip-dirs.ts. The two must
agree: findings are keyed by rule + path, so if one scanner reports a vendored
bundle and the other does not, the same repo yields different results depending on
which engine ran.
"""

import os
import re
from typing import List

# Directory names skipped when walking repos and passed to Semgrep/SonarQube.
SCAN_SKIP_DIRS = {
    "node_modules", ".git", "vendor", "vendors", "bower_components", "jspm_packages",
    "third_party", "third-party", "dist", "build", "target", "out",
    ".next", ".nuxt", ".output", ".svelte-kit", ".turbo", ".cache", ".parcel-cache",
    ".yarn", ".pnpm-store", ".pnpm", "coverage", "__pycache__", ".venv", "venv",
    "site-packages", "Pods", ".bundle", "carthage", "godeps", ".gradle", ".nuget",
    ".composer", ".terraform", ".serverless",
}

_SKIP_DIRS_LOWER = {d.lower() for d in SCAN_SKIP_DIRS}

# Filenames that are generated output regardless of where they sit.
#
# Directory-based skipping misses published vendor assets: Laravel's
# `vendor:publish` drops third-party bundles into `public/`, an entirely ordinary
# directory name, so those were being scanned as if hand-written.
GENERATED_FILE_PATTERNS = [
    re.compile(r"\.min\.(js|css|mjs|cjs)$", re.I),
    re.compile(r"\.bundle\.(js|css|mjs|cjs)$", re.I),
    re.compile(r"\.chunk\.(js|mjs|cjs)$", re.I),
    re.compile(r"-[0-9a-f]{8,}\.(js|css|mjs|cjs)$", re.I),  # content-hashed build output
    re.compile(r"\.map$", re.I),
]

GENERATED_GLOBS = ["*.min.js", "*.min.css", "*.min.mjs", "*.bundle.js", "*.chunk.js", "*.map"]

# Longest line accepted in a text asset before it is treated as minified.
#
# Minified bundles put a whole library on one line. A finding on such a file is
# unusable — "line 2" of a 400 KB line tells nobody anything, and the code is not
# the user's to fix. Hand-written sources essentially never exceed this.
MAX_SOURCE_LINE_LENGTH = 2_000

# Files above this size are not read at all. The regex engine previously called
# readlines() on every file in the repo with no cap.
MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024


def is_scan_skipped_dir_name(name: str) -> bool:
    """True when a single path segment is a skipped dependency/build directory."""
    return name.lower() in _SKIP_DIRS_LOWER


def is_scan_skipped_relative_path(relative_path: str) -> bool:
    """True when any segment of a repo-relative path is a skipped directory.

    Segment-wise, not substring: `.git` must not also exclude `.gitignore`, and
    `build` must not exclude `rebuild.py`.
    """
    segments = [s for s in relative_path.replace("\\", "/").split("/") if s]
    return any(is_scan_skipped_dir_name(s) for s in segments)


def is_generated_asset_name(name: str) -> bool:
    """True when a filename is recognisably build output rather than source."""
    return any(p.search(name) for p in GENERATED_FILE_PATTERNS)


def looks_minified(content: str) -> bool:
    """True when content has one or more absurdly long lines.

    Catches bundles that slip past the name patterns — plenty of published assets
    are minified without a `.min` in the name.
    """
    line_length = 0
    for ch in content:
        if ch == "\n":
            line_length = 0
            continue
        line_length += 1
        if line_length > MAX_SOURCE_LINE_LENGTH:
            return True
    return False


def semgrep_exclude_args() -> List[str]:
    """Semgrep CLI --exclude flags (gitignore-style globs)."""
    args: List[str] = []
    for d in sorted(SCAN_SKIP_DIRS):
        args += ["--exclude", f"{d}/", "--exclude", f"**/{d}/**"]
    for glob in GENERATED_GLOBS:
        args += ["--exclude", glob]
    return args


def sonar_exclusion_globs() -> str:
    """Comma-separated SonarQube sonar.exclusions glob list."""
    return ",".join(f"**/{d}/**" for d in sorted(SCAN_SKIP_DIRS))


def semgrep_ignore_lines() -> List[str]:
    header = "# Dockier — skip dependency and build artifact directories"
    patterns = []
    for d in sorted(SCAN_SKIP_DIRS):
        patterns += [f"{d}/", f"**/{d}/**"]
    return [header, *patterns, "# generated assets", *GENERATED_GLOBS]


def write_semgrep_ignore(repo_dir: str) -> None:
    """Write .semgrepignore into a cloned repo before Semgrep runs."""
    with open(os.path.join(repo_dir, ".semgrepignore"), "w", encoding="utf-8") as f:
        f.write("\n".join(semgrep_ignore_lines()) + "\n")


def count_scannable_files(repo_path: str, max_file_bytes: int = MAX_SOURCE_FILE_BYTES) -> int:
    """Count repo files the regex/semgrep walk would consider, without reading bodies."""
    count = 0
    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if not is_scan_skipped_dir_name(d)]
        for file in files:
            if is_generated_asset_name(file):
                continue
            file_path = os.path.join(root, file)
            rel_path = os.path.relpath(file_path, repo_path)
            if is_scan_skipped_relative_path(rel_path):
                continue
            try:
                if os.path.getsize(file_path) > max_file_bytes:
                    continue
            except OSError:
                continue
            count += 1
    return count
