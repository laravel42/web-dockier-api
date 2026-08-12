import pytest

from src.infrastructure.scan_skip import (
    MAX_SOURCE_LINE_LENGTH, is_generated_asset_name, is_scan_skipped_dir_name,
    is_scan_skipped_relative_path, looks_minified, semgrep_exclude_args,
    sonar_exclusion_globs, write_semgrep_ignore,
)


@pytest.mark.parametrize("name", ["node_modules", "vendor", "dist", ".next", "__pycache__",
                                  ".venv", "coverage", "NODE_MODULES", ".git"])
def test_dependency_dirs_are_skipped(name):
    assert is_scan_skipped_dir_name(name)


@pytest.mark.parametrize("name", ["src", "app", "lib", "public", "tests", "rebuild"])
def test_source_dirs_are_not_skipped(name):
    assert not is_scan_skipped_dir_name(name)


def test_gitignore_is_not_skipped_by_the_git_rule():
    """The old check was `".git" in file_path`, which also excluded .gitignore."""
    assert not is_scan_skipped_dir_name(".gitignore")
    assert not is_scan_skipped_relative_path("src/.gitignore")


def test_skip_matches_path_segments_not_substrings():
    assert is_scan_skipped_relative_path("frontend/node_modules/pkg/index.js")
    assert not is_scan_skipped_relative_path("src/build_helpers.py")
    assert not is_scan_skipped_relative_path("src/distance.py")


@pytest.mark.parametrize("name", ["app.min.js", "styles.min.css", "vendor.bundle.js",
                                  "main.chunk.js", "app-a1b2c3d4e5.js", "app.js.map"])
def test_generated_assets_are_recognized(name):
    assert is_generated_asset_name(name)


@pytest.mark.parametrize("name", ["app.js", "styles.css", "main.py", "minify.js"])
def test_source_files_are_not_flagged_as_generated(name):
    assert not is_generated_asset_name(name)


def test_published_vendor_bundle_in_public_is_caught_by_name():
    """
    Laravel's `vendor:publish` drops third-party bundles into public/, an
    ordinary directory name, so directory pruning alone misses them.
    """
    path = "public/js/filament/forms/components/file-upload.min.js"
    assert not is_scan_skipped_relative_path(path)
    assert is_generated_asset_name(path.rsplit("/", 1)[-1])


def test_looks_minified_on_a_long_single_line():
    assert looks_minified("var a=1;" * (MAX_SOURCE_LINE_LENGTH // 4))


def test_ordinary_source_is_not_minified():
    assert not looks_minified("def f():\n    return 1\n" * 500)


def test_line_length_resets_at_newlines():
    """A long file of short lines is source, not a bundle."""
    assert not looks_minified(("x" * 100 + "\n") * 1000)


def test_semgrep_exclude_args_are_flag_value_pairs():
    args = semgrep_exclude_args()
    assert len(args) % 2 == 0
    assert set(args[::2]) == {"--exclude"}
    assert "node_modules/" in args
    assert "*.min.js" in args


def test_sonar_exclusion_globs():
    globs = sonar_exclusion_globs().split(",")
    assert "**/node_modules/**" in globs
    assert all(g.startswith("**/") and g.endswith("/**") for g in globs)


def test_write_semgrep_ignore(tmp_path):
    write_semgrep_ignore(str(tmp_path))
    content = (tmp_path / ".semgrepignore").read_text()
    assert "node_modules/" in content
    assert "*.min.js" in content
