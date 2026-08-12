import asyncio
import json
from src.infrastructure.redis_client import get_redis_client, get_redis_pubsub
from src.services.codeql.service import CodeQLService

async def start_codeql_worker():
    print("[*] CodeQL Service listening on Redis channel 'scan:codeql'...")
    redis_client = get_redis_client()
    pubsub = get_redis_pubsub(redis_client)
    await pubsub.subscribe("scan:codeql")
    
    service = CodeQLService()
    
    async for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            asyncio.create_task(service.process_job(data))

if __name__ == "__main__":
    asyncio.run(start_codeql_worker())
