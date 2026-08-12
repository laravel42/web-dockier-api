import os
import zipfile
import tempfile
import boto3
from botocore.exceptions import NoCredentialsError

# Object storage abstraction
class ObjectStore:
    def upload_file(self, file_path: str, destination_path: str) -> str:
        raise NotImplementedError
    
    def download_file(self, remote_path: str, local_path: str):
        raise NotImplementedError

class S3Store(ObjectStore):
    def __init__(self, bucket_name: str):
        self.s3 = boto3.client('s3')
        self.bucket_name = bucket_name
        
    def upload_file(self, file_path: str, destination_path: str) -> str:
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
        import shutil
        shutil.copy(file_path, dest)
        return f"local://{dest}"
        
    def download_file(self, remote_path: str, local_path: str):
        import shutil
        if remote_path.startswith("local://"):
            remote_path = remote_path.replace("local://", "")
        shutil.copy(remote_path, local_path)

def get_store() -> ObjectStore:
    bucket = os.getenv("S3_BUCKET_NAME")
    if bucket:
        return S3Store(bucket)
    return LocalMockStore()

def zip_directory(dir_path: str, output_path: str):
    """Zips a directory recursively."""
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(dir_path):
            for file in files:
                file_path = os.path.join(root, file)
                # Ensure we store relative paths inside the zip
                zipf.write(file_path, os.path.relpath(file_path, dir_path))

def unzip_directory(zip_path: str, extract_to: str):
    """Unzips a file into the target directory."""
    with zipfile.ZipFile(zip_path, 'r') as zipf:
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
