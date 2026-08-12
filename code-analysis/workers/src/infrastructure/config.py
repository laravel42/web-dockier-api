import os

# Execution constraints
MAX_WORKERS = 4
POLL_INTERVAL = 2  # Seconds between queue poll checks
SCRATCHPAD_PREFIX = "dockier_scan_"


def get_db_url() -> str:
    """Resolve DATABASE_URL on first use.

    This module used to raise at import time when the variable was unset, which
    took down the entire FastAPI app — including engines that never touch
    Postgres — and made the test suite uncollectable.
    """
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("Missing required environment variable: DATABASE_URL")
    return url
