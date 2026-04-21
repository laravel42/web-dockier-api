-- Default custom security rules (system rules with app_id = '')
-- These are regex-based rules that complement Semgrep

-- SQL Injection
INSERT INTO custom_rules (id, app_id, rule_id, severity, message, pattern, extensions) VALUES
  ('seed-custom.sql-injection.raw-query', '', 'custom.sql-injection.raw-query', 'error', 'Potential SQL injection: raw query with variable interpolation', '\b(?:DB::raw|DB::select|DB::statement|DB::unprepared)\s*\([^)]*\$(?!this->)', '{.php}'),
  ('seed-custom.sql-injection.query-concat', '', 'custom.sql-injection.query-concat', 'error', 'SQL query built with string concatenation', '(?:->whereRaw|->havingRaw|->orderByRaw|->groupByRaw|->selectRaw)\s*\([^)]*[\$"''].*\.\s*\$', '{.php}'),
  ('seed-custom.sql-injection.pdo-concat', '', 'custom.sql-injection.pdo-concat', 'error', 'PDO query with concatenated variables', '->(?:query|exec|prepare)\s*\(\s*["''].*\.\s*\$', '{.php}')
ON CONFLICT (id) DO NOTHING;

-- XSS
INSERT INTO custom_rules (id, app_id, rule_id, severity, message, pattern, extensions) VALUES
  ('seed-custom.xss.unescaped-output', '', 'custom.xss.unescaped-output', 'warning', 'Unescaped output in Blade template', '\{!!\s*\$(?!__)', '{.blade.php}'),
  ('seed-custom.xss.v-html', '', 'custom.xss.v-html', 'warning', 'v-html can lead to XSS if used with user input', 'v-html\s*=\s*"', '{.vue}'),
  ('seed-custom.xss.dangerouslySetInnerHTML', '', 'custom.xss.dangerouslySetInnerHTML', 'warning', 'dangerouslySetInnerHTML can lead to XSS', 'dangerouslySetInnerHTML', '{.jsx,.tsx}')
ON CONFLICT (id) DO NOTHING;

-- Auth & Secrets
INSERT INTO custom_rules (id, app_id, rule_id, severity, message, pattern, extensions) VALUES
  ('seed-custom.auth.hardcoded-secret', '', 'custom.auth.hardcoded-secret', 'error', 'Hardcoded secret or API key detected', '(?:secret|api_key|apikey|password|passwd|token|auth_token|private_key)\s*[:=]\s*[''"][A-Za-z0-9+/=]{8,}[''"]', '{.php,.env,.js,.ts,.py,.rb,.yaml,.yml,.json}')
ON CONFLICT (id) DO NOTHING;

-- Command Injection
INSERT INTO custom_rules (id, app_id, rule_id, severity, message, pattern, extensions) VALUES
  ('seed-custom.cmd.injection', '', 'custom.cmd.injection', 'error', 'Potential command injection', '(?:exec|system|passthru|shell_exec|popen|proc_open)\s*\([^)]*\$(?:_GET|_POST|_REQUEST|input)', '{.php}')
ON CONFLICT (id) DO NOTHING;

-- JavaScript
INSERT INTO custom_rules (id, app_id, rule_id, severity, message, pattern, extensions) VALUES
  ('seed-custom.js.eval', '', 'custom.js.eval', 'error', 'eval() is dangerous — can execute arbitrary code', '\beval\s*\(', '{.js,.ts,.jsx,.tsx}'),
  ('seed-custom.js.innerhtml', '', 'custom.js.innerhtml', 'warning', 'innerHTML assignment can lead to XSS', '\.innerHTML\s*=', '{.js,.ts,.jsx,.tsx}')
ON CONFLICT (id) DO NOTHING;

-- Crypto
INSERT INTO custom_rules (id, app_id, rule_id, severity, message, pattern, extensions) VALUES
  ('seed-custom.crypto.weak-hash', '', 'custom.crypto.weak-hash', 'warning', 'Weak hashing algorithm — use bcrypt/argon2 for passwords', '\b(?:md5|sha1)\s*\(', '{.php,.py,.js,.ts}'),
  ('seed-custom.crypto.ecb-mode', '', 'custom.crypto.ecb-mode', 'error', 'ECB mode is insecure — use CBC or GCM', 'MCRYPT_MODE_ECB|AES-128-ECB|AES-256-ECB|[''"]ecb[''"]', '{.php,.py,.js,.ts}')
ON CONFLICT (id) DO NOTHING;

-- Generic
INSERT INTO custom_rules (id, app_id, rule_id, severity, message, pattern, extensions) VALUES
  ('seed-custom.generic.cors-wildcard', '', 'custom.generic.cors-wildcard', 'warning', 'CORS allows all origins — restrict in production', '(?:Access-Control-Allow-Origin|allowedOrigins|cors)\s*(?:=>|:|\()\s*[''"\[]*\*', '{.php,.js,.ts,.py,.json,.yaml,.yml}'),
  ('seed-custom.generic.http-no-tls', '', 'custom.generic.http-no-tls', 'info', 'HTTP URL without TLS — consider using HTTPS', '[''"]http://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)', '{.php,.js,.ts,.py,.rb,.java,.go,.env,.yaml,.yml,.json}')
ON CONFLICT (id) DO NOTHING;
