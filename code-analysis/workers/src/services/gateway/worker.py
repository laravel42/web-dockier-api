import asyncio
import json
from src.infrastructure.db_client import get_db_pool
from src.infrastructure.config import POLL_INTERVAL
from src.services.gateway.service import GatewayService

async def start_gateway_worker():
    print("[*] Dockier Security Gateway Worker running. Polling queue...")
    service = GatewayService()
    pool = await get_db_pool()
    
    async with pool.acquire() as conn:
        while True:
            job = await conn.fetchrow(
                """
                UPDATE pgboss.job 
                SET state = 'active', startedon = now()
                WHERE id = (
                    SELECT id FROM pgboss.job 
                    WHERE name = 'security-scan' AND state = 'created' 
                    ORDER BY keepuntil ASC 
                    FOR UPDATE SKIP LOCKED 
                    LIMIT 1
                )
                RETURNING id, data;
                """
            )
            
            if job:
                asyncio.create_task(service.process_job(str(job["id"]), json.loads(job["data"])))
            else:
                await asyncio.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    asyncio.run(start_gateway_worker())
