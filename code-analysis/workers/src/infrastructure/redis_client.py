import os
import redis.asyncio as redis_async

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost")

def get_redis_client() -> redis_async.Redis:
    return redis_async.from_url(REDIS_URL)

def get_redis_pubsub(client: redis_async.Redis) -> redis_async.client.PubSub:
    return client.pubsub()
