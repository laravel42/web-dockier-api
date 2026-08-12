import pytest

from src.infrastructure.sensitive_data import (
    classify_field, is_model_file, is_schema_file, run_sensitive_data_scan,
    scan_sensitive_data,
)


@pytest.mark.parametrize("field,sensitivity", [
    ("api_key", "secret"), ("stripe_secret", "secret"), ("jwt_token", "secret"),
    ("credit_card", "sensitive"), ("iban", "sensitive"), ("ssn", "sensitive"),
    ("email", "personal"), ("phone_number", "personal"), ("date_of_birth", "personal"),
])
def test_field_classification(field, sensitivity):
    result = classify_field(field)
    assert result is not None and result[0] == sensitivity


@pytest.mark.parametrize("field", ["id", "uuid", "created_at", "updated_at", "remember_token"])
def test_bookkeeping_fields_are_skipped(field):
    assert classify_field(field) is None


@pytest.mark.parametrize("field", ["password", "password_hash", "encrypted_password", "bcrypt"])
def test_hashed_credentials_are_not_flagged(field):
    """A bcrypt hash is not a recoverable credential; flagging it trains people to ignore the scanner."""
    assert classify_field(field) is None


@pytest.mark.parametrize("field", ["plain_password", "raw_password", "cleartext_password"])
def test_plaintext_credentials_are_flagged_as_secret(field):
    result = classify_field(field)
    assert result == ("secret", "Plaintext credential storage")


def test_sql_schema_fields_are_classified():
    sql = """
    CREATE TABLE users (
        id INT PRIMARY KEY,
        email VARCHAR(255),
        api_key VARCHAR(255),
        password_hash VARCHAR(255),
        created_at TIMESTAMP
    );
    """
    fields = scan_sensitive_data({"migrations/001_users.sql": sql}, {})
    found = {f["field"]: f["sensitivity"] for f in fields}

    assert found == {"email": "personal", "api_key": "secret"}


def test_framework_tables_are_ignored():
    sql = "CREATE TABLE personal_access_tokens (id INT, token VARCHAR(255));"
    assert scan_sensitive_data({"migrations/001.sql": sql}, {}) == []


def test_fields_are_deduped_across_entities():
    sql = "CREATE TABLE users (email VARCHAR(255), email VARCHAR(255));"
    assert len(scan_sensitive_data({"migrations/001.sql": sql}, {})) == 1


@pytest.mark.parametrize("path,schema,model", [
    ("migrations/001_init.sql", True, False),
    ("db/schema.sql", True, False),
    ("src/models/User.ts", False, True),
    ("app/Models/User.php", False, True),
    ("prisma/schema.prisma", False, True),
    ("README.md", False, False),
])
def test_file_classification(path, schema, model):
    assert is_schema_file(path) is schema
    assert is_model_file(path) is model


def test_run_scan_produces_located_findings():
    sql = "CREATE TABLE users (\n  id INT,\n  api_key VARCHAR(255)\n);"
    findings = run_sensitive_data_scan([("migrations/001_users.sql", sql)])

    assert len(findings) == 1
    f = findings[0]
    assert f["rule_id"] == "sensitive-data.secret"
    assert f["severity"] == "error"
    assert f["file_path"] == "migrations/001_users.sql"
    assert f["line"] == 3, "the finding must point at the line the field is on"
    assert "api_key" in f["snippet"]
    assert "users.api_key" in f["message"]


def test_no_schema_or_model_files_means_no_findings():
    assert run_sensitive_data_scan([("README.md", "email: someone@example.com")]) == []


def test_severity_ladder():
    sql = "CREATE TABLE t (api_key VARCHAR(9), iban VARCHAR(9), email VARCHAR(9));"
    findings = run_sensitive_data_scan([("migrations/1.sql", sql)])
    by_rule = {f["rule_id"]: f["severity"] for f in findings}

    assert by_rule == {
        "sensitive-data.secret": "error",
        "sensitive-data.sensitive": "warning",
        "sensitive-data.personal": "info",
    }
