import asyncio
import json
from src.infrastructure.redis_client import get_redis_client, get_redis_pubsub
from src.services.sonarqube.service import SonarQubeService

async def start_sonarqube_worker():
    print("[*] SonarQube Service listening on Redis channel 'scan:sonarqube'...")
    redis_client = get_redis_client()
    pubsub = get_redis_pubsub(redis_client)
    await pubsub.subscribe("scan:sonarqube")
    
    service = SonarQubeService()
    
    async for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            asyncio.create_task(service.process_job(data))

if __name__ == "__main__":
    asyncio.run(start_sonarqube_worker())
