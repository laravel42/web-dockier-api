"""
Sensitive-data detection over schema and model files.

Port of backend/src/services/git-integration/domain/sensitive-data-scanner.ts and
the conversion half of scan-analysis.ts. Pattern-based, no AI credits consumed —
that property is part of the product promise in DESCRIPTION.md.
"""

import os
import re
from typing import Any, Dict, List, Optional, Tuple

SECRET_PATTERNS = [(re.compile(r"secret|api_?key|private_?key|token|jwt|encryption", re.I),
                    "Credential or secret material")]
SENSITIVE_PATTERNS = [(re.compile(r"credit_?card|iban|bank_?account|ssn|tax_?id|passport|salary|billing", re.I),
                       "Financial or regulated identifier")]
PERSONAL_PATTERNS = [(re.compile(r"email|phone|name|address|birth|dob|ip_?address|location", re.I),
                      "Personally identifiable information")]

SKIP_FIELDS = re.compile(
    r"^(id|uuid|_id|created_?at|updated_?at|deleted_?at|remember_token|email_verified_at)$", re.I)

# One-way password hashes — storing these does not expose recoverable credentials.
HASHED_CREDENTIAL_FIELDS = re.compile(
    r"^(password|passwd|passphrase|encrypted_password|password_hash|hashed_password"
    r"|password_digest|passwd_hash|pass_hash|bcrypt)$", re.I)

PLAINTEXT_CREDENTIAL_FIELDS = re.compile(
    r"plain(_)?password|password_(plain|raw|cleartext)|raw_password|cleartext_password", re.I)

FRAMEWORK_TABLES = {
    "migrations", "jobs", "failed_jobs", "sessions", "cache", "cache_locks",
    "password_resets", "password_reset_tokens", "personal_access_tokens",
    "oauth_access_tokens", "oauth_auth_codes", "oauth_clients",
    "oauth_personal_access_clients", "oauth_refresh_tokens",
    "telescope_entries", "telescope_entries_tags", "telescope_monitoring",
    "pulse_aggregates", "pulse_entries", "pulse_values",
    "notifications", "job_batches",
}

_SQL_COLUMN_TYPE = (
    r"(?:VARCHAR|CHAR|TEXT|INT|INTEGER|BIGINT|SMALLINT|TINYINT|DECIMAL|NUMERIC|FLOAT|DOUBLE"
    r"|BOOLEAN|BOOL|DATE|DATETIME|TIMESTAMP|TIME|YEAR|BLOB|BINARY|VARBINARY|JSON|JSONB|UUID"
    r"|SERIAL|ENUM|SET|BYTEA)")

CREATE_TABLE_REGEX = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\"']?(\w+)[`\"']?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;|\))",
    re.I)
SQL_COLUMN_REGEX = re.compile(r"[`\"']?(\w+)[`\"']?\s+" + _SQL_COLUMN_TYPE, re.I)
MODEL_PROP_REGEX = re.compile(r"(?:readonly\s+)?(\w+)\s*[?:]?\s*[:=]")

SCHEMA_FILE_PATTERN = re.compile(r"(?:^|/)(?:migrations?/.*\.sql|schema\.sql)$", re.I)
MODEL_FILE_PATTERN = re.compile(r"\.(ts|tsx|js|jsx|py|rb|php|prisma)$", re.I)

SENSITIVITY_SEVERITY = {"secret": "error", "sensitive": "warning", "personal": "info"}


def is_schema_file(path: str) -> bool:
    return bool(SCHEMA_FILE_PATTERN.search(path))


def is_model_file(path: str) -> bool:
    return bool(MODEL_FILE_PATTERN.search(path))


def classify_field(field_name: str) -> Optional[Tuple[str, str]]:
    """Return (sensitivity, reason), or None when the field is uninteresting."""
    if SKIP_FIELDS.match(field_name):
        return None
    # A bcrypt hash is not a recoverable credential; flagging it trains people
    # to ignore the scanner.
    if HASHED_CREDENTIAL_FIELDS.match(field_name):
        return None
    if PLAINTEXT_CREDENTIAL_FIELDS.search(field_name):
        return "secret", "Plaintext credential storage"

    for patterns, sensitivity in (
        (SECRET_PATTERNS, "secret"),
        (SENSITIVE_PATTERNS, "sensitive"),
        (PERSONAL_PATTERNS, "personal"),
    ):
        for pattern, reason in patterns:
            if pattern.search(field_name):
                return sensitivity, reason
    return None


def _parse_sql(schema_files: Dict[str, str]) -> List[Dict[str, str]]:
    results = []
    for sql in schema_files.values():
        for table_match in CREATE_TABLE_REGEX.finditer(sql):
            table = table_match.group(1)
            if table in FRAMEWORK_TABLES:
                continue
            for column_match in SQL_COLUMN_REGEX.finditer(table_match.group(2)):
                field = column_match.group(1)
                classified = classify_field(field)
                if classified:
                    results.append({"entity": table, "field": field,
                                    "sensitivity": classified[0], "reason": classified[1]})
    return results


def scan_sensitive_data(schema_files: Dict[str, str], model_files: Dict[str, str]) -> List[Dict[str, str]]:
    """Classify fields across SQL schemas and model/interface files, deduped by entity.field."""
    findings = _parse_sql(schema_files)

    for path, content in model_files.items():
        entity = re.sub(r"\.(ts|js|py|rb|php|prisma)$", "", os.path.basename(path)) or "Unknown"
        for prop_match in MODEL_PROP_REGEX.finditer(content):
            field = prop_match.group(1)
            classified = classify_field(field)
            if classified:
                findings.append({"entity": entity, "field": field,
                                 "sensitivity": classified[0], "reason": classified[1]})

    seen = set()
    deduped = []
    for entry in findings:
        key = (entry["entity"], entry["field"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(entry)
    return deduped


def _locate(field: Dict[str, str], files: Dict[str, str]) -> Optional[Tuple[str, int, str]]:
    """Find the first line mentioning the field, so the finding points somewhere real."""
    needle = re.compile(rf"\b{re.escape(field['field'])}\b")
    for path, content in files.items():
        for line_num, line in enumerate(content.splitlines(), 1):
            if needle.search(line):
                return path, line_num, line.strip()
    return None


def to_findings(fields, schema_files: Dict[str, str], model_files: Dict[str, str]) -> List[Dict[str, Any]]:
    findings = []
    for field in fields:
        location = _locate(field, schema_files) or _locate(field, model_files)
        if location:
            file_path, line, snippet = location
        else:
            file_path = next(iter(schema_files), None) or next(iter(model_files), None) or "unknown"
            line, snippet = 1, f"{field['entity']}.{field['field']}"

        findings.append({
            "rule_id": f"sensitive-data.{field['sensitivity']}",
            "severity": SENSITIVITY_SEVERITY[field["sensitivity"]],
            "message": f"{field['reason']} ({field['entity']}.{field['field']})",
            "file_path": file_path,
            "line": line,
            "end_line": line,
            "snippet": snippet,
        })
    return findings


def run_sensitive_data_scan(files: List[Tuple[str, str]]) -> List[Dict[str, Any]]:
    """Entry point: takes (relative_path, content) pairs from the walked repo."""
    schema_files = {p: c for p, c in files if is_schema_file(p)}
    model_files = {p: c for p, c in files if is_model_file(p)}
    if not schema_files and not model_files:
        return []
    return to_findings(scan_sensitive_data(schema_files, model_files), schema_files, model_files)
