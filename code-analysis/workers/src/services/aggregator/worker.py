import asyncio
import json
from src.infrastructure.redis_client import get_redis_client, get_redis_pubsub
from src.services.aggregator.service import AggregatorService

async def start_aggregator_worker():
    print("[*] Aggregator Worker listening on Redis channel 'scan:results'...")
    redis_client = get_redis_client()
    pubsub = get_redis_pubsub(redis_client)
    await pubsub.subscribe("scan:results")
    
    service = AggregatorService()
    
    async for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            asyncio.create_task(service.process_result(data))

if __name__ == "__main__":
    asyncio.run(start_aggregator_worker())
