import asyncio
import json
from src.infrastructure.redis_client import get_redis_client, get_redis_pubsub
from src.services.semgrep.service import SemgrepService

async def start_semgrep_worker():
    print("[*] Semgrep Service listening on Redis channel 'scan:semgrep'...")
    redis_client = get_redis_client()
    pubsub = get_redis_pubsub(redis_client)
    await pubsub.subscribe("scan:semgrep")
    
    service = SemgrepService()
    
    async for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            asyncio.create_task(service.process_job(data))

if __name__ == "__main__":
    asyncio.run(start_semgrep_worker())
