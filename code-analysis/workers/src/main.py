"""
Default ASGI target: the router.

Services now run as separate processes (see `scripts/run-services.sh` and
`src/run.py`), and the router is the single public port in front of them. This
module exists so `uvicorn src.main:app` — the command in every existing runbook —
still lands somewhere sensible.

To run one service on its own:  python -m src.run <service>
"""

from src.router import app

__all__ = ["app"]
