import json
import pytest
import jwt
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

SECRET = "test-secret"


def _token(tenant="org-9", user="u1", email="a@b.c", **overrides):
    claims = {"userId": user, "email": email, "tenantId": tenant, **overrides}
    return jwt.encode(claims, SECRET, algorithm="HS256")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SECRET)
    monkeypatch.setenv("DATABASE_URL", "postgresql://t/t")
    # The `api` service app, not src.main — src.main is now the router, which
    # forwards to this rather than serving /sast itself.
    from src.service_app import build_app
    from src.service_registry import BY_NAME

    # Not used as a context manager on purpose: entering it runs the lifespan,
    # which registers queues against a real database.
    return TestClient(build_app(BY_NAME["api"]), raise_server_exceptions=False)


SCAN_ROW = {
    "id": "scan-1", "organization_id": "org-9", "status": "completed",
    "summary": {"totalFindings": 2, "errors": 1, "warnings": 1, "infos": 0,
                "filesScanned": 10, "filesInRepo": 20,
                "progress": {"phase": "done", "filesScanned": 10, "filesInRepo": 20,
                             "findingsCount": 2}},
    "engine_status": {"semgrep": {"status": "ok", "error": None}},
    "quality_gate_status": "failed", "updated_at": None,
}


# ── auth ───────────────────────────────────────────────────────────────────

def test_missing_token_is_rejected(client):
    r = client.get("/sast/scans/scan-1")
    assert r.status_code == 401
    assert r.json() == {"message": "Missing or malformed Authorization header.",
                        "code": "UNAUTHORIZED"}


def test_malformed_header_is_rejected(client):
    r = client.get("/sast/scans/scan-1", headers={"Authorization": "token abc"})
    assert r.status_code == 401


def test_token_signed_with_another_secret_is_rejected(client):
    bad = jwt.encode({"userId": "u", "email": "e", "tenantId": "t"}, "other", algorithm="HS256")
    r = client.get("/sast/scans/scan-1", headers={"Authorization": f"Bearer {bad}"})
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


def test_token_missing_tenant_claim_is_rejected(client):
    tokenless = jwt.encode({"userId": "u", "email": "e"}, SECRET, algorithm="HS256")
    r = client.get("/sast/scans/scan-1", headers={"Authorization": f"Bearer {tokenless}"})
    assert r.status_code == 401
    assert "claims" in r.json()["message"]


def test_expired_token_is_rejected(client):
    import datetime
    expired = jwt.encode(
        {"userId": "u", "email": "e", "tenantId": "t",
         "exp": datetime.datetime(2020, 1, 1).timestamp()},
        SECRET, algorithm="HS256")
    r = client.get("/sast/scans/scan-1", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401
    assert "expired" in r.json()["message"]


def test_unconfigured_secret_fails_closed(client, monkeypatch):
    """A missing JWT_SECRET must never mean "skip authentication"."""
    monkeypatch.delenv("JWT_SECRET", raising=False)
    r = client.get("/sast/scans/scan-1", headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 500
    assert r.json()["code"] == "AUTH_NOT_CONFIGURED"


# ── tenant isolation ───────────────────────────────────────────────────────

@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_scan_lookup_is_tenant_scoped(mock_row, client):
    mock_row.return_value = SCAN_ROW
    client.get("/sast/scans/scan-1", headers={"Authorization": f"Bearer {_token('org-9')}"})

    sql, scan_id, tenant_id = mock_row.await_args_list[0][0]
    assert "organization_id = $2" in sql
    assert (scan_id, tenant_id) == ("scan-1", "org-9")


@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_other_tenant_gets_404_not_403(mock_row, client):
    """Confirming an id exists is itself a disclosure."""
    mock_row.return_value = None
    r = client.get("/sast/scans/scan-1", headers={"Authorization": f"Bearer {_token('other-org')}"})
    assert r.status_code == 404
    assert r.json() == {"message": "Scan not found.", "code": "NOT_FOUND"}


@patch("src.api.routes.queue.send", new_callable=AsyncMock)
@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_cannot_run_another_tenants_scan(mock_row, mock_send, client):
    mock_row.return_value = None
    r = client.post("/sast/scans/scan-1/run", json={},
                    headers={"Authorization": f"Bearer {_token('other-org')}"})
    assert r.status_code == 404
    mock_send.assert_not_awaited()


# ── run ────────────────────────────────────────────────────────────────────

@patch("src.api.routes.queue.send", new_callable=AsyncMock)
@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_run_enqueues_with_tenant_and_options(mock_row, mock_send, client):
    mock_row.return_value = SCAN_ROW
    mock_send.return_value = "job-7"

    r = client.post("/sast/scans/scan-1/run",
                    json={"options": {"enableSonarqube": False}},
                    headers={"Authorization": f"Bearer {_token('org-9')}"})

    assert r.status_code == 200
    assert r.json() == {"jobId": "job-7", "scanId": "scan-1", "status": "queued"}

    _, payload = mock_send.await_args[0]
    assert payload["scanId"] == "scan-1"
    assert payload["tenantId"] == "org-9", "tenant comes from the token, never the body"
    assert payload["options"]["enable_sonarqube"] is False
    assert payload["options"]["enable_semgrep"] is True


@patch("src.api.routes.queue.send", new_callable=AsyncMock)
@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_run_with_no_body_enables_everything(mock_row, mock_send, client):
    mock_row.return_value = SCAN_ROW
    mock_send.return_value = "job-7"
    r = client.post("/sast/scans/scan-1/run", json={},
                    headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 200
    assert all(v is True for v in mock_send.await_args[0][1]["options"].values())


@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_unknown_option_is_rejected(mock_row, client):
    """extra="forbid": a typo in a toggle must not silently mean "enabled"."""
    mock_row.return_value = SCAN_ROW
    r = client.post("/sast/scans/scan-1/run", json={"options": {"enableSemgrap": False}},
                    headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_ERROR"


# ── status ─────────────────────────────────────────────────────────────────

@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_status_response_shape(mock_row, client):
    mock_row.return_value = SCAN_ROW
    r = client.get("/sast/scans/scan-1", headers={"Authorization": f"Bearer {_token()}"})

    body = r.json()
    assert body["scanId"] == "scan-1"
    assert body["status"] == "completed"
    assert body["summary"]["totalFindings"] == 2
    assert body["summary"]["partial"] is False
    assert body["engineStatus"]["semgrep"]["status"] == "ok"
    assert body["qualityGateStatus"] == "failed"
    assert body["progress"]["phase"] == "done", "progress is lifted out of the summary"


@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_partial_scan_surfaces_failed_engines(mock_row, client):
    row = dict(SCAN_ROW)
    row["summary"] = {**SCAN_ROW["summary"], "partial": True, "failedEngines": ["codeql"]}
    row["engine_status"] = {"codeql": {"status": "failed", "error": "no cli"}}
    row["quality_gate_status"] = None
    mock_row.return_value = row

    body = client.get("/sast/scans/scan-1",
                      headers={"Authorization": f"Bearer {_token()}"}).json()
    assert body["summary"]["partial"] is True
    assert body["summary"]["failedEngines"] == ["codeql"]
    assert body["engineStatus"]["codeql"]["error"] == "no cli"
    assert body["qualityGateStatus"] is None


@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_missing_summary_fields_default(mock_row, client):
    mock_row.return_value = {**SCAN_ROW, "summary": {}, "engine_status": None}
    body = client.get("/sast/scans/scan-1",
                      headers={"Authorization": f"Bearer {_token()}"}).json()
    assert body["summary"]["totalFindings"] == 0
    assert body["engineStatus"] == {}
    assert body["progress"] is None


# ── findings ───────────────────────────────────────────────────────────────

FINDING_ROW = {
    "id": "f1", "rule_id": "py/sqli", "severity": "error", "message": "SQL injection",
    "file_path": "app.py", "start_line": 12, "end_line": 14, "snippet": "q = f'...'",
    "suppressed_by_llm": False, "suppression_reason": None, "created_at": None,
}
COUNTS = {"error": 1, "warning": 0, "info": 0, "suppressed": 3}


@patch("src.api.routes.fetch_all", new_callable=AsyncMock)
@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_findings_response_shape(mock_row, mock_all, client):
    mock_row.side_effect = [SCAN_ROW, COUNTS, {"n": 1}]
    mock_all.return_value = [FINDING_ROW]

    body = client.get("/sast/scans/scan-1/findings",
                      headers={"Authorization": f"Bearer {_token()}"}).json()

    assert body["total"] == 1 and body["hasMore"] is False
    assert body["counts"] == {"error": 1, "warning": 0, "info": 0, "suppressed": 3}
    f = body["findings"][0]
    assert f["ruleId"] == "py/sqli" and f["startLine"] == 12 and f["endLine"] == 14
    assert f["suppressedByLlm"] is False


@patch("src.api.routes.fetch_all", new_callable=AsyncMock)
@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_suppressed_findings_are_excluded_by_default(mock_row, mock_all, client):
    mock_row.side_effect = [SCAN_ROW, COUNTS, {"n": 0}]
    mock_all.return_value = []
    client.get("/sast/scans/scan-1/findings", headers={"Authorization": f"Bearer {_token()}"})
    assert "NOT suppressed_by_llm" in mock_all.await_args[0][0]


@patch("src.api.routes.fetch_all", new_callable=AsyncMock)
@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_include_suppressed_lets_a_reviewer_audit_the_filter(mock_row, mock_all, client):
    mock_row.side_effect = [SCAN_ROW, COUNTS, {"n": 0}]
    mock_all.return_value = []
    client.get("/sast/scans/scan-1/findings?includeSuppressed=true",
               headers={"Authorization": f"Bearer {_token()}"})
    assert "NOT suppressed_by_llm" not in mock_all.await_args[0][0]


@patch("src.api.routes.fetch_all", new_callable=AsyncMock)
@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_pagination_reports_has_more(mock_row, mock_all, client):
    mock_row.side_effect = [SCAN_ROW, COUNTS, {"n": 120}]
    mock_all.return_value = [FINDING_ROW] * 50
    body = client.get("/sast/scans/scan-1/findings?limit=50&offset=0",
                      headers={"Authorization": f"Bearer {_token()}"}).json()
    assert body["total"] == 120 and body["hasMore"] is True


@pytest.mark.parametrize("qs,reason", [
    ("limit=0", "below minimum"),
    ("limit=500", "above the page cap"),
    ("offset=-1", "negative offset"),
    ("severity=critical", "not in the canonical vocabulary"),
])
@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_invalid_query_parameters_are_rejected(mock_row, client, qs, reason):
    mock_row.return_value = SCAN_ROW
    r = client.get(f"/sast/scans/scan-1/findings?{qs}",
                   headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 422, reason
    assert r.json()["code"] == "VALIDATION_ERROR"


@patch("src.api.routes.fetch_all", new_callable=AsyncMock)
@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_severity_filter_is_parameterized(mock_row, mock_all, client):
    """Severity reaches SQL as a bound parameter, never interpolated."""
    mock_row.side_effect = [SCAN_ROW, COUNTS, {"n": 0}]
    mock_all.return_value = []
    client.get("/sast/scans/scan-1/findings?severity=error",
               headers={"Authorization": f"Bearer {_token()}"})

    args = mock_all.await_args[0]
    assert "severity = $2" in args[0]
    assert "error" in args[1:]


# ── health ─────────────────────────────────────────────────────────────────

@patch("src.api.routes.fetch_all", new_callable=AsyncMock)
def test_health_needs_no_token(mock_all, client):
    mock_all.return_value = [{"name": "security-scan", "queued": 2, "active": 1}]
    body = client.get("/sast/health").json()
    assert body == {"status": "ok", "database": True,
                    "queues": [{"name": "security-scan", "queued": 2, "active": 1}]}


@patch("src.api.routes.fetch_all", new_callable=AsyncMock)
def test_health_reports_degraded_without_a_database(mock_all, client):
    mock_all.side_effect = Exception("connection refused")
    body = client.get("/sast/health").json()
    assert body["status"] == "degraded" and body["database"] is False


@patch("src.api.routes.fetch_row", new_callable=AsyncMock)
def test_unhandled_errors_do_not_leak_internals(mock_row, client):
    """The message could contain a clone URL with a token."""
    mock_row.side_effect = Exception("clone https://x-access-token:ghp_secret@github.com failed")
    r = client.get("/sast/scans/scan-1", headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 500
    assert r.json() == {"message": "An unexpected error occurred.", "code": "INTERNAL_ERROR"}
    assert "ghp_secret" not in r.text


# ── engine settings ────────────────────────────────────────────────────────

@patch("src.api.routes.engine_settings.get_all_settings", new_callable=AsyncMock)
def test_settings_returns_defaults_for_a_fresh_tenant(mock_get, client):
    from src.infrastructure.engine_settings import DEFAULTS
    mock_get.return_value = {k: dict(v) for k, v in DEFAULTS.items()}

    body = client.get("/sast/settings", headers={"Authorization": f"Bearer {_token()}"}).json()
    assert body["sonarqube"]["enabled"] is True
    assert body["codeql"]["querySuite"] == "security-and-quality"
    assert mock_get.await_args[0][0] == "org-9", "scoped to the token's tenant"


def test_settings_requires_a_token(client):
    assert client.get("/sast/settings").status_code == 401


@patch("src.api.routes.engine_settings.save_settings", new_callable=AsyncMock)
def test_put_settings_validates_against_the_engine_schema(mock_save, client):
    mock_save.side_effect = lambda t, e, c: c
    r = client.put("/sast/settings/codeql",
                   json={"languages": ["python"], "querySuite": "security-extended"},
                   headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 200
    assert r.json()["config"]["querySuite"] == "security-extended"


@pytest.mark.parametrize("body,why", [
    ({"languages": ["cobol"]}, "language not supported by codeql"),
    ({"querySuite": "everything"}, "suite not in the catalogue"),
    ({"timeoutSeconds": 5}, "below the floor"),
    ({"buildMode": "make"}, "not a valid build mode"),
])
@patch("src.api.routes.engine_settings.save_settings", new_callable=AsyncMock)
def test_put_settings_rejects_bad_codeql_config(mock_save, client, body, why):
    r = client.put("/sast/settings/codeql", json=body,
                   headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 422, why
    mock_save.assert_not_awaited()


@patch("src.api.routes.engine_settings.save_settings", new_callable=AsyncMock)
def test_sonar_host_must_be_https(mock_save, client):
    r = client.put("/sast/settings/sonarqube", json={"hostUrl": "http://sonar.internal"},
                   headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 422
    assert "https" in r.json()["message"]
    mock_save.assert_not_awaited()


@pytest.mark.parametrize("key", ["token", "secret", "password", "apiKey"])
@patch("src.api.routes.engine_settings.save_settings", new_callable=AsyncMock)
def test_credentials_are_refused_with_an_explanation(mock_save, client, key):
    """A token in a settings row would land in every backup and every SELECT."""
    r = client.put("/sast/settings/sonarqube", json={"hostUrl": "https://s", key: "leak"},
                   headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 422
    assert r.json()["code"] == "SECRET_NOT_ALLOWED"
    assert "secret store" in r.json()["message"]
    mock_save.assert_not_awaited()


def test_unknown_engine_names_the_configurable_ones(client):
    r = client.put("/sast/settings/nessus", json={},
                   headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 404
    assert "sonarqube" in r.json()["message"]
