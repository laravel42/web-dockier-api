import os

# Database pool configuration pointing to Supabase pg-boss schema
DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    raise ValueError("Missing critical environment variable: DATABASE_URL")

# Execution constraints
MAX_WORKERS = 4
POLL_INTERVAL = 2  # Seconds between database poll checks
SCRATCHPAD_PREFIX = "dockier_scan_"
