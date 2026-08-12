import os
from typing import Dict

# Cached so a job that needs several secrets does not re-resolve each one.
_cache: Dict[str, str] = {}


async def get_cloudflare_secret(secret_name: str) -> str:
    """Resolve a secret from the process environment.

    The previous implementation made an HTTP call to the Cloudflare API, looped
    over the response, hit a bare `pass`, and then fell through to os.getenv
    regardless — a network round trip per lookup (twice per SonarQube job) that
    could not return anything. Cloudflare Secrets Store is injected into the
    environment at deploy time (`LOAD_SECRETS_FROM=cloudflare`, see
    docs/operations/railway.mdx), so reading the environment IS reading
    Cloudflare; there was never a second source to consult.
    """
    if secret_name in _cache:
        return _cache[secret_name]

    value = os.getenv(secret_name)
    if not value:
        raise ValueError(f"Secret {secret_name!r} not found in the environment")

    _cache[secret_name] = value
    return value


def clear_secret_cache() -> None:
    _cache.clear()
