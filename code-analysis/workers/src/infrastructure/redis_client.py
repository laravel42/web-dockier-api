import os
from typing import Optional

import redis.asyncio as redis_async

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost")

_client: Optional[redis_async.Redis] = None


def get_redis_client() -> redis_async.Redis:
    """Process-wide client.

    This previously built a new client — and so a new connection pool — on every
    call, and the API routers construct a service per HTTP request. Nothing was
    ever closed, so connections leaked for the life of the process.
    """
    global _client
    if _client is None:
        _client = redis_async.from_url(REDIS_URL)
    return _client


async def close_redis_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
