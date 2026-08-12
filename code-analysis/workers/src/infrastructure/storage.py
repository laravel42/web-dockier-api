import os
import shutil
import zipfile
import tempfile

# Directories never archived. `.git` in particular must not ship: uploading it
# puts the full history of a private repository into object storage on every
# scan, and no engine scans it anyway.
EXCLUDED_DIRS = {".git"}

# Object storage abstraction
class ObjectStore:
    def upload_file(self, file_path: str, destination_path: str) -> str:
        raise NotImplementedError
    
    def download_file(self, remote_path: str, local_path: str):
        raise NotImplementedError

class S3Store(ObjectStore):
    def __init__(self, bucket_name: str):
        # Imported here so local development without AWS installed still works.
        import boto3
        self.s3 = boto3.client("s3")
        self.bucket_name = bucket_name
        
    def upload_file(self, file_path: str, destination_path: str) -> str:
        from botocore.exceptions import NoCredentialsError
        try:
            self.s3.upload_file(file_path, self.bucket_name, destination_path)
            return f"s3://{self.bucket_name}/{destination_path}"
        except NoCredentialsError:
            print("Credentials not available for S3.")
            raise

    def download_file(self, remote_path: str, local_path: str):
        if remote_path.startswith("s3://"):
            remote_path = remote_path.split(f"s3://{self.bucket_name}/")[1]
        self.s3.download_file(self.bucket_name, remote_path, local_path)

class LocalMockStore(ObjectStore):
    """Fallback local file system store for local development without AWS credentials."""
    def __init__(self, base_dir="/tmp/dockier_mock_s3"):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)
        
    def upload_file(self, file_path: str, destination_path: str) -> str:
        dest = os.path.join(self.base_dir, destination_path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy(file_path, dest)
        return f"local://{dest}"
        
    def download_file(self, remote_path: str, local_path: str):
        if remote_path.startswith("local://"):
            remote_path = remote_path.replace("local://", "")
        shutil.copy(remote_path, local_path)

def get_store() -> ObjectStore:
    bucket = os.getenv("S3_BUCKET_NAME")
    if bucket:
        return S3Store(bucket)
    return LocalMockStore()

def zip_directory(dir_path: str, output_path: str):
    """Zips a directory recursively, skipping symlinks and EXCLUDED_DIRS.

    Symlinks are skipped rather than followed. This service archives untrusted
    repositories and zipfile.write() dereferences links, so a repo containing a
    symlink named `config.yml` pointing at /etc/passwd or a mounted credentials
    file would have that file's *contents* copied into the archive and uploaded
    to object storage. Nothing is lost by skipping them: a link whose target is
    inside the repo is already archived under its real path, and a link whose
    target is outside the repo is not the repo's code.
    """
    dir_path = os.path.realpath(dir_path)
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(dir_path):
            # Prune in place so os.walk does not descend into them.
            dirs[:] = [
                d for d in dirs
                if d not in EXCLUDED_DIRS and not os.path.islink(os.path.join(root, d))
            ]
            for file in files:
                file_path = os.path.join(root, file)
                if os.path.islink(file_path):
                    print(f"[*] storage: skipping symlink {os.path.relpath(file_path, dir_path)}")
                    continue
                # Ensure we store relative paths inside the zip
                zipf.write(file_path, os.path.relpath(file_path, dir_path))

def unzip_directory(zip_path: str, extract_to: str):
    """Unzips a file into the target directory.

    Note on path traversal: CPython's ZipFile.extract() sanitizes member names
    before writing — it strips drive letters, leading separators, and every
    '..' component — so a crafted member cannot escape `extract_to` ("zip
    slip"). It also writes members flagged as symlinks as ordinary files
    containing the target path rather than creating a link. Do not replace this
    with a different extraction library without re-establishing both properties.
    """
    with zipfile.ZipFile(zip_path, "r") as zipf:
        zipf.extractall(extract_to)

def upload_codebase(repo_dir: str, scan_id: str) -> str:
    """Zips the codebase and uploads to the object store, returning the URI.

    The staging zip is written to a unique temp path: several scans can run
    concurrently on the same host, and a shared filename would let them
    truncate each other's archive.
    """
    store = get_store()
    fd, zip_path = tempfile.mkstemp(prefix=f"dockier-upload-{scan_id}-", suffix=".zip")
    os.close(fd)
    try:
        zip_directory(repo_dir, zip_path)
        return store.upload_file(zip_path, f"codebases/{scan_id}.zip")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)

def download_codebase(uri: str, target_dir: str):
    """Downloads the zipped codebase and extracts it into target_dir.

    All four engines download the same job concurrently. The archive is staged
    inside the caller's own scratch directory (unique per job) rather than at a
    fixed path in the system temp dir, which they would otherwise overwrite and
    delete out from under each other.
    """
    store = get_store()
    os.makedirs(target_dir, exist_ok=True)
    fd, zip_path = tempfile.mkstemp(prefix="dockier-download-", suffix=".zip", dir=target_dir)
    os.close(fd)
    try:
        store.download_file(uri, zip_path)
        unzip_directory(zip_path, target_dir)
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)
