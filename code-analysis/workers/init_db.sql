CREATE SCHEMA IF NOT EXISTS pgboss;

CREATE TABLE IF NOT EXISTS pgboss.job (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    data JSONB,
    output JSONB,
    createdon TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    startedon TIMESTAMP WITH TIME ZONE,
    completedon TIMESTAMP WITH TIME ZONE,
    state TEXT,
    keepuntil TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS security_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_url TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    status TEXT,
    findings JSONB,
    engine_status JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Backfill for databases created before engine_status existed.
ALTER TABLE security_scans ADD COLUMN IF NOT EXISTS engine_status JSONB;

CREATE TABLE IF NOT EXISTS tool_configurations (
    engine TEXT PRIMARY KEY,
    config JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO tool_configurations (engine, config) VALUES
('gateway', '{"s3_bucket": "dockier-sast-codebases", "clone_timeout_seconds": 300, "storage_type": "local"}'),
('semgrep', '{"flags": ["--quiet", "--json"], "active_rulesets": ["p/default", "p/security-audit"]}'),
('regex', '{"rules": [{"rule_id": "dockier-hardcoded-secret", "regex": "(?i)(api[_-]?key|secret|token|password)[\\s:=]+[\"\\''].{16,}?[\"\\'']", "message": "Potential hardcoded credential or secret key exposed in cleartext.", "severity": "high"}]}'),
('sonarqube', '{"host_url": "https://sonarqube.local", "default_quality_gate": "Sonar way"}'),
('codeql', '{"supported_languages": ["python", "javascript", "go", "ruby"], "extra_query_paths": []}')
ON CONFLICT (engine) DO NOTHING;

CREATE TABLE IF NOT EXISTS rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engine TEXT NOT NULL,
    rule_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL, -- blocker, critical, major, minor, info
    type TEXT NOT NULL, -- vulnerability, bug, code_smell
    default_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quality_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, language)
);

CREATE TABLE IF NOT EXISTS quality_profile_rules (
    profile_id UUID REFERENCES quality_profiles(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES rules(id) ON DELETE CASCADE,
    severity_override TEXT, -- if null, use rule's default
    PRIMARY KEY (profile_id, rule_id)
);

CREATE TABLE IF NOT EXISTS quality_gates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_default BOOLEAN DEFAULT false,
    conditions JSONB DEFAULT '[]', -- array of { metric: "high_severity", operator: ">", threshold: 0 }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Initial Data
INSERT INTO rules (engine, rule_key, name, description, severity, type) VALUES
('regex', 'dockier-hardcoded-secret', 'Hardcoded Secret Detected', 'Potential hardcoded credential or secret key exposed in cleartext.', 'critical', 'vulnerability'),
('semgrep', 'python.django.security.injection', 'SQL Injection', 'Detected SQL injection vulnerability in Django ORM', 'blocker', 'vulnerability'),
('semgrep', 'javascript.express.security.xss', 'Cross-Site Scripting (XSS)', 'Unsanitized input rendered in Express', 'major', 'vulnerability'),
('sonarqube', 'python:S107', 'Too Many Parameters', 'Functions should not have too many parameters', 'minor', 'code_smell'),
('codeql', 'py/sql-injection', 'SQL Injection', 'This query depends on a user-provided value.', 'blocker', 'vulnerability')
ON CONFLICT (rule_key) DO NOTHING;

INSERT INTO quality_profiles (name, language, is_default) VALUES
('Sonar way', 'python', true),
('Sonar way', 'javascript', true)
ON CONFLICT (name, language) DO NOTHING;

INSERT INTO quality_gates (name, is_default, conditions) VALUES
('Dockier way', true, '[{"metric": "vulnerabilities", "operator": ">", "threshold": 0}, {"metric": "code_smells", "operator": ">", "threshold": 50}]')
ON CONFLICT (name) DO NOTHING;
