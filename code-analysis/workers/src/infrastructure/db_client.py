import asyncpg
from typing import Optional
from src.infrastructure.config import DB_URL

_pool: Optional[asyncpg.Pool] = None

async def get_db_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(dsn=DB_URL, min_size=2, max_size=5)
    return _pool

async def execute_query(query: str, *args):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)

async def fetch_row(query: str, *args):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
