import re

# Precise AST-like heuristic matching definitions
CUSTOM_RULES = [
    {
        "id": "dockier-sqli-raw-interpolation",
        "regex": r"(?i)\.(execute|rawQuery|query)\s*\(\s*[`'\"](?=.*\$).*[`'\"]\s*\)",
        "message": "Potential SQL Injection via unparameterized string interpolation.",
        "severity": "error"
    },
    {
        "id": "dockier-hardcoded-secret",
        "regex": r"(?i)(password|secret|api_key|token|passwd)\s*=\s*['\"][a-zA-Z0-9_\-]{12,}['\"]",
        "message": "Potential hardcoded credential or secret key exposed in cleartext.",
        "severity": "error"
    }
]

def get_compiled_rules():
    return [(r["id"], re.compile(r["regex"]), r["message"], r["severity"]) for r in CUSTOM_RULES]
