"""
Which services exist, what each does, and where it listens.

Every service runs as its own process on its own port. Nothing binds the public
port except the router (`src/router.py`), which is the single entry point and
forwards to whichever service the path names. Running them separately means one
engine wedging on a pathological repository cannot take the API down with it.

Ports are overridable per service — `SAST_PORT_SEMGREP=9002` — so several
instances can share a host.
"""

import os
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class ServiceSpec:
    name: str
    description: str
    default_port: int
    # None for the API service, which serves requests but consumes no queue.
    queue_env_key: Optional[str] = None

    @property
    def port(self) -> int:
        return int(os.getenv(f"SAST_PORT_{self.name.upper().replace('-', '_')}", self.default_port))

    @property
    def base_url(self) -> str:
        """Where the router forwards to. Overridable for split-host deployments."""
        env = f"SAST_URL_{self.name.upper().replace('-', '_')}"
        return os.getenv(env, f"http://127.0.0.1:{self.port}")


SERVICES: List[ServiceSpec] = [
    ServiceSpec("api", "Public tenant-facing scan API", 8001),
    ServiceSpec("gateway", "Claims scans, clones, fans out to engines", 8002, "SECURITY_SCAN_QUEUE"),
    ServiceSpec("aggregator", "Fans in engine results, dedupes, persists", 8003, "RESULTS_QUEUE"),
    ServiceSpec("semgrep", "Semgrep engine", 8004, "semgrep"),
    ServiceSpec("regex", "Custom-rule and sensitive-data engine", 8005, "regex"),
    ServiceSpec("sonarqube", "SonarQube engine", 8006, "sonarqube"),
    ServiceSpec("codeql", "CodeQL engine", 8007, "codeql"),
]

BY_NAME: Dict[str, ServiceSpec] = {s.name: s for s in SERVICES}

ROUTER_PORT = int(os.getenv("SAST_PORT_ROUTER", "8000"))

# Services the router will forward `/workers/{name}/…` to. `api` is excluded
# because it is reached at `/sast/…` instead — routing it twice would give the
# same endpoints two public paths.
WORKER_SERVICES = [s for s in SERVICES if s.name != "api"]


def get(name: str) -> Optional[ServiceSpec]:
    return BY_NAME.get(name)
