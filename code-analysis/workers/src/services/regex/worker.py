import asyncio
import json
from src.infrastructure.redis_client import get_redis_client, get_redis_pubsub
from src.services.regex.service import RegexService

async def start_regex_worker():
    print("[*] Regex Service listening on Redis channel 'scan:regex'...")
    redis_client = get_redis_client()
    pubsub = get_redis_pubsub(redis_client)
    await pubsub.subscribe("scan:regex")
    
    service = RegexService()
    
    async for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            asyncio.create_task(service.process_job(data))

if __name__ == "__main__":
    asyncio.run(start_regex_worker())
