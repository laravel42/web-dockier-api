import os

# src/infrastructure/config.py raises at import time when DATABASE_URL is unset,
# which would break collection of every test. Set it before any src import.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

import pytest


class FakeRedis:
    """
    In-memory stand-in for redis.asyncio.Redis, returning bytes exactly as the
    real client does when decode_responses is off.

    The aggregator's fan-in bug was a serialization mismatch between its write
    and read paths. A pure-mock redis cannot catch that class of defect because
    the test author picks both sides; a fake that genuinely stores what it was
    given can.
    """

    def __init__(self):
        self.sets: dict[str, set[bytes]] = {}
        self.lists: dict[str, list[bytes]] = {}
        self.hashes: dict[str, dict[bytes, bytes]] = {}
        self.strings: dict[str, bytes] = {}
        self.published: list[tuple[str, str]] = []

    @staticmethod
    def _b(v):
        return v.encode("utf-8") if isinstance(v, str) else v

    async def sadd(self, key, *values):
        bucket = self.sets.setdefault(key, set())
        added = 0
        for v in values:
            b = self._b(v)
            if b not in bucket:
                bucket.add(b)
                added += 1
        return added

    async def smembers(self, key):
        return set(self.sets.get(key, set()))

    async def rpush(self, key, *values):
        bucket = self.lists.setdefault(key, [])
        bucket.extend(self._b(v) for v in values)
        return len(bucket)

    async def lrange(self, key, start, end):
        items = self.lists.get(key, [])
        return items[start:] if end == -1 else items[start : end + 1]

    async def hset(self, key, field, value):
        self.hashes.setdefault(key, {})[self._b(field)] = self._b(value)
        return 1

    async def hgetall(self, key):
        return dict(self.hashes.get(key, {}))

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.strings:
            return None
        self.strings[key] = self._b(value)
        return True

    async def delete(self, *keys):
        for key in keys:
            self.sets.pop(key, None)
            self.lists.pop(key, None)
            self.hashes.pop(key, None)
            self.strings.pop(key, None)
        return len(keys)

    async def publish(self, channel, message):
        self.published.append((channel, message))
        return 1


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture
def finding():
    """A complete finding. Partial dicts no longer pass ScanFinding validation."""
    def _make(rule_id="rule-1", line=10, file_path="src/app.py"):
        return {
            "rule_id": rule_id,
            "severity": "error",
            "message": "Potential issue",
            "file_path": file_path,
            "line": line,
        }
    return _make
