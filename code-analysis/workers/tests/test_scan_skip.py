import os

from src.infrastructure.scan_skip import count_scannable_files, is_scan_skipped_dir_name


def test_count_scannable_files_skips_vendor_and_counts_source(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.js").write_text("console.log('ok');")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "pkg.js").write_text("ignored")

    assert count_scannable_files(str(tmp_path)) == 1


def test_count_scannable_files_skips_generated_assets(tmp_path):
    (tmp_path / "app.min.js").write_bytes(b"x" * 10)
    (tmp_path / "main.ts").write_text("export {};\n")

    assert count_scannable_files(str(tmp_path)) == 1
