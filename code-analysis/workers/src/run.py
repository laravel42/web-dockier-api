"""
Entry point for a single service.

    python -m src.run api          # tenant-facing API   :8001
    python -m src.run semgrep      # semgrep engine      :8004
    python -m src.run router       # public entry point  :8000

Each service is its own process. `scripts/run-services.sh` starts the full set.
"""

import sys

import uvicorn

from src.service_registry import BY_NAME, ROUTER_PORT, SERVICES

USAGE = (
    "usage: python -m src.run <service>\n\n"
    "services:\n"
    "  router      public entry point, forwards to everything below\n"
    + "\n".join(f"  {s.name:<11} {s.description}" for s in SERVICES)
)


def main(argv: list) -> int:
    if len(argv) != 2 or argv[1] in ("-h", "--help"):
        print(USAGE)
        return 0 if argv[1:] and argv[1] in ("-h", "--help") else 2

    name = argv[1]

    if name == "router":
        uvicorn.run("src.router:app", host="0.0.0.0", port=ROUTER_PORT)
        return 0

    spec = BY_NAME.get(name)
    if spec is None:
        print(f"unknown service {name!r}\n\n{USAGE}", file=sys.stderr)
        return 2

    # Passed as a factory string so uvicorn's --reload can re-import it.
    uvicorn.run(
        f"src.service_entrypoints:{name.replace('-', '_')}_app",
        host="0.0.0.0",
        port=spec.port,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
