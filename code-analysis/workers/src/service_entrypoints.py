"""
Importable app objects, one per service.

uvicorn resolves targets by import string, so each service needs a module-level
name. Generated from the registry rather than hand-written so adding a service
means editing one list.
"""

from src.service_app import build_app
from src.service_registry import BY_NAME

api_app = build_app(BY_NAME["api"])
gateway_app = build_app(BY_NAME["gateway"])
aggregator_app = build_app(BY_NAME["aggregator"])
semgrep_app = build_app(BY_NAME["semgrep"])
regex_app = build_app(BY_NAME["regex"])
bearer_app = build_app(BY_NAME["bearer"])
codeql_app = build_app(BY_NAME["codeql"])
