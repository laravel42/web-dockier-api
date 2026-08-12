import os
import pytest
from unittest.mock import patch, MagicMock

from src.infrastructure.storage import (
    S3Store, LocalMockStore, get_store, zip_directory, unzip_directory,
    upload_codebase, download_codebase,
)


def test_zip_and_unzip(tmp_path):
    src_dir = tmp_path / "src"
    src_dir.mkdir()
    (src_dir / "test.txt").write_text("hello world")

    zip_path = tmp_path / "out.zip"
    dest_dir = tmp_path / "dest"

    zip_directory(str(src_dir), str(zip_path))
    assert zip_path.exists()

    unzip_directory(str(zip_path), str(dest_dir))
    assert (dest_dir / "test.txt").read_text() == "hello world"


def test_local_mock_store(tmp_path):
    store = LocalMockStore(base_dir=str(tmp_path / "mock_s3"))
    test_file = tmp_path / "upload.txt"
    test_file.write_text("data")

    uri = store.upload_file(str(test_file), "test_folder/upload.txt")
    assert uri.startswith("local://")

    dest_file = tmp_path / "download.txt"
    store.download_file(uri, str(dest_file))
    assert dest_file.read_text() == "data"


@patch("src.infrastructure.storage.boto3.client")
def test_s3_store(mock_boto_client, tmp_path):
    mock_s3 = MagicMock()
    mock_boto_client.return_value = mock_s3

    store = S3Store(bucket_name="my-bucket")

    assert store.upload_file("local_path", "remote_path") == "s3://my-bucket/remote_path"
    mock_s3.upload_file.assert_called_once_with("local_path", "my-bucket", "remote_path")

    store.download_file("s3://my-bucket/remote_path", "local_dest")
    mock_s3.download_file.assert_called_once_with("my-bucket", "remote_path", "local_dest")


@patch.dict(os.environ, {"S3_BUCKET_NAME": "test-bucket"})
def test_get_store_s3():
    with patch("src.infrastructure.storage.boto3.client"):
        assert isinstance(get_store(), S3Store)


@patch.dict(os.environ, {}, clear=True)
def test_get_store_local():
    assert isinstance(get_store(), LocalMockStore)


def test_concurrent_downloads_do_not_share_a_staging_path(tmp_path):
    """
    download_codebase previously staged every archive at a single fixed path in
    the system temp dir, so the four engines downloading the same job would
    truncate and delete each other's zip. Each call must stage inside its own
    target directory.
    """
    src_dir = tmp_path / "repo"
    src_dir.mkdir()
    (src_dir / "app.py").write_text("print('hi')")

    archive = tmp_path / "codebase.zip"
    zip_directory(str(src_dir), str(archive))

    store = LocalMockStore(base_dir=str(tmp_path / "store"))
    uri = store.upload_file(str(archive), "codebases/scan-1.zip")

    staged = []
    real_mkstemp = __import__("tempfile").mkstemp

    def tracking_mkstemp(*args, **kwargs):
        fd, path = real_mkstemp(*args, **kwargs)
        staged.append(path)
        return fd, path

    with patch("src.infrastructure.storage.get_store", return_value=store), \
         patch("src.infrastructure.storage.tempfile.mkstemp", side_effect=tracking_mkstemp):
        for i in range(4):
            target = tmp_path / f"engine-{i}"
            download_codebase(uri, str(target))
            assert (target / "app.py").read_text() == "print('hi')"

    assert len(set(staged)) == 4, "each download must stage to a distinct path"
    for path in staged:
        assert not os.path.exists(path), "staging archive must be removed"


def test_upload_codebase_cleans_up_its_staging_archive(tmp_path):
    src_dir = tmp_path / "repo"
    src_dir.mkdir()
    (src_dir / "app.py").write_text("x = 1")

    store = LocalMockStore(base_dir=str(tmp_path / "store"))
    with patch("src.infrastructure.storage.get_store", return_value=store):
        uri = upload_codebase(str(src_dir), "scan-1")

    assert uri.startswith("local://")
    assert "codebases/scan-1.zip" in uri
    leftovers = [p for p in os.listdir(__import__("tempfile").gettempdir())
                 if p.startswith("dockier-upload-scan-1-")]
    assert leftovers == []
