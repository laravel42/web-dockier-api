"""
The single public port. Everything else is reached through here.

    /                  -> the service bench (console)
    /sast/…            -> the api service
    /workers/{name}/…  -> that worker service
    /health            -> aggregate health across all services
    /services          -> the registry, so callers can discover what exists
    /docs              -> API documentation

Each service runs in its own process (see `scripts/run-services.sh`). The router
does not hold a queue consumer of its own: it forwards, and nothing more. Keeping
it that way means restarting an engine never interrupts in-flight API traffic.

Authentication is deliberately NOT performed here. The `api` service verifies the
tenant JWT itself and scopes every query to the tenant in it — a router that
authenticated on its behalf would become a component whose compromise grants
access to every tenant's scans.
"""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from src.api.errors import ApiError, register_error_handlers
from src.service_registry import BY_NAME, SERVICES, WORKER_SERVICES, get

# Long enough for a slow status query, short enough that a wedged service does
# not tie up router connections indefinitely. Scans themselves are queued, so
# nothing here waits on an actual scan.
UPSTREAM_TIMEOUT_SECONDS = float(os.getenv("SAST_ROUTER_TIMEOUT", "30"))

# Hop-by-hop headers must not be forwarded (RFC 7230 §6.1); passing `connection`
# or a stale `content-length` upstream corrupts the exchange.
_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_SECONDS)
    print(f"[*] router listening; {len(SERVICES)} services registered")
    try:
        yield
    finally:
        await app.state.client.aclose()


app = FastAPI(
    title="Dockier SAST",
    description=(
        "Single entry point for the SAST services. `/sast/*` is the tenant-facing "
        "scan API; `/workers/{service}/*` reaches an individual worker."
    ),
    version="1.0.0",
    lifespan=lifespan,
)
register_error_handlers(app)

_origins = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )


async def _forward(request: Request, target_base: str, path: str) -> Response:
    url = f"{target_base.rstrip('/')}/{path.lstrip('/')}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    body = await request.body()

    try:
        upstream = await request.app.state.client.request(
            request.method, url, headers=headers, content=body,
            params=request.query_params,
        )
    except httpx.TimeoutException:
        raise ApiError("The service did not respond in time.", "UPSTREAM_TIMEOUT", 504)
    except httpx.RequestError:
        # Do not surface the upstream address: it is internal topology.
        raise ApiError("The service is unavailable.", "UPSTREAM_UNAVAILABLE", 503)

    passthrough = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=passthrough,
        media_type=upstream.headers.get("content-type"),
    )


CONSOLE = Path(__file__).parent / "static" / "console.html"


@app.get("/", include_in_schema=False)
async def console() -> Response:
    """The service bench: documentation and a live tester for every service.

    Served from the router because it must be reachable before — or without —
    the SPA, and because a console that cannot load when a service is down is
    useless exactly when it is needed.
    """
    return FileResponse(CONSOLE, media_type="text/html")


@app.get("/services", tags=["Router"])
async def list_services() -> Dict[str, List[Dict[str, Any]]]:
    """Registered services and the path each is reachable on."""
    return {
        "services": [
            {
                "name": s.name,
                "description": s.description,
                "path": "/sast" if s.name == "api" else f"/workers/{s.name}",
            }
            for s in SERVICES
        ]
    }


@app.get("/health", tags=["Router"])
async def aggregate_health(request: Request) -> JSONResponse:
    """Health of every service, gathered concurrently.

    Reports `degraded` when any service is unreachable — a router that returned
    `ok` while an engine was down would make the outage invisible to whatever
    watches this endpoint.
    """
    async def probe(spec) -> Dict[str, Any]:
        try:
            resp = await request.app.state.client.get(f"{spec.base_url}/health", timeout=5)
            body = resp.json() if resp.status_code == 200 else {}
            return {"service": spec.name, "status": body.get("status", "degraded"),
                    "queue": body.get("queue", {})}
        except Exception:
            return {"service": spec.name, "status": "unreachable", "queue": {}}

    results = await asyncio.gather(*[probe(s) for s in SERVICES])
    healthy = all(r["status"] == "ok" for r in results)
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "degraded", "services": results},
    )


@app.api_route("/sast/{path:path}", methods=["GET", "POST", "PUT", "OPTIONS"], tags=["Router"])
async def route_api(request: Request, path: str) -> Response:
    """Forward to the tenant-facing API service."""
    return await _forward(request, BY_NAME["api"].base_url, f"/sast/{path}")


@app.api_route("/workers/{service}/{path:path}", methods=["GET", "POST"], tags=["Router"])
async def route_worker(request: Request, service: str, path: str) -> Response:
    """Forward to a single worker service."""
    spec = get(service)
    if spec is None or spec.name == "api":
        # Enumerating valid names here is fine — they are already public at
        # /services — and a bare 404 would be indistinguishable from a
        # misrouted path.
        raise ApiError(
            f"Unknown service {service!r}. Known: "
            f"{', '.join(s.name for s in WORKER_SERVICES)}.",
            "UNKNOWN_SERVICE", 404,
        )
    return await _forward(request, spec.base_url, f"/{path}")
