import json
import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from src.service_registry import BY_NAME, SERVICES, WORKER_SERVICES, get


# ── registry ───────────────────────────────────────────────────────────────

def test_every_service_has_a_distinct_port():
    ports = [s.default_port for s in SERVICES]
    assert len(ports) == len(set(ports)), "two services would fight over one port"


def test_api_is_not_reachable_under_workers():
    """It is served at /sast; routing it twice would give it two public paths."""
    assert "api" not in {s.name for s in WORKER_SERVICES}


def test_port_is_overridable(monkeypatch):
    monkeypatch.setenv("SAST_PORT_SEMGREP", "9999")
    assert BY_NAME["semgrep"].port == 9999


def test_base_url_is_overridable_for_split_hosts(monkeypatch):
    monkeypatch.setenv("SAST_URL_CODEQL", "http://scanner-box:7000")
    assert BY_NAME["codeql"].base_url == "http://scanner-box:7000"


def test_unknown_service_lookup_returns_none():
    assert get("nope") is None


# ── router ─────────────────────────────────────────────────────────────────

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://t/t")
    from src.router import app
    return TestClient(app, raise_server_exceptions=False)


def _upstream(status=200, body=None, headers=None):
    resp = MagicMock()
    resp.status_code = status
    resp.content = json.dumps(body if body is not None else {"ok": True}).encode()
    resp.headers = headers or {"content-type": "application/json"}
    resp.json.return_value = body if body is not None else {"ok": True}
    return resp


def _with_client(app, mock):
    app.state.client = mock
    return app


def test_services_lists_paths(client):
    body = client.get("/services").json()
    by_name = {s["name"]: s["path"] for s in body["services"]}
    assert by_name["api"] == "/sast"
    assert by_name["semgrep"] == "/workers/semgrep"


def test_sast_path_is_forwarded_to_the_api_service(client):
    mock = AsyncMock()
    mock.request.return_value = _upstream(body={"scanId": "s1"})
    _with_client(client.app, mock)

    r = client.get("/sast/scans/s1", headers={"Authorization": "Bearer tok"})
    assert r.status_code == 200 and r.json() == {"scanId": "s1"}

    method, url = mock.request.await_args[0]
    assert method == "GET"
    assert url == f"{BY_NAME['api'].base_url}/sast/scans/s1"


def test_authorization_header_is_forwarded(client):
    """The router does not authenticate; the api service must still see the token."""
    mock = AsyncMock()
    mock.request.return_value = _upstream()
    _with_client(client.app, mock)

    client.get("/sast/scans/s1", headers={"Authorization": "Bearer tok-123"})
    forwarded = mock.request.await_args[1]["headers"]
    assert forwarded["authorization"] == "Bearer tok-123"


def test_hop_by_hop_headers_are_not_forwarded(client):
    """Passing `connection` or a stale content-length upstream corrupts the exchange."""
    mock = AsyncMock()
    mock.request.return_value = _upstream()
    _with_client(client.app, mock)

    client.post("/sast/scans/s1/run", json={"options": {}},
                headers={"Authorization": "Bearer t", "Connection": "keep-alive"})
    forwarded = {k.lower() for k in mock.request.await_args[1]["headers"]}
    assert "connection" not in forwarded
    assert "content-length" not in forwarded
    assert "host" not in forwarded


def test_upstream_status_and_body_pass_through(client):
    mock = AsyncMock()
    mock.request.return_value = _upstream(status=404, body={"message": "Scan not found.",
                                                            "code": "NOT_FOUND"})
    _with_client(client.app, mock)

    r = client.get("/sast/scans/nope", headers={"Authorization": "Bearer t"})
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"


def test_worker_path_is_forwarded(client):
    mock = AsyncMock()
    mock.request.return_value = _upstream(body={"service": "semgrep"})
    _with_client(client.app, mock)

    r = client.get("/workers/semgrep/info")
    assert r.status_code == 200
    assert mock.request.await_args[0][1] == f"{BY_NAME['semgrep'].base_url}/info"


def test_unknown_worker_names_the_valid_ones(client):
    r = client.get("/workers/nonsense/info")
    assert r.status_code == 404
    body = r.json()
    assert body["code"] == "UNKNOWN_SERVICE"
    assert "semgrep" in body["message"]


def test_api_is_not_routable_via_workers(client):
    r = client.get("/workers/api/health")
    assert r.status_code == 404
    assert r.json()["code"] == "UNKNOWN_SERVICE"


def test_upstream_timeout_is_reported_as_504(client):
    mock = AsyncMock()
    mock.request.side_effect = httpx.TimeoutException("timed out")
    _with_client(client.app, mock)

    r = client.get("/sast/scans/s1", headers={"Authorization": "Bearer t"})
    assert r.status_code == 504 and r.json()["code"] == "UPSTREAM_TIMEOUT"


def test_unreachable_upstream_does_not_leak_internal_topology(client):
    mock = AsyncMock()
    mock.request.side_effect = httpx.ConnectError("connection refused to 127.0.0.1:8004")
    _with_client(client.app, mock)

    r = client.get("/workers/semgrep/health")
    assert r.status_code == 503
    assert r.json() == {"message": "The service is unavailable.", "code": "UPSTREAM_UNAVAILABLE"}
    assert "127.0.0.1" not in r.text


def test_aggregate_health_is_ok_when_everything_is_up(client):
    mock = AsyncMock()
    mock.get.return_value = _upstream(body={"status": "ok", "queue": {"queued": 0, "active": 0}})
    _with_client(client.app, mock)

    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert len(r.json()["services"]) == len(SERVICES)


def test_aggregate_health_degrades_when_a_service_is_down(client):
    """
    Returning ok while an engine is down would make the outage invisible to
    whatever watches this endpoint.
    """
    mock = AsyncMock()

    async def probe(url, timeout=None):
        if "8004" in url or BY_NAME["semgrep"].base_url in url:
            raise httpx.ConnectError("refused")
        return _upstream(body={"status": "ok", "queue": {}})
    mock.get.side_effect = probe
    _with_client(client.app, mock)

    r = client.get("/health")
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "degraded"
    assert any(s["service"] == "semgrep" and s["status"] == "unreachable"
               for s in body["services"])
